#!/usr/bin/env python3
"""Discover KOGL video cards that look like unedited camera/source clips.

This is deliberately a *content-form* discovery pass, not a licensing pass.
It retains the licence shown by the portal later in collection metadata, but
does not use that value to accept or reject a candidate.  A title signal is
not proof of either uneditedness or usable speech, so every record must still
pass the individual-page/HLS/audio probe in ``collect-kogl-unedited-preview``.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BASE_URL = "https://www.kogl.or.kr"
LIST_URL = f"{BASE_URL}/recommend/ajaxRecommendDivList.do?division=video"
DEFAULT_ROOT = Path("Faith-office/08_검증_정답셋/Faith_STT_수집_공공누리_2026-08-05")
DEFAULT_OUTPUT = DEFAULT_ROOT / "00_intake" / "kogl-unedited-video-candidates.jsonl"
USER_AGENT = "Faith-STT-unedited-video-discovery/2026-08-05"
REQUEST_DELAY_SEC = 0.18

# These strings describe source-shot or camera-operation records rather than a
# finished programme.  They are not enough to establish that speech is present.
STRONG_RAW_TERMS = (
    "일반촬영",
    "항공촬영",
    "수중촬영",
    "촬영본",
    "촬영 원본",
    "원시영상",
    "미편집",
    "무편집",
)
CAMERA_RAW_TERMS = (
    "고정",
    "패닝",
    "아크샷",
    "틸트",
    "롱샷",
    "클로즈업",
    "인서트",
    "붐업",
    "부감",
    "로우앵글",
    "아이레벨",
    "팔로우",
)
ACTIVITY_OR_SPEECH_TERMS = (
    "시연",
    "작업",
    "체험",
    "체험객",
    "가족",
    "명인",
    "어부",
    "상인",
    "시장",
    "축제",
    "공연",
    "행사",
    "회의",
    "토론",
    "대담",
    "간담",
    "공청",
    "인터뷰",
    "브리핑",
    "강연",
    "강의",
    "교육",
    "시민",
    "참가",
    "관객",
    "방문객",
)
FINISHED_WORK_TERMS = (
    "홍보",
    "광고",
    "뮤직비디오",
    "다큐",
    "드라마",
    "영화",
    "애니",
    "캠페인",
    "하이라이트",
    "티저",
    "메인영상",
    "홍보영상",
)
AMBIENT_ONLY_TERMS = (
    "드론",
    "항공촬영",
    "수중촬영",
    "풍경",
    "전경",
    "하늘",
    "바다",
    "파도",
    "꽃",
)


def compact_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def fetch_list(page: int, search_count: int, query: str, type_code: str) -> str:
    form = {
        "smallCode": "",
        "middleCode": "",
        "fontTypeCd": "",
        "imgViewType": "L",
        "searchSort": "ddate",
        "searchCnt": str(search_count),
        "cPage": str(page),
        "company": "",
        "orgCode": "",
        "searchStr": query,
        "atcTypeCode": type_code,
    }
    request = urllib.request.Request(
        LIST_URL,
        data=urllib.parse.urlencode(form).encode("utf-8"),
        headers={"User-Agent": USER_AGENT, "Referer": f"{BASE_URL}/"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read().decode("utf-8", "replace")


def parse_total(page_html: str) -> int:
    match = re.search(r'id="ajaxTotalCnt"\s+value="([0-9,]+)"', page_html)
    if not match:
        raise RuntimeError("KOGL list response omitted ajaxTotalCnt")
    return int(match.group(1).replace(",", ""))


def parse_items(page_html: str) -> list[tuple[str, str]]:
    items: list[tuple[str, str]] = []
    pattern = re.compile(
        r'<a\s+href="(?P<href>/recommend/recommendDivView\.do\?recommendIdx=(?P<idx>\d+)'
        r'&division=video[^\"]*)">(?P<body>.*?)</a>',
        re.S | re.I,
    )
    for match in pattern.finditer(page_html):
        title_match = re.search(
            r'<p\s+class="photo-list__title">(?P<title>.*?)</p>',
            match.group("body"),
            re.S | re.I,
        )
        if title_match:
            items.append((match.group("idx"), compact_text(title_match.group("title"))))
    if not items:
        raise RuntimeError("KOGL list response contained no parseable video cards")
    return items


def matched_terms(title: str, terms: tuple[str, ...]) -> list[str]:
    folded = title.casefold()
    return [term for term in terms if term.casefold() in folded]


def series_key(title: str) -> str:
    """Keep the visible collection prefix as a diversity/repetition hint."""
    key = re.split(r"[_:：]", title, maxsplit=1)[0].strip()
    return key or title


def classify(title: str) -> dict[str, Any]:
    strong_raw = matched_terms(title, STRONG_RAW_TERMS)
    camera_raw = matched_terms(title, CAMERA_RAW_TERMS)
    activity = matched_terms(title, ACTIVITY_OR_SPEECH_TERMS)
    finished = matched_terms(title, FINISHED_WORK_TERMS)
    ambient = matched_terms(title, AMBIENT_ONLY_TERMS)
    raw_score = 3 * len(strong_raw) + len(camera_raw)
    aerial_or_underwater = bool(
        {"항공촬영", "수중촬영"}.intersection(strong_raw)
        or "드론" in title
        or "수중" in title
    )

    if raw_score == 0:
        candidate_class = "not_raw_by_title"
        collection_priority = "exclude"
    elif finished:
        candidate_class = "likely_finished_or_promotional"
        collection_priority = "exclude"
    elif aerial_or_underwater:
        # Aerial/underwater records are normally raw camera material, but the
        # source audio is commonly absent or not useful for speech.  Keep them
        # discoverable without allowing an event word in the title to make them
        # high-priority STT candidates.
        candidate_class = "raw_ambient_audio_probe"
        collection_priority = "low"
    elif activity:
        candidate_class = "raw_activity_audio_probe"
        collection_priority = "high"
    elif ambient:
        candidate_class = "raw_ambient_audio_probe"
        collection_priority = "low"
    else:
        candidate_class = "raw_context_audio_probe"
        collection_priority = "medium"

    return {
        "candidateClass": candidate_class,
        "collectionPriority": collection_priority,
        "titleSignals": {
            "strongRaw": strong_raw,
            "cameraRaw": camera_raw,
            "activityOrSpeech": activity,
            "finishedWork": finished,
            "ambientOnly": ambient,
        },
        "rawnessStatus": "title_heuristic_only_requires_page_and_preview_review",
        "likelySourceGroup": series_key(title),
    }


def write_jsonl(path: Path, records: list[dict[str, Any]], overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise SystemExit(f"refusing to replace existing output: {path} (pass --overwrite after review)")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--query", default="", help="optional KOGL title/search query")
    parser.add_argument(
        "--atc-type-code",
        default="",
        help="KOGL type filter; empty string queries all types and is the default for this content-form pass",
    )
    parser.add_argument("--search-count", type=int, default=50, choices=(20, 30, 40, 50))
    parser.add_argument("--max-pages", type=int, help="cap pages for a safe discovery sample")
    parser.add_argument("--include-nonraw", action="store_true", help="write every returned card, not only raw candidates")
    parser.add_argument("--overwrite", action="store_true", help="replace an existing generated output")
    args = parser.parse_args()

    first_page = fetch_list(1, args.search_count, args.query, args.atc_type_code)
    total = parse_total(first_page)
    total_pages = (total + args.search_count - 1) // args.search_count
    pages_to_fetch = min(total_pages, args.max_pages) if args.max_pages else total_pages
    observed_at = datetime.now(timezone.utc).isoformat()

    seen: set[str] = set()
    records: list[dict[str, Any]] = []
    all_class_counts: Counter[str] = Counter()
    for page in range(1, pages_to_fetch + 1):
        payload = first_page if page == 1 else fetch_list(page, args.search_count, args.query, args.atc_type_code)
        for recommend_idx, title in parse_items(payload):
            if recommend_idx in seen:
                continue
            seen.add(recommend_idx)
            classification = classify(title)
            all_class_counts[classification["candidateClass"]] += 1
            if not args.include_nonraw and classification["collectionPriority"] == "exclude":
                continue
            records.append(
                {
                    "discoveredAt": observed_at,
                    "sourceFamily": "kogl_video_unedited_title_discovery",
                    "catalogFilter": {
                        "atcTypeCode": args.atc_type_code or "all",
                        "query": args.query,
                    },
                    "detailVerificationRequired": True,
                    "detailVerificationRule": (
                        "individual page, public HLS availability, audio-stream presence, and rawness review "
                        "must be checked before collection"
                    ),
                    "licenseGateApplied": False,
                    "recommendIdx": recommend_idx,
                    "catalogTitle": title,
                    "sourcePageUrl": (
                        f"{BASE_URL}/recommend/recommendDivView.do?division=video&recommendIdx={recommend_idx}"
                    ),
                    **classification,
                }
            )
        print(f"catalogued page {page}/{pages_to_fetch}: {len(seen)} cards, {len(records)} raw candidates", flush=True)
        if page < pages_to_fetch:
            time.sleep(REQUEST_DELAY_SEC)

    write_jsonl(args.output, records, args.overwrite)
    summary = {
        "discoveryVersion": "kogl-unedited-video-discovery-v0.1",
        "observedAt": observed_at,
        "catalogTotal": total,
        "pagesFetched": pages_to_fetch,
        "catalogFilter": {"atcTypeCode": args.atc_type_code or "all", "query": args.query},
        "includeNonraw": args.include_nonraw,
        "outputRecords": len(records),
        "allClassCounts": dict(sorted(all_class_counts.items())),
        "licenseGateApplied": False,
        "warning": "Title classification is not evidence of speech, audio, rawness, or source-original access.",
    }
    summary_path = args.output.with_suffix(".summary.json")
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"completed: {len(records)} candidate records from {total} catalog cards; output={args.output}")


if __name__ == "__main__":
    main()
