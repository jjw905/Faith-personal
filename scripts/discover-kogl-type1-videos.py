#!/usr/bin/env python3
"""Build a reviewable catalog of KOGL Type 1 video candidates.

This script intentionally stops at catalog discovery.  A result in the
catalog has only passed the portal list's Type 1 filter; the individual detail
page still has to be checked by ``collect-kogl-type1-preview.py`` before any
media is downloaded or counted as a collection candidate.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BASE_URL = "https://www.kogl.or.kr"
LIST_URL = f"{BASE_URL}/recommend/ajaxRecommendDivList.do?division=video"
DEFAULT_ROOT = Path("Faith-office/08_검증_정답셋/Faith_STT_수집_공공누리_2026-08-05")
DEFAULT_OUTPUT = DEFAULT_ROOT / "00_intake" / "kogl-type1-video-catalog.jsonl"
USER_AGENT = "Faith-STT-rights-audited-discovery/2026-08-05"
REQUEST_DELAY_SEC = 0.15

MULTI_SPEAKER_TERMS = (
    "회의",
    "토론",
    "대담",
    "간담",
    "공청",
    "인터뷰",
    "좌담",
    "대화",
    "기자회견",
    "브리핑",
    "포럼",
    "세미나",
    "발언",
    "연설",
)
SOLO_SPEAKER_TERMS = (
    "강의",
    "강연",
    "교육",
    "특강",
    "수업",
    "설명",
    "아카데미",
    "lecture",
)
HARD_CONDITION_TERMS = (
    "현장",
    "행사",
    "축제",
    "공연",
    "방송",
    "체험",
    "취재",
)
NON_SPEECH_TERMS = (
    "드론",
    "풍경",
    "항공영상",
    "타임랩스",
    "고정",
    "아크샷",
    "패닝",
    "틸트",
    "전경",
    "클로즈업",
)


def compact_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def fetch_list(page: int, search_count: int, query: str) -> str:
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
        "atcTypeCode": "1",
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
        r'&division=video[^"]*)">(?P<body>.*?)</a>',
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
    normalized = title.casefold()
    return [term for term in terms if term.casefold() in normalized]


def classify(title: str) -> dict[str, Any]:
    multi = matched_terms(title, MULTI_SPEAKER_TERMS)
    solo = matched_terms(title, SOLO_SPEAKER_TERMS)
    hard = matched_terms(title, HARD_CONDITION_TERMS)
    non_speech = matched_terms(title, NON_SPEECH_TERMS)

    if multi:
        suggested_domain = "natural_complex_review"
        suggested_bucket = "natural_complex"
    elif solo:
        suggested_domain = "solo_presentation_lecture_review"
        suggested_bucket = "clean_baseline"
    elif hard:
        suggested_domain = "field_or_event_review"
        suggested_bucket = "focused_diagnostic"
    else:
        suggested_domain = "unclassified_review"
        suggested_bucket = "unclassified"

    return {
        "suggestedDomain": suggested_domain,
        "suggestedBucket": suggested_bucket,
        "keywordSignals": {
            "multiSpeaker": multi,
            "soloSpeaker": solo,
            "hardCondition": hard,
            "likelyNonSpeech": non_speech,
        },
        "reviewPriority": "exclude_without_preview" if non_speech and not (multi or solo) else "review_preview",
    }


def write_catalog(path: Path, records: list[dict[str, Any]], overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise SystemExit(f"refusing to replace existing catalog: {path} (pass --overwrite after review)")
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records)
    path.write_text(payload, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--query", default="", help="optional KOGL title/search query")
    parser.add_argument("--search-count", type=int, default=50, choices=(20, 30, 40, 50))
    parser.add_argument("--max-pages", type=int, help="cap pages for a safe discovery sample")
    parser.add_argument("--overwrite", action="store_true", help="replace an existing generated catalog")
    args = parser.parse_args()

    first_page = fetch_list(page=1, search_count=args.search_count, query=args.query)
    total = parse_total(first_page)
    total_pages = (total + args.search_count - 1) // args.search_count
    pages_to_fetch = min(total_pages, args.max_pages) if args.max_pages else total_pages
    observed_at = datetime.now(timezone.utc).isoformat()

    seen: set[str] = set()
    records: list[dict[str, Any]] = []
    for page in range(1, pages_to_fetch + 1):
        response = first_page if page == 1 else fetch_list(page, args.search_count, args.query)
        for recommend_idx, title in parse_items(response):
            if recommend_idx in seen:
                continue
            seen.add(recommend_idx)
            record: dict[str, Any] = {
                "catalogObservedAt": observed_at,
                "sourceFamily": "kogl_type1_video_catalog",
                "catalogFilter": "atcTypeCode=1",
                "detailVerificationRequired": True,
                "detailVerificationRule": "collect-kogl-type1-preview.py must verify the individual page before media collection",
                "recommendIdx": recommend_idx,
                "catalogTitle": title,
                "sourcePageUrl": (
                    f"{BASE_URL}/recommend/recommendDivView.do?division=video&recommendIdx={recommend_idx}"
                ),
                **classify(title),
            }
            records.append(record)
        print(f"catalogued page {page}/{pages_to_fetch}: {len(records)} unique items", flush=True)
        if page < pages_to_fetch:
            time.sleep(REQUEST_DELAY_SEC)

    write_catalog(args.output, records, args.overwrite)
    print(
        f"completed: {len(records)} unique Type 1 catalog items from {total} matching records; "
        f"output={args.output}"
    )


if __name__ == "__main__":
    main()
