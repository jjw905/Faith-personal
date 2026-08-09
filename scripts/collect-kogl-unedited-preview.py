#!/usr/bin/env python3
"""Probe and retain KOGL public-preview clips that look like unedited footage.

The collector is intentionally explicit about what it retains:

* ``00_source_preview`` receives a stream-copy MP4 remux of the public HLS
  preview, never a claim that it is the portal's uploader/original master.
* ``01_audio`` receives a 16 kHz mono FLAC analysis derivative only when the
  preview has an audio stream.
* The portal's displayed licence is recorded but is not used as a selection
  gate in this user-requested raw-footage intake.
* A raw-looking title and an audio stream do not prove speech or suitability
  for STT; every retained item remains intake-only until listening/QC.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_공공누리_미편집_25시간_2026-08-05"
)
DEFAULT_MANIFEST = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_공공누리_2026-08-05"
) / "00_intake" / "kogl-unedited-video-candidates.jsonl"
COLLECTOR_VERSION = "kogl-unedited-preview-intake-v0.1"
USER_AGENT = "Faith-STT-unedited-preview-intake/2026-08-05"
HEADERS = {"User-Agent": USER_AGENT, "Referer": "https://www.kogl.or.kr/"}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_id(timestamp: str) -> str:
    return timestamp.replace("+00:00", "Z").replace("-", "").replace(":", "").replace(".", "-")


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


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


def extract_observed_license(page: str) -> str | None:
    type_block = re.search(r'<dl\s+class="type">.*?</dl>', page, re.S | re.I)
    if type_block:
        value = compact_text(type_block.group(0))
        if value:
            return value
    match = re.search(r"공공누리\s*(?:제\s*)?([0-4])\s*유형", compact_text(page), re.I)
    return f"KOGL Type {match.group(1)} (portal text fallback)" if match else None


def extract_iframe_url(page: str, source_page_url: str) -> str:
    relative = extract_one(r'<iframe\s+src="([^"]+)"', page, "preview iframe")
    return urllib.parse.urljoin(source_page_url, relative)


def extract_playlist_url(iframe: str, iframe_url: str) -> str:
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
            "-user_agent",
            USER_AGENT,
            "-headers",
            f"Referer: {HEADERS['Referer']}\r\n",
            "-show_entries",
            "format=duration,bit_rate,size:stream=index,codec_name,codec_type,sample_rate,channels,bit_rate,bits_per_raw_sample,width,height",
            "-of",
            "json",
            source,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def first_stream(probe: dict[str, Any], codec_type: str) -> dict[str, Any]:
    return next((stream for stream in probe.get("streams", []) if stream.get("codec_type") == codec_type), {})


def stream_summary(stream: dict[str, Any], fields: Iterable[str]) -> dict[str, Any]:
    return {field: stream.get(field) for field in fields}


def ffmpeg_run(args: list[str]) -> None:
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        detail = (result.stderr or result.stdout).strip().replace("\n", " ")
        raise RuntimeError(f"ffmpeg failed ({result.returncode}): {detail[-1200:]}")


def download_preview_video(playlist_url: str, destination: Path) -> None:
    partial = destination.with_name(f"{destination.stem}.part{destination.suffix}")
    if partial.exists():
        partial.unlink()
    ffmpeg_run(
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
            "0:v?",
            "-map",
            "0:a?",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            str(partial),
        ]
    )
    partial.replace(destination)


def download_audio(playlist_url: str, destination: Path) -> None:
    partial = destination.with_name(f"{destination.stem}.part{destination.suffix}")
    if partial.exists():
        partial.unlink()
    ffmpeg_run(
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
        ]
    )
    partial.replace(destination)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_manifest(path: Path) -> list[dict[str, Any]]:
    seen: set[str] = set()
    candidates: list[dict[str, Any]] = []
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        try:
            candidate = json.loads(raw)
        except json.JSONDecodeError as error:
            raise SystemExit(f"{path}:{line_number}: invalid JSON: {error}") from error
        for field in ("recommendIdx", "sourcePageUrl", "catalogTitle", "candidateClass"):
            if not candidate.get(field):
                raise SystemExit(f"{path}:{line_number}: missing {field}")
        candidate.setdefault("alias", f"kogl-{candidate['recommendIdx']}")
        if candidate["alias"] in seen:
            continue
        seen.add(candidate["alias"])
        candidates.append(candidate)
    return candidates


def interleave_source_groups(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Avoid draining one raw-footage series before trying other locations/events."""
    buckets: dict[str, deque[dict[str, Any]]] = defaultdict(deque)
    first_seen: list[str] = []
    for candidate in candidates:
        group = str(candidate.get("likelySourceGroup") or candidate["alias"])
        if not buckets[group]:
            first_seen.append(group)
        buckets[group].append(candidate)
    ordered: list[dict[str, Any]] = []
    while True:
        added = False
        for group in first_seen:
            if buckets[group]:
                ordered.append(buckets[group].popleft())
                added = True
        if not added:
            return ordered


