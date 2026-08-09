#!/usr/bin/env python3
"""Collect official Korea.kr briefing audio and transcript candidates.

The output is an intake batch only. It is deliberately not a training or sealed
test set until video rights, human labels, split membership, and QC are complete.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_MANIFEST = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_파일럿_2026-08-05/00_intake/candidates.jsonl"
)
DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_파일럿_2026-08-05"
)
PAGE_TEMPLATE = "https://www.korea.kr/briefing/policyBriefingView.do?newsId={}"
HEADERS = {
    "User-Agent": "Mozilla/5.0 Faith-STT-internal-evaluation/2026-08-05",
    "Referer": "https://www.korea.kr/",
}
COLLECTOR_VERSION = "stt-pilot-intake-v0.1"


def fetch(url: str) -> str:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read().decode("utf-8", "replace")


def strip_tags(fragment: str) -> str:
    fragment = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", fragment, flags=re.S)
    fragment = re.sub(r"<br\s*/?>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"</p>", "\n", fragment, flags=re.I)
    fragment = re.sub(r"<[^>]+>", " ", fragment)
    return html.unescape(fragment)


def extract_body(page: str) -> str:
    match = re.search(
        r'class="view_cont"(.*?)(?:<div class="(?:view_bottom|share)|</article)',
        page,
        re.S,
    )
    chunk = match.group(1) if match else page
    text = strip_tags(chunk)
    tail_marks = ("<끝>", "공공누리 출처표시", "<자료출처=", "이전다음기사")
    cut_points = [text.find(mark) for mark in tail_marks if text.find(mark) > 0]
    if cut_points:
        text = text[: min(cut_points)]
    lines = [re.sub(r"[ \t\u00a0]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line and len(line) > 1)


def extract_title(page: str) -> str:
    match = re.search(r"<title>(.*?)</title>", page, re.S | re.I)
    if not match:
        return ""
    return re.sub(r"\s+", " ", strip_tags(match.group(1))).strip()


def extract_published_date(page: str) -> str:
    match = re.search(r"(20\d{2}\.\d{2}\.\d{2})", strip_tags(page))
    return match.group(1) if match else ""


def extract_video_url(page: str) -> str | None:
    patterns = (
        r'<source[^>]+src="(https?://[^" ]+\.(?:mp4|m3u8)(?:\?[^" ]*)?)"',
        r'((?:https?:)?//[^" ]+\.(?:mp4|m3u8)(?:\?[^" ]*)?)',
    )
    for pattern in patterns:
        match = re.search(pattern, page, re.I)
        if match:
            return html.unescape(match.group(1))
    return None


def split_reference_turns(body: str) -> list[dict[str, str]]:
    marked = re.sub(r"<\s*(질문|답변|사회자|발표)\s*>", r"\n\1\t", body)
    turns: list[dict[str, str]] = []
    for line in marked.split("\n"):
        line = line.strip()
        if not line:
            continue
        if "\t" in line:
            role, text = line.split("\t", 1)
        else:
            role, text = "발표", line
        text = text.strip()
        if text:
            turns.append({"role": role, "text": text})
    return turns


def run_text(command: list[str]) -> str:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return result.stdout.strip()


def probe_duration(path_or_url: str) -> float:
    output = run_text(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            path_or_url,
        ]
    )
    return float(output)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_audio(video_url: str, destination: Path) -> None:
    partial = destination.with_name(f"{destination.stem}.part{destination.suffix}")
    if partial.exists():
        partial.unlink()
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-user_agent",
            HEADERS["User-Agent"],
            "-headers",
            f"Referer: {HEADERS['Referer']}\r\n",
            "-i",
            video_url,
            "-map",
            "0:a:0",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "flac",
            str(partial),
        ],
        check=True,
    )
    partial.replace(destination)


def load_candidates(path: Path) -> list[dict]:
    candidates: list[dict] = []
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        try:
            candidate = json.loads(raw)
        except json.JSONDecodeError as error:
            raise SystemExit(f"{path}:{line_number}: invalid JSON: {error}") from error
        for field in ("alias", "newsId", "sourceUrl", "plannedDomain", "plannedBucket"):
            if not candidate.get(field):
                raise SystemExit(f"{path}:{line_number}: missing {field}")
        candidates.append(candidate)
    return candidates


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def collect(candidate: dict, root: Path, force: bool) -> dict:
    alias = candidate["alias"]
    source_url = candidate.get("sourceUrl") or PAGE_TEMPLATE.format(candidate["newsId"])
    page = fetch(source_url)
    body = extract_body(page)
    turns = split_reference_turns(body)
    video_url = extract_video_url(page)
    if not video_url:
        raise RuntimeError("official page did not expose an mp4/m3u8 source")

    audio_path = root / "01_audio" / f"{alias}.flac"
    reference_path = root / "02_references" / f"{alias}.reference.txt"
    if force or not audio_path.exists():
        download_audio(video_url, audio_path)
    duration_sec = probe_duration(str(audio_path))
    reference_path.write_text(body + "\n", encoding="utf-8")

    collected_at = datetime.now(timezone.utc).isoformat()
    metadata = {
        **candidate,
        "sourceUrl": source_url,
        "videoUrl": video_url,
        "pageTitle": extract_title(page),
        "publishedDate": extract_published_date(page),
        "durationSec": round(duration_sec, 3),
        "audioPath": str(audio_path),
        "referencePath": str(reference_path),
        "referenceCharCount": len(body),
        "referenceTurnsByMarker": len(turns),
        "audioSha256": sha256(audio_path),
        "collectedAt": collected_at,
        "collectorVersion": COLLECTOR_VERSION,
        "audioSentExternally": False,
        "trainingEligible": False,
        "goldStatus": "none",
        "split": "pilot_pending",
        "rightsStatus": "internal_evaluation_only_pending_video_rights",
    }
    write_json(root / "03_meta" / f"{alias}.json", metadata)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--only", nargs="*", help="collect only these aliases")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    for directory in ("00_intake", "01_audio", "02_references", "03_meta", "04_qa"):
        (args.root / directory).mkdir(parents=True, exist_ok=True)

    candidates = load_candidates(args.manifest)
    if args.only:
        selected = set(args.only)
        candidates = [candidate for candidate in candidates if candidate["alias"] in selected]

    summary: dict = {
        "collectorVersion": COLLECTOR_VERSION,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "manifest": str(args.manifest),
        "root": str(args.root),
        "requested": len(candidates),
        "collected": [],
        "errors": [],
    }
    for candidate in candidates:
        alias = candidate["alias"]
        print(f"collecting {alias} ...", flush=True)
        try:
            metadata = collect(candidate, args.root, args.force)
            summary["collected"].append(
                {"alias": alias, "durationSec": metadata["durationSec"], "audioSha256": metadata["audioSha256"]}
            )
            print(f"  ok {metadata['durationSec']:.1f}s", flush=True)
        except Exception as error:  # keep the rest of the intake batch moving
            summary["errors"].append({"alias": alias, "error": str(error)})
            print(f"  failed: {error}", file=sys.stderr, flush=True)

    summary["finishedAt"] = datetime.now(timezone.utc).isoformat()
    summary["acceptedDurationSec"] = round(
        sum(item["durationSec"] for item in summary["collected"]), 3
    )
    write_json(args.root / "00_intake" / "collection-summary.json", summary)
    print(
        f"completed: {len(summary['collected'])}/{summary['requested']} sources, "
        f"{summary['acceptedDurationSec'] / 3600:.2f} audio hours, "
        f"{len(summary['errors'])} errors"
    )
    if summary["errors"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
