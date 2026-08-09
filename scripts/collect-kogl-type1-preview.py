#!/usr/bin/env python3
"""Collect a rights-audited public-preview intake from KOGL Type 1 videos.

This collector is intentionally conservative:

* it verifies the individual content page is KOGL Type 1 before downloading;
* it only keeps a 16 kHz mono FLAC *derivative* of the public HLS preview;
* it never represents that preview as the portal's original MP4; and
* it keeps every result out of train/gold/sealed splits until human QC and
  attribution/review are complete.

KOGL's Type 1 licence permits commercial use and derivatives with attribution,
but the portal's original-file request process still requires a human applicant.
The source-page URL, licence text, iframe URL, playlist fingerprint, and that
original-access limitation are all retained in metadata.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_공공누리_2026-08-05"
)
DEFAULT_MANIFEST = DEFAULT_ROOT / "00_intake" / "candidates.jsonl"
COLLECTOR_VERSION = "kogl-type1-preview-intake-v0.1"
USER_AGENT = "Faith-STT-rights-audited-intake/2026-08-05"
HEADERS = {"User-Agent": USER_AGENT, "Referer": "https://www.kogl.or.kr/"}


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def fetch_text(url: str) -> str:
    return fetch_bytes(url).decode("utf-8", "replace")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compact_text(value: str) -> str:
    value = re.sub(r"<(?:script|style)[^>]*>.*?</(?:script|style)>", " ", value, flags=re.S | re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def extract_one(pattern: str, value: str, label: str) -> str:
    match = re.search(pattern, value, re.S | re.I)
    if not match:
        raise RuntimeError(f"could not find {label}")
    return html.unescape(match.group(1)).strip()


def extract_title(page: str) -> str:
    return compact_text(extract_one(r'list-subject--view">(.*?)</h2>', page, "title"))


def extract_provider(page: str) -> str:
    match = re.search(r"<strong>소장기관</strong>\s*:\s*(?:<a[^>]*>)?\s*([^<\n]+)", page, re.S)
    return compact_text(match.group(1)) if match else ""


def extract_year(page: str) -> str:
    match = re.search(r"<strong>촬영연도</strong>\s*:\s*([^<\n]+)", page, re.S)
    return compact_text(match.group(1)) if match else ""


def extract_file_size_mb(page: str) -> float | None:
    match = re.search(r"<dt>저작물 정보</dt>\s*<dd>\s*([0-9.,]+)\s*MB", page, re.S)
    return float(match.group(1).replace(",", "")) if match else None


def assert_kogl_type_1(page: str) -> str:
    # Do not infer Type 1 from neighbouring/related content cards. The detail
    # page's own licence is in ``dl.type``; related cards can carry any type.
    match = re.search(
        r'<dl\s+class="type">.*?class="dialogOpencode1".*?<p>.*?제1유형\s*:\s*출처표시\s*조건에 따라 이용 할 수 있습니다',
        page,
        re.S | re.I,
    )
    if not match:
        raise RuntimeError("source page is not an individually verified KOGL Type 1 item")
    return "KOGL Type 1 (attribution; commercial use and derivatives allowed)"


def extract_iframe_url(page: str, source_page_url: str) -> str:
    relative = extract_one(r'<iframe\s+src="([^"]+)"', page, "preview iframe")
    return urllib.parse.urljoin(source_page_url, relative)


def extract_playlist_url(iframe: str, iframe_url: str) -> str:
    # The player currently serializes sources into JS with an escaped URL.
    candidates = re.findall(r'(?:https?:)?\\?/\\?/[^"\'\s]+?index\.m3u8', iframe)
    if not candidates:
        candidates = re.findall(r'(?:https?:)?//[^"\'\s]+?index\.m3u8', iframe)
    if not candidates:
        raise RuntimeError("preview iframe did not expose an HLS playlist")
    playlist = html.unescape(candidates[0]).replace("\\/", "/")
    return urllib.parse.urljoin(iframe_url, playlist)


def hls_duration_sec(playlist: str) -> float:
    durations = [float(value) for value in re.findall(r"^#EXTINF:([0-9.]+)", playlist, re.M)]
    if not durations:
        raise RuntimeError("HLS playlist has no VOD segment durations")
    return round(sum(durations), 3)


def ffprobe_json(source: str) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,bit_rate:stream=index,codec_name,codec_type,sample_rate,channels,bit_rate,bits_per_raw_sample",
            "-of",
            "json",
            source,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def first_audio_stream(probe: dict[str, Any]) -> dict[str, Any]:
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == "audio":
            return stream
    return {}


def download_audio(playlist_url: str, destination: Path) -> None:
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
            USER_AGENT,
            "-headers",
            f"Referer: {HEADERS['Referer']}\r\n",
            "-i",
            playlist_url,
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


def read_manifest(path: Path) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        try:
            candidate = json.loads(raw)
        except json.JSONDecodeError as error:
            raise SystemExit(f"{path}:{line_number}: invalid JSON: {error}") from error
        for field in ("alias", "recommendIdx", "sourcePageUrl", "primaryDomain", "primaryBucket"):
            if not candidate.get(field):
                raise SystemExit(f"{path}:{line_number}: missing {field}")
        candidates.append(candidate)
    return candidates


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def collect(candidate: dict[str, Any], root: Path, force: bool, probe_only: bool) -> dict[str, Any]:
    source_page_url = candidate["sourcePageUrl"]
    source_page_bytes = fetch_bytes(source_page_url)
    source_page = source_page_bytes.decode("utf-8", "replace")
    licence = assert_kogl_type_1(source_page)
    iframe_url = extract_iframe_url(source_page, source_page_url)
    iframe_bytes = fetch_bytes(iframe_url)
    iframe = iframe_bytes.decode("utf-8", "replace")
    playlist_url = extract_playlist_url(iframe, iframe_url)
    playlist_bytes = fetch_bytes(playlist_url)
    playlist = playlist_bytes.decode("utf-8", "replace")
    source_duration_sec = hls_duration_sec(playlist)
    source_probe = ffprobe_json(playlist_url)
    source_audio = first_audio_stream(source_probe)

    alias = candidate["alias"]
    audio_path = root / "01_audio" / f"{alias}.flac"
    metadata_path = root / "03_meta" / f"{alias}.json"
    if not probe_only and (force or not audio_path.exists()):
        download_audio(playlist_url, audio_path)

    derived_probe = ffprobe_json(str(audio_path)) if audio_path.exists() else {}
    derived_audio = first_audio_stream(derived_probe)
    metadata: dict[str, Any] = {
        **candidate,
        "pageTitle": extract_title(source_page),
        "provider": extract_provider(source_page),
        "filmedYear": extract_year(source_page),
        "portalReportedFileSizeMB": extract_file_size_mb(source_page),
        "sourceLicense": licence,
        "licenseEvidenceUrl": source_page_url,
        "sourcePageSha256": sha256_bytes(source_page_bytes),
        "previewIframeUrl": iframe_url,
        "previewIframeSha256": sha256_bytes(iframe_bytes),
        "previewPlaylistUrl": playlist_url,
        "previewPlaylistSha256": sha256_bytes(playlist_bytes),
        "sourceDurationSec": source_duration_sec,
        "sourceProbe": {
            "container": "HLS MPEG-TS public preview",
            "codec": source_audio.get("codec_name"),
            "sampleRate": source_audio.get("sample_rate"),
            "channels": source_audio.get("channels"),
            "bitrate": source_audio.get("bit_rate"),
            "bitDepth": source_audio.get("bits_per_raw_sample"),
        },
        "sourceOriginalStatus": "not_retained_portal_original_request_requires_human_acceptance",
        "sourceSha256": None,
        "sourceOrDerived": "derived_preview_audio",
        "derivation": "KOGL Type 1 public HLS preview -> 16kHz mono FLAC",
        "transcodeCount": 1,
        "audioPath": str(audio_path) if audio_path.exists() else None,
        "derivedSha256": sha256_file(audio_path) if audio_path.exists() else None,
        "derivedProbe": {
            "codec": derived_audio.get("codec_name"),
            "sampleRate": derived_audio.get("sample_rate"),
            "channels": derived_audio.get("channels"),
            "bitrate": derived_audio.get("bit_rate"),
            "bitDepth": derived_audio.get("bits_per_raw_sample"),
            "durationSec": derived_probe.get("format", {}).get("duration"),
        },
        "collectedAt": datetime.now(timezone.utc).isoformat(),
        "collectorVersion": COLLECTOR_VERSION,
        "audioSentExternally": False,
        "trainingEligible": False,
        "goldStatus": "none",
        "split": "intake_pending",
        "rightsStatus": "kogl_type_1_attribution_required_pending_human_qc",
        "promotionBlockers": [
            "human_listening_qc",
            "speaker_and_overlap_annotation",
            "split_leakage_review",
            "source_original_request_or_documented_preview_only_exception",
            "attribution_registry",
        ],
    }
    write_json(metadata_path, metadata)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--only", nargs="*", help="collect only these aliases")
    parser.add_argument("--force", action="store_true", help="replace an existing FLAC derivative")
    parser.add_argument("--probe-only", action="store_true", help="write rights and preview metadata without audio")
    args = parser.parse_args()

    for directory in ("00_intake", "01_audio", "02_references", "03_meta", "04_qa"):
        (args.root / directory).mkdir(parents=True, exist_ok=True)

    candidates = read_manifest(args.manifest)
    if args.only:
        selected = set(args.only)
        candidates = [item for item in candidates if item["alias"] in selected]

    summary: dict[str, Any] = {
        "collectorVersion": COLLECTOR_VERSION,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "manifest": str(args.manifest),
        "root": str(args.root),
        "probeOnly": args.probe_only,
        "requested": len(candidates),
        "collected": [],
        "errors": [],
    }
    for candidate in candidates:
        alias = candidate["alias"]
        print(f"collecting {alias} ...", flush=True)
        try:
            metadata = collect(candidate, args.root, args.force, args.probe_only)
            summary["collected"].append(
                {
                    "alias": alias,
                    "sourceDurationSec": metadata["sourceDurationSec"],
                    "derivedSha256": metadata["derivedSha256"],
                }
            )
            print(f"  ok {metadata['sourceDurationSec']:.1f}s", flush=True)
        except Exception as error:
            summary["errors"].append({"alias": alias, "error": str(error)})
            print(f"  failed: {error}", file=sys.stderr, flush=True)

    summary["finishedAt"] = datetime.now(timezone.utc).isoformat()
    summary["acceptedDurationSec"] = round(
        sum(item["sourceDurationSec"] for item in summary["collected"]), 3
    )
    summary["acceptedAudioHours"] = summary["acceptedDurationSec"] / 3600
    write_json(args.root / "00_intake" / "collection-summary.json", summary)
    print(
        f"completed: {len(summary['collected'])}/{summary['requested']} sources, "
        f"{summary['acceptedAudioHours']:.2f} audio hours, "
        f"{len(summary['errors'])} errors"
    )
    if summary["errors"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
