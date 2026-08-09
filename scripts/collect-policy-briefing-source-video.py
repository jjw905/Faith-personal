#!/usr/bin/env python3
"""Retain original Korea.kr policy-briefing MP4s for diagnostic review.

The pilot intake previously retained FLAC derivatives only.  This collector
keeps the official MP4 container and its original audio stream instead.  The
selected briefings are already-known development material, so this batch is
diagnostic/regression evidence and is never marked as training or sealed data.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_PILOT_DIR = Path("Faith-office/08_검증_정답셋/Faith_STT_수집_파일럿_2026-08-05")
DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_상황진단_정책브리핑_2026-08-06"
)
COLLECTOR_VERSION = "policy-briefing-source-video-diagnostic-v0.1"
USER_AGENT = "Faith-STT-policy-briefing-diagnostic/2026-08-06"
MIN_DURATION_SEC = 120.0
SELECTED_ALIASES = (
    "kdca-plan-20260716",
    "mfds-plan-20251216",
    "moe-plan-20251212",
    "msit-plan-20260716",
    "motie-plan-20251217",
    "privacy-plan-20251212",
    "rda-briefing-20260617",
    "mcst-plan-20251216",
    "pps-plan-20251211",
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=capture, text=True)
    if result.returncode:
        detail = (result.stderr or result.stdout or "").strip().replace("\n", " ")
        raise RuntimeError(f"command failed ({result.returncode}): {detail[-1600:]}")
    return result


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def curl_download(url: str, destination: Path, *, force: bool = False) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and not force:
        return
    partial = destination.with_name(destination.name + ".part")
    command = [
        "curl",
        "--fail",
        "--location",
        "--retry",
        "4",
        "--retry-all-errors",
        "--connect-timeout",
        "30",
        "--speed-limit",
        "1024",
        "--speed-time",
        "30",
        "--compressed",
        "--silent",
        "--show-error",
        "--user-agent",
        USER_AGENT,
    ]
    if partial.exists() and partial.stat().st_size:
        command.extend(["--continue-at", "-"])
    command.extend(["--output", str(partial), url])
    run(command)
    partial.replace(destination)


def ffprobe_json(path_or_url: str) -> dict[str, Any]:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate:stream=index,codec_name,codec_type,sample_rate,channels,channel_layout,bit_rate,bits_per_raw_sample,width,height",
            "-of",
            "json",
            path_or_url,
        ],
        capture=True,
    )
    return json.loads(result.stdout)


def first_stream(probe: dict[str, Any], codec_type: str) -> dict[str, Any] | None:
    return next((item for item in probe.get("streams", []) if item.get("codec_type") == codec_type), None)


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


def duration(probe: dict[str, Any]) -> float:
    return float(probe.get("format", {}).get("duration") or 0.0)


def make_run_id(value: str) -> str:
    return value.replace("+00:00", "Z").replace("-", "").replace(":", "").replace(".", "-")


def load_metadata(pilot_dir: Path, aliases: list[str]) -> list[dict[str, Any]]:
    metadata_by_alias = {
        path.stem: json.loads(path.read_text(encoding="utf-8"))
        for path in (pilot_dir / "03_meta").glob("*.json")
    }
    missing = [alias for alias in aliases if alias not in metadata_by_alias]
    if missing:
        raise SystemExit(f"missing pilot metadata: {missing}")
    return [metadata_by_alias[alias] for alias in aliases]


def preflight_storage(root: Path, items: list[dict[str, Any]]) -> dict[str, int]:
    expected = sum(int(ffprobe_json(item["videoUrl"]).get("format", {}).get("size") or 0) for item in items)
    free = shutil.disk_usage(root.parent if root.parent.exists() else Path.cwd()).free
    required = int(expected * 1.05) + 1024**3
    if free < required:
        raise SystemExit(f"insufficient free space: free={free}, required={required}, expected={expected}")
    return {"freeBytesBeforeRun": free, "expectedSourceBytes": expected, "requiredBytes": required}


def collect(item: dict[str, Any], pilot_dir: Path, root: Path, *, force: bool) -> dict[str, Any]:
    alias = item["alias"]
    source_page = root / "00_intake" / "source_pages" / f"{alias}.html"
    reference_source = pilot_dir / "02_references" / f"{alias}.reference.txt"
    reference_path = root / "02_transcripts" / "text" / f"{alias}.reference.txt"
    source_path = root / "00_source" / f"{alias}.mp4"

    curl_download(item["sourceUrl"], source_page, force=force)
    reference_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(reference_source, reference_path)

    remote_probe = ffprobe_json(item["videoUrl"])
    curl_download(item["videoUrl"], source_path, force=force)
    source_probe = ffprobe_json(str(source_path))
    video_stream = first_stream(source_probe, "video")
    audio_stream = first_stream(source_probe, "audio")
    remote_duration = duration(remote_probe)
    local_duration = duration(source_probe)
    checks = {
        "durationAtLeast120Sec": local_duration >= MIN_DURATION_SEC,
        "videoStreamPresent": video_stream is not None,
        "audioStreamPresent": audio_stream is not None,
        "remoteLocalDurationWithin1Sec": abs(remote_duration - local_duration) <= 1.0,
        "referenceTextPresent": reference_path.stat().st_size > 0,
    }
    passed = all(checks.values())
    metadata = {
        **item,
        "collectorVersion": COLLECTOR_VERSION,
        "collectedAt": utc_now(),
        "sourcePagePath": str(source_page),
        "source": {
            "path": str(source_path),
            "sha256": sha256_file(source_path),
            "bytes": source_path.stat().st_size,
            "durationSec": round(local_duration, 6),
            "video": stream_summary(video_stream),
            "audio": stream_summary(audio_stream),
            "reencodedByCollector": False,
            "remoteProbe": {
                "durationSec": round(remote_duration, 6),
                "bytes": int(remote_probe.get("format", {}).get("size") or 0),
            },
        },
        "audioDerivative": {
            "requiredForCollectionOrInput": False,
            "createdByThisRun": False,
            "status": "not_created_source_mp4_used_directly",
            "path": None,
        },
        "transcript": {
            "path": str(reference_path),
            "sha256": sha256_file(reference_path),
            "referenceCharCount": item.get("referenceCharCount"),
            "referenceTurnsByMarker": item.get("referenceTurnsByMarker"),
            "alignmentStatus": "official_reference_without_frame_accurate_speaker_timestamps",
        },
        "situationAssessment": {
            "primaryBucket": "focused_diagnostic",
            "primaryDomain": "public_briefing",
            "primaryFocus": "short_question_late_entrant_candidate",
            "secondaryTags": ["question_answer", "multiple_official_responders", "known_regression_source"],
            "status": "candidate_requires_human_audio_review",
            "notEvidenceOf": ["overlap_speech", "background_noise", "far_mic", "similar_timbre"],
        },
        "provenance": {
            "sourceFamily": "korea_policy_briefing",
            "knownDevelopmentMaterial": True,
            "split": "diagnostic_regression",
            "rightsGateApplied": False,
            "audioSentExternally": False,
        },
        "qualityGate": {"checks": checks, "passedIntakeGate": passed, "trainingEligible": False},
    }
    write_json(root / "03_meta" / f"{alias}.json", metadata)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pilot-dir", type=Path, default=DEFAULT_PILOT_DIR)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--only", action="append", default=[])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    for command in ("curl", "ffprobe"):
        if not shutil.which(command):
            raise SystemExit(f"required command is not available: {command}")
    aliases = args.only or list(SELECTED_ALIASES)
    items = load_metadata(args.pilot_dir, aliases)
    args.root.mkdir(parents=True, exist_ok=True)
    started_at = utc_now()
    run_id = make_run_id(started_at)
    run_config = {
        "collectorVersion": COLLECTOR_VERSION,
        "startedAt": started_at,
        "runId": run_id,
        "pilotDir": str(args.pilot_dir),
        "root": str(args.root),
        "selectedAliases": aliases,
        "sourcePolicy": "direct official Korea.kr MP4 retained unchanged",
        "audioDerivative": "disabled; no FLAC created or required",
        "situationPolicy": "diagnostic candidates only; known development material; no training or sealed promotion",
        "force": args.force,
        "command": sys.argv,
        "storagePreflight": preflight_storage(args.root, items),
    }
    write_json(args.root / "00_intake" / "run-config.latest.json", run_config)

    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for index, item in enumerate(items, 1):
        print(f"[{index}/{len(items)}] {item['alias']}: retain source MP4", flush=True)
        try:
            results.append(collect(item, args.pilot_dir, args.root, force=args.force))
            print(f"[{index}/{len(items)}] {item['alias']}: PASS", flush=True)
        except Exception as error:
            errors.append({"alias": item["alias"], "error": str(error)})
            print(f"[{index}/{len(items)}] {item['alias']}: FAIL {error}", file=sys.stderr, flush=True)

    passed = [item for item in results if item["qualityGate"]["passedIntakeGate"]]
    summary = {
        "collectorVersion": COLLECTOR_VERSION,
        "runId": run_id,
        "startedAt": started_at,
        "finishedAt": utc_now(),
        "requestedCount": len(items),
        "passedIntakeCount": len(passed),
        "failedIntakeCount": len(results) - len(passed) + len(errors),
        "passedDurationSec": round(sum(item["source"]["durationSec"] for item in passed), 6),
        "passedDurationHours": round(sum(item["source"]["durationSec"] for item in passed) / 3600, 9),
        "passedSourceBytes": sum(item["source"]["bytes"] for item in passed),
        "trainingEligibleCount": 0,
        "knownDevelopmentMaterial": True,
        "situationStatus": "diagnostic_candidate_requires_human_audio_review",
        "errors": errors,
        "items": [
            {
                "alias": item["alias"],
                "durationSec": item["source"]["durationSec"],
                "sourceBytes": item["source"]["bytes"],
                "passedIntakeGate": item["qualityGate"]["passedIntakeGate"],
            }
            for item in results
        ],
    }
    write_json(args.root / "collection-summary.json", summary)
    write_json(args.root / "00_intake" / "runs" / f"{run_id}.json", {"runConfig": run_config, "summary": summary})
    print(f"completed: passed={len(passed)}/{len(items)}, hours={summary['passedDurationHours']}", flush=True)
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