def free_space_gib(path: Path) -> float:
    return shutil.disk_usage(path).free / (1024**3)


def build_metadata(candidate: dict[str, Any], root: Path) -> tuple[dict[str, Any], str, bool]:
    source_page_url = candidate["sourcePageUrl"]
    source_page_bytes = fetch_bytes(source_page_url)
    source_page = source_page_bytes.decode("utf-8", "replace")
    iframe_url = extract_iframe_url(source_page, source_page_url)
    iframe_bytes = fetch_bytes(iframe_url)
    iframe = iframe_bytes.decode("utf-8", "replace")
    playlist_url = extract_playlist_url(iframe, iframe_url)
    playlist_bytes = fetch_bytes(playlist_url)
    playlist = playlist_bytes.decode("utf-8", "replace")
    source_probe = ffprobe_json(playlist_url)
    source_audio = first_stream(source_probe, "audio")
    source_video = first_stream(source_probe, "video")
    source_duration_sec = hls_duration_sec(playlist)
    alias = candidate["alias"]
    source_path = root / "00_source_preview" / f"{alias}.mp4"
    audio_path = root / "01_audio" / f"{alias}.flac"
    metadata = {
        **candidate,
        "pageTitle": extract_title(source_page),
        "provider": extract_provider(source_page),
        "filmedYear": extract_year(source_page),
        "portalReportedFileSizeMB": extract_file_size_mb(source_page),
        "observedPortalLicense": extract_observed_license(source_page),
        "licenseGateApplied": False,
        "rightsStatus": "observed_portal_notice_not_used_as_collection_gate",
        "sourcePageSha256": sha256_bytes(source_page_bytes),
        "previewIframeUrl": iframe_url,
        "previewIframeSha256": sha256_bytes(iframe_bytes),
        "previewPlaylistUrl": playlist_url,
        "previewPlaylistSha256": sha256_bytes(playlist_bytes),
        "sourceDurationSec": source_duration_sec,
        "sourceProbe": {
            "container": "HLS MPEG-TS public preview",
            "audio": stream_summary(
                source_audio,
                ("codec_name", "sample_rate", "channels", "bit_rate", "bits_per_raw_sample"),
            )
            if source_audio
            else None,
            "video": stream_summary(
                source_video,
                ("codec_name", "width", "height", "bit_rate"),
            )
            if source_video
            else None,
            "ffprobeFormat": source_probe.get("format", {}),
        },
        "hasAudioStream": bool(source_audio),
        "sourceOriginalStatus": "public_preview_hls_remux_not_portal_original_master",
        "sourceOrDerived": "public_preview_video_source_and_derived_audio_when_audio_exists",
        "sourcePath": str(source_path),
        "audioPath": str(audio_path),
        "derivation": "public HLS preview stream-copy MP4 -> 16kHz mono FLAC",
        "transcodeCount": 1,
        "rawnessStatus": "title_heuristic_only_requires_human_visual_and_listening_qc",
        "audioSentExternally": False,
        "trainingEligible": False,
        "goldStatus": "none",
        "split": "intake_pending",
        "modelTaskEligibility": {
            "asr": "unreviewed_preview_audio",
            "diarization": "unreviewed_no_human_speaker_or_overlap_evidence",
            "wordTiming": "not_evidenced_no_word_gold",
            "meetingSummary": "not_evidenced_raw_clip_without_meeting_gold",
        },
        "promotionBlockers": [
            "human_rawness_review",
            "speech_music_and_silence_qc",
            "speaker_and_overlap_annotation",
            "split_leakage_and_source_group_review",
            "source_original_access_or_documented_preview_only_exception",
            "separate_rights_review_before_product_or_training_promotion",
        ],
    }
    return metadata, playlist_url, bool(source_audio)


