#!/usr/bin/env python3
"""Retain public hearing/debate MP4 renditions as diagnostic candidates.

This collector is intentionally separate from the CC-BY collector.  The
selected videos are public official-channel recordings, but their YouTube
licence/ownership chain is not treated as a training-rights decision here.
They are kept for internal diagnostic review only until human listening,
speaker/overlap annotation, provenance review, and split review are complete.

The collector keeps the selected platform MP4 rendition and any available
Korean automatic caption as a non-gold reference.  It does not create FLAC or
any other persistent audio derivative.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_상황진단_공식공청회_2026-08-06"
)
DEFAULT_MANIFEST = DEFAULT_ROOT / "00_intake" / "candidates.jsonl"
COLLECTOR_VERSION = "public-hearing-source-video-diagnostic-v0.1"
USER_AGENT = "Faith-STT-public-hearing-diagnostic/2026-08-06"
MIN_DURATION_SEC = 300.0
# Muxed 360p MP4 keeps the audio stream in an MP4/M4A-compatible container
# without creating a second audio file.  The fallback is deliberately narrow.
SOURCE_FORMATS = (
    "18",
    "399+251",
    "137+251",
    "247+251",
    "136+251",
    "b[ext=mp4][acodec!=none]",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=capture, text=True)
    if result.returncode:
        detail = (result.stderr or result.stdout or "").strip().replace("\n", " ")
        raise RuntimeError(f"command failed ({result.returncode}): {detail[-1800:]}")
    return result


def run_json(command: list[str]) -> dict[str, Any]:
    return json.loads(run(command, capture=True).stdout)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def yt_info(url: str) -> dict[str, Any]:
    return run_json(
        [
            "yt-dlp",
            "--no-download",
            "--no-warnings",
            "--user-agent",
            USER_AGENT,
            "--dump-single-json",
            "--",
            url,
        ]
    )


def ffprobe_json(path: Path) -> dict[str, Any]:
    return run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate:stream=index,codec_name,codec_type,sample_rate,channels,channel_layout,bit_rate,bits_per_raw_sample,width,height",
            "-of",
            "json",
            str(path),
        ]
    )


def first_stream(probe: dict[str, Any], codec_type: str) -> dict[str, Any] | None:
    return next(
        (stream for stream in probe.get("streams", []) if stream.get("codec_type") == codec_type),
        None,
    )


def stream_summary(stream: dict[str, Any] | None) -> dict[str, Any] | None:
    if stream is None:
        return None
    return {
        "codec": stream.get("codec_name"),
        "sampleRate": stream.get("sample_rate"),
        "channels": stream.get("channels"),
        "channelLayout": stream.get("channel_layout"),
        "bitrate": stream.get("bit_rate"),
        "bitDepth": stream.get("bits_per_raw_sample"),
        "width": stream.get("width"),
        "height": stream.get("height"),
    }


def duration_from_probe(probe: dict[str, Any]) -> float:
    return float(probe.get("format", {}).get("duration") or 0.0)


def duration_from_info(info: dict[str, Any]) -> float:
    return float(info.get("duration") or 0.0)


def korean_auto_caption_languages(info: dict[str, Any]) -> list[str]:
    return sorted(
        language
        for language in (info.get("automatic_captions") or {})
        if language == "ko" or language.startswith("ko-")
    )


def canonical_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def download_source(url: str, destination: Path, *, force: bool) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and destination.stat().st_size and not force:
        return "existing_local_retained_source"
    errors: list[str] = []
    for selector in SOURCE_FORMATS:
        slug = re.sub(r"[^A-Za-z0-9]+", "_", selector).strip("_")
        temporary_destination = destination.with_name(f"{destination.stem}.{slug}.mp4")
        command = [
            "yt-dlp",
            "--no-progress",
            "--no-warnings",
            "--user-agent",
            USER_AGENT,
            "--retries",
            "3",
            "--fragment-retries",
            "3",
            "--socket-timeout",
            "30",
            "--format",
            selector,
            "--merge-output-format",
            "mp4",
            "--output",
            str(temporary_destination),
        ]
        command.append("--force-overwrites" if force else "--no-overwrites")
        command.extend(["--", url])
        try:
            run(command)
            if temporary_destination.exists() and temporary_destination.stat().st_size:
                if destination.exists() and force:
                    destination.unlink()
                temporary_destination.replace(destination)
                return selector
            errors.append(f"{selector}: no output file")
        except RuntimeError as error:
            errors.append(f"{selector}: {error}")
    raise RuntimeError(f"all source selectors failed for {url}: {' | '.join(errors)}")


def download_auto_captions(url: str, reference_dir: Path, alias: str, *, force: bool) -> Path | None:
    reference_dir.mkdir(parents=True, exist_ok=True)
    existing = sorted(reference_dir.glob(f"{alias}.ko*.vtt"))
    if existing and not force:
        return existing[0]
    command = [
        "yt-dlp",
        "--no-progress",
        "--no-warnings",
        "--user-agent",
        USER_AGENT,
        "--skip-download",
        "--write-auto-subs",
        "--sub-langs",
        "ko",
        "--sub-format",
        "vtt",
        "--output",
        str(reference_dir / f"{alias}.%(ext)s"),
    ]
    command.append("--force-overwrites" if force else "--no-overwrites")
    command.extend(["--", url])
    try:
        run(command)
    except RuntimeError:
        # Caption availability is a diagnostic attribute, not a media intake
        # gate.  The source is still retained if audio/video QC passes.
        return None
    candidates = sorted(reference_dir.glob(f"{alias}.ko*.vtt"))
    return candidates[0] if candidates and candidates[0].stat().st_size else None


def validate_candidate(candidate: dict[str, Any], line_number: int) -> None:
    for field in ("alias", "videoId", "primaryDomain", "primaryBucket", "primaryFocus"):
        if not candidate.get(field):
            raise SystemExit(f"manifest line {line_number}: missing {field}")
    if not str(candidate["alias"]).replace("-", "").replace("_", "").isalnum():
        raise SystemExit(f"manifest line {line_number}: unsafe alias {candidate['alias']!r}")
    if len(str(candidate["videoId"])) != 11:
        raise SystemExit(f"manifest line {line_number}: invalid video id {candidate['videoId']!r}")


def read_manifest(path: Path) -> list[dict[str, Any]]:
    values: list[dict[str, Any]] = []
    seen: set[str] = set()
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        candidate = json.loads(raw)
        validate_candidate(candidate, line_number)
        alias = str(candidate["alias"])
        if alias in seen:
            raise SystemExit(f"manifest line {line_number}: duplicate alias {alias}")
        seen.add(alias)
        values.append(candidate)
    if not values:
        raise SystemExit(f"{path}: no candidates")
    return values


def collect(candidate: dict[str, Any], root: Path, *, force: bool) -> dict[str, Any]:
    alias = str(candidate["alias"])
    url = canonical_url(str(candidate["videoId"]))
    info = yt_info(url)
    source_path = root / "00_source" / f"{alias}.mp4"
    metadata_path = root / "03_meta" / f"{alias}.json"
    previous_selector: str | None = None
    if source_path.exists() and not force and metadata_path.exists():
        try:
            previous = json.loads(metadata_path.read_text(encoding="utf-8"))
            previous_selector = previous.get("source", {}).get("selector")
        except (OSError, json.JSONDecodeError):
            previous_selector = None
    caption_path = download_auto_captions(
        url,
        root / "02_transcripts" / "auto_captions",
        alias,
        force=force,
    )
    selector_used = download_source(url, source_path, force=force)
    if selector_used == "existing_local_retained_source" and previous_selector:
        selector_used = previous_selector
    probe = ffprobe_json(source_path)
    video_stream = first_stream(probe, "video")
    audio_stream = first_stream(probe, "audio")
    source_duration = duration_from_info(info)
    retained_duration = duration_from_probe(probe)
    checks = {
        "durationAtLeast300Sec": retained_duration >= MIN_DURATION_SEC,
        "videoStreamPresent": video_stream is not None,
        "audioStreamPresent": audio_stream is not None,
        "remoteLocalDurationWithin2Sec": abs(source_duration - retained_duration) <= 2.0,
        "koreanAutomaticCaptionObserved": bool(korean_auto_caption_languages(info)),
    }
    passed = all(checks.values())
    metadata = {
        **candidate,
        "collectorVersion": COLLECTOR_VERSION,
        "collectedAt": utc_now(),
        "canonicalSourceUrl": url,
        "sourcePageUrl": candidate.get("sourcePageUrl") or url,
        "sourceInfo": {
            "title": info.get("title"),
            "channel": info.get("channel"),
            "channelId": info.get("channel_id"),
            "uploadDate": info.get("upload_date"),
            "durationSec": source_duration,
            "licenseObserved": info.get("license"),
            "availability": info.get("availability"),
            "liveStatus": info.get("live_status"),
        },
        "source": {
            "path": str(source_path),
            "sha256": sha256_file(source_path),
            "bytes": source_path.stat().st_size,
            "durationSec": round(retained_duration, 6),
            "container": "MP4 selected YouTube platform rendition",
            "selector": selector_used,
            "sourceOriginalStatus": "platform_rendition_not_uploader_master",
            "reencodedByCollector": False,
            "video": stream_summary(video_stream),
            "audio": stream_summary(audio_stream),
        },
        "audioDerivative": {
            "requiredForCollectionOrInput": False,
            "createdByThisRun": False,
            "status": "not_created_source_mp4_audio_used_directly",
            "path": None,
        },
        "transcript": {
            "sourceType": "youtube_automatic_korean_caption_non_gold",
            "availableLanguages": korean_auto_caption_languages(info),
            "rawPath": str(caption_path) if caption_path else None,
            "rawSha256": sha256_file(caption_path) if caption_path else None,
            "alignmentStatus": "automatic_caption_timing_reference_only_not_official_steno_gold",
            "officialStenographyAttached": False,
        },
        "situationAssessment": {
            "primaryBucket": candidate["primaryBucket"],
            "primaryDomain": candidate["primaryDomain"],
            "primaryFocus": candidate["primaryFocus"],
            "secondaryTags": list(candidate.get("secondaryTags") or []),
            "status": "candidate_requires_human_audio_review",
            "confirmedHours": 0,
            "notEvidenceOf": [
                "actual_overlap_speech",
                "continuous_background_noise",
                "far_mic_or_reverb",
                "similar_timbre",
            ],
        },
        "provenance": {
            "sourceFamily": candidate.get("sourceFamily"),
            "sourceChannel": info.get("channel"),
            "knownDevelopmentMaterial": True,
            "split": "diagnostic_regression",
            "rightsGateApplied": False,
            "audioSentExternally": False,
            "trainingPromotion": "blocked_until_rights_and_human_qc",
        },
        "qualityGate": {
            "checks": checks,
            "passedIntakeGate": passed,
            "trainingEligible": False,
            "goldStatus": "none",
        },
    }
    write_json(metadata_path, metadata)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--only", nargs="*", help="collect only these aliases")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    for command in ("yt-dlp", "ffprobe"):
        if not shutil.which(command):
            raise SystemExit(f"required command is not available: {command}")
    candidates = read_manifest(args.manifest)
    if args.only:
        requested = set(args.only)
        candidates = [candidate for candidate in candidates if candidate["alias"] in requested]
        missing = requested - {candidate["alias"] for candidate in candidates}
        if missing:
            raise SystemExit(f"unknown aliases requested: {', '.join(sorted(missing))}")
    args.root.mkdir(parents=True, exist_ok=True)
    run_id = utc_now().replace("+00:00", "Z").replace("-", "").replace(":", "").replace(".", "-")
    run_config = {
        "collectorVersion": COLLECTOR_VERSION,
        "runId": run_id,
        "startedAt": utc_now(),
        "manifest": str(args.manifest),
        "root": str(args.root),
        "selectedAliases": [candidate["alias"] for candidate in candidates],
        "sourcePolicy": "public official-channel platform MP4 retained unchanged; not uploader master",
        "sourceFormatSelectors": list(SOURCE_FORMATS),
        "audioDerivative": "disabled; no FLAC created or required",
        "captionPolicy": "automatic Korean captions retained as reference only; no official stenography assumed",
        "rightsGateApplied": False,
        "trainingPromotion": "blocked until rights/provenance/human audio QC/speaker-overlap annotation",
        "command": sys.argv,
    }
    write_json(args.root / "00_intake" / "run-config.latest.json", run_config)
    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for index, candidate in enumerate(candidates, 1):
        print(f"[{index}/{len(candidates)}] {candidate['alias']}: retain source MP4", flush=True)
        try:
            result = collect(candidate, args.root, force=args.force)
            results.append(result)
            print(f"[{index}/{len(candidates)}] {candidate['alias']}: {'PASS' if result['qualityGate']['passedIntakeGate'] else 'FAIL'}", flush=True)
        except Exception as error:
            errors.append({"alias": str(candidate["alias"]), "error": str(error)})
            print(f"[{index}/{len(candidates)}] {candidate['alias']}: FAIL {error}", file=sys.stderr, flush=True)
    passed = [item for item in results if item["qualityGate"]["passedIntakeGate"]]
    summary = {
        "collectorVersion": COLLECTOR_VERSION,
        "runId": run_id,
        "startedAt": run_config["startedAt"],
        "finishedAt": utc_now(),
        "requestedCount": len(candidates),
        "passedIntakeCount": len(passed),
        "failedIntakeCount": len(candidates) - len(passed),
        "passedDurationSec": round(sum(item["source"]["durationSec"] for item in passed), 6),
        "passedDurationHours": round(sum(item["source"]["durationSec"] for item in passed) / 3600, 9),
        "passedSourceBytes": sum(item["source"]["bytes"] for item in passed),
        "automaticCaptionReferenceCount": sum(1 for item in passed if item["transcript"]["rawPath"]),
        "trainingEligibleCount": 0,
        "confirmedSituationHours": 0,
        "situationStatus": "candidate_intake_only_requires_human_audio_review",
        "errors": errors,
        "items": [
            {
                "alias": item["alias"],
                "title": item["sourceInfo"]["title"],
                "channel": item["sourceInfo"]["channel"],
                "durationSec": item["source"]["durationSec"],
                "primaryFocus": item["situationAssessment"]["primaryFocus"],
                "sourceBytes": item["source"]["bytes"],
                "passedIntakeGate": item["qualityGate"]["passedIntakeGate"],
            }
            for item in results
        ],
    }
    write_json(args.root / "collection-summary.json", summary)
    write_json(args.root / "00_intake" / "runs" / f"{run_id}.json", {"runConfig": run_config, "summary": summary})
    print(f"completed: passed={len(passed)}/{len(candidates)}, hours={summary['passedDurationHours']}", flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