def apply_existing_file_metadata(metadata: dict[str, Any], source_path: Path, audio_path: Path) -> dict[str, Any]:
    if source_path.exists():
        metadata["sourceSha256"] = sha256_file(source_path)
        metadata["sourceFileSizeBytes"] = source_path.stat().st_size
        metadata["sourcePath"] = str(source_path)
    else:
        metadata["sourceSha256"] = None
        metadata["sourceFileSizeBytes"] = None
        metadata["sourcePath"] = None
    if audio_path.exists():
        derived_probe = ffprobe_json(str(audio_path))
        derived_audio = first_stream(derived_probe, "audio")
        metadata["derivedSha256"] = sha256_file(audio_path)
        metadata["derivedFileSizeBytes"] = audio_path.stat().st_size
        metadata["audioPath"] = str(audio_path)
        metadata["derivedProbe"] = {
            "audio": stream_summary(
                derived_audio,
                ("codec_name", "sample_rate", "channels", "bit_rate", "bits_per_raw_sample"),
            ),
            "durationSec": derived_probe.get("format", {}).get("duration"),
        }
    else:
        metadata["derivedSha256"] = None
        metadata["derivedFileSizeBytes"] = None
        metadata["audioPath"] = None
        metadata["derivedProbe"] = None
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--only", nargs="*", help="probe/collect only these aliases")
    parser.add_argument("--max-candidates", type=int, help="cap this run after priority/group ordering")
    parser.add_argument(
        "--priorities",
        nargs="+",
        choices=("high", "medium", "low"),
        default=("high", "medium", "low"),
        help="candidate priorities to include; default probes all title-based raw candidates",
    )
    parser.add_argument(
        "--reprobe-existing",
        action="store_true",
        help="include candidates that already have per-item metadata; normally a resumed probe skips them",
    )
    parser.add_argument("--max-hours", type=float, default=25.0, help="stop after retaining this many complete preview hours")
    parser.add_argument("--min-duration-sec", type=float, default=8.0, help="skip shorter clips after probing")
    parser.add_argument("--min-free-space-gib", type=float, default=8.0, help="stop before the filesystem falls below this reserve")
    parser.add_argument("--probe-only", action="store_true", help="write per-item metadata without downloading any media")
    parser.add_argument("--no-retain-preview-video", action="store_true", help="retain only the FLAC derivative after probe")
    parser.add_argument("--force", action="store_true", help="replace an existing source-preview/FLAC pair")
    args = parser.parse_args()

    if args.max_hours <= 0 or args.min_duration_sec < 0 or args.min_free_space_gib < 0:
        raise SystemExit("max-hours must be positive; duration/free-space limits cannot be negative")
    for directory in ("00_intake", "00_source_preview", "01_audio", "02_references", "03_meta", "04_qa"):
        (args.root / directory).mkdir(parents=True, exist_ok=True)

    candidates = read_manifest(args.manifest)
    candidates = [item for item in candidates if item.get("collectionPriority") in set(args.priorities)]
    priority_order = {"high": 0, "medium": 1, "low": 2}
    candidates.sort(key=lambda item: priority_order.get(item.get("collectionPriority"), 99))
    candidates = interleave_source_groups(candidates)
    existing_metadata_count = 0
    if args.only:
        only = set(args.only)
        candidates = [item for item in candidates if item["alias"] in only]
    elif not args.reprobe_existing:
        before_resume_filter = len(candidates)
        candidates = [
            item
            for item in candidates
            if not (args.root / "03_meta" / f"{item['alias']}.json").exists()
        ]
        existing_metadata_count = before_resume_filter - len(candidates)
    if args.max_candidates is not None:
        if args.max_candidates <= 0:
            raise SystemExit("max-candidates must be positive when supplied")
        candidates = candidates[: args.max_candidates]

    started_at = utc_now()
    current_run_id = run_id(started_at)
    run_config = {
        "collectorVersion": COLLECTOR_VERSION,
        "runId": current_run_id,
        "startedAt": started_at,
        "manifest": str(args.manifest),
        "root": str(args.root),
        "targetHours": args.max_hours,
        "maxCandidates": args.max_candidates,
        "priorities": list(args.priorities),
        "reprobeExisting": args.reprobe_existing,
        "existingMetadataSkippedBeforeRun": existing_metadata_count,
        "minDurationSec": args.min_duration_sec,
        "minFreeSpaceGiB": args.min_free_space_gib,
        "probeOnly": args.probe_only,
        "retainPreviewVideo": not args.no_retain_preview_video,
        "licenseGateApplied": False,
        "rawnessGate": "title heuristic plus public-preview and audio-stream probe; human QC pending",
        "sourcePolicy": "public HLS preview remux, not uploader/original master",
    }
    write_json(args.root / "00_intake" / "run-config.json", run_config)
    summary: dict[str, Any] = {
        **run_config,
        "requested": len(candidates),
        "processed": [],
        "skipped": [],
        "errors": [],
        "retainedDurationSec": 0.0,
        "audioPresentDurationSec": 0.0,
        "retainedSourceBytes": 0,
        "retainedDerivedBytes": 0,
    }

    for candidate in candidates:
        if not args.probe_only and summary["retainedDurationSec"] / 3600 >= args.max_hours:
            summary["stoppedReason"] = "target_hours_reached"
            break
        if not args.probe_only and free_space_gib(args.root) < args.min_free_space_gib:
            summary["stoppedReason"] = "minimum_free_space_reserve_reached"
            break
        alias = candidate["alias"]
        source_path = args.root / "00_source_preview" / f"{alias}.mp4"
        audio_path = args.root / "01_audio" / f"{alias}.flac"
        metadata_path = args.root / "03_meta" / f"{alias}.json"
        print(f"probing {alias}: {candidate['catalogTitle']}", flush=True)
        try:
            metadata, playlist_url, has_audio = build_metadata(candidate, args.root)
            duration = float(metadata["sourceDurationSec"])
            if duration < args.min_duration_sec:
                metadata["collectionStatus"] = "skipped_short_preview"
                metadata["collectedAt"] = utc_now()
                write_json(metadata_path, metadata)
                summary["skipped"].append({"alias": alias, "reason": "short_preview", "durationSec": duration})
                continue
            if not has_audio:
                metadata["collectionStatus"] = "skipped_no_audio_stream"
                metadata["collectedAt"] = utc_now()
                write_json(metadata_path, metadata)
                summary["skipped"].append({"alias": alias, "reason": "no_audio_stream", "durationSec": duration})
                continue
            if not args.probe_only:
                if args.force or not source_path.exists():
                    if not args.no_retain_preview_video:
                        download_preview_video(playlist_url, source_path)
                if args.force or not audio_path.exists():
                    download_audio(playlist_url, audio_path)
                if not args.no_retain_preview_video and not source_path.exists():
                    raise RuntimeError("source preview video was not retained")
                if not audio_path.exists():
                    raise RuntimeError("derived audio was not retained")
            metadata = apply_existing_file_metadata(metadata, source_path, audio_path)
            metadata["collectionStatus"] = "probed_audio_present" if args.probe_only else "retained_preview_and_audio"
            metadata["collectedAt"] = utc_now()
            write_json(metadata_path, metadata)
            summary["processed"].append(
                {
                    "alias": alias,
                    "catalogTitle": candidate["catalogTitle"],
                    "likelySourceGroup": candidate.get("likelySourceGroup"),
                    "durationSec": duration,
                    "hasAudioStream": True,
                    "sourceSha256": metadata["sourceSha256"],
                    "derivedSha256": metadata["derivedSha256"],
                }
            )
            summary["audioPresentDurationSec"] += duration
            if not args.probe_only:
                summary["retainedDurationSec"] += duration
                summary["retainedSourceBytes"] += metadata["sourceFileSizeBytes"] or 0
                summary["retainedDerivedBytes"] += metadata["derivedFileSizeBytes"] or 0
            print(f"  ok {duration:.1f}s audio=yes", flush=True)
        except Exception as error:
            summary["errors"].append({"alias": alias, "error": str(error)})
            print(f"  failed: {error}", file=sys.stderr, flush=True)

    summary["finishedAt"] = utc_now()
    summary["retainedAudioHours"] = summary["retainedDurationSec"] / 3600
    summary["audioPresentHours"] = summary["audioPresentDurationSec"] / 3600
    summary["freeSpaceGiBAtFinish"] = free_space_gib(args.root)
    write_json(args.root / "00_intake" / "collection-summary.json", summary)
    write_json(args.root / "00_intake" / "runs" / f"{current_run_id}.json", summary)
    print(
        f"completed: {len(summary['processed'])} audio-present candidates, "
        f"{summary['retainedAudioHours']:.2f} retained hours, "
        f"{len(summary['skipped'])} skipped, {len(summary['errors'])} errors",
        flush=True,
    )
    if summary["errors"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
