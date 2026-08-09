#!/usr/bin/env python3
"""Validate retained artifacts for a YouTube CC BY collection run.

The collector records a per-item provenance document.  This verifier intentionally
recomputes hashes and probes local media instead of trusting that document, so the
reported hours are based only on complete, internally consistent artifacts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


EXPECTED_LICENSE = "Creative Commons Attribution license (reuse allowed)"
DEFAULT_ROOT = Path("Faith-office/08_검증_정답셋/Faith_STT_수집_유튜브_CC_BY_2026-08-05")
VALIDATOR_VERSION = "youtube-cc-collection-validator-v0.1"


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def probe(path: Path) -> dict[str, Any]:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    payload = json.loads(completed.stdout)
    streams = payload.get("streams") or []
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    if not audio:
        raise ValueError("no audio stream")
    return {
        "durationSec": float((payload.get("format") or {}).get("duration") or 0),
        "codec": audio.get("codec_name"),
        "sampleRate": str(audio.get("sample_rate")) if audio.get("sample_rate") is not None else None,
        "channels": audio.get("channels"),
        "bitDepth": audio.get("bits_per_raw_sample") or audio.get("bits_per_sample"),
    }


def as_path(value: object) -> Path | None:
    if not isinstance(value, str) or not value:
        return None
    return Path(value)


def has_korean_manual_subtitle(metadata: dict[str, Any]) -> bool:
    transcript = metadata.get("transcript") or {}
    languages = transcript.get("manualKoreanSubtitleLanguagesAvailable") or []
    return transcript.get("sourceType") == "publisher_provided_youtube_subtitles" and any(
        language == "ko" or str(language).startswith("ko-") for language in languages
    )


def duration_hours(seconds: float) -> float:
    return round(seconds / 3600, 6)


def validate_item(metadata_path: Path) -> tuple[dict[str, Any], list[str]]:
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    alias = str(metadata.get("alias") or metadata_path.stem)
    problems: list[str] = []

    source_path = as_path(metadata.get("sourcePath"))
    audio_path = as_path(metadata.get("audioPath"))
    transcript = metadata.get("transcript") or {}
    vtt_path = as_path(transcript.get("rawVttPath"))
    reference_path = as_path(transcript.get("normalizedTextPath"))
    expected_hashes = {
        "source": metadata.get("sourceSha256"),
        "derived": metadata.get("derivedSha256"),
        "vtt": transcript.get("rawVttSha256"),
        "reference": transcript.get("normalizedTextSha256"),
    }
    artifacts = {
        "source": source_path,
        "derived": audio_path,
        "vtt": vtt_path,
        "reference": reference_path,
    }
    verified_hashes: dict[str, str] = {}
    for name, path in artifacts.items():
        if path is None:
            problems.append(f"{name}: metadata path missing")
            continue
        if not path.is_file() or path.stat().st_size <= 0:
            problems.append(f"{name}: retained file missing or empty ({path})")
            continue
        actual_hash = sha256(path)
        verified_hashes[name] = actual_hash
        if not expected_hashes[name]:
            problems.append(f"{name}: SHA-256 missing from metadata")
        elif actual_hash != expected_hashes[name]:
            problems.append(f"{name}: SHA-256 mismatch")

    if metadata.get("sourceLicense") != EXPECTED_LICENSE:
        problems.append("sourceLicense: exact CC BY observation missing")
    if not has_korean_manual_subtitle(metadata):
        problems.append("transcript: publisher-provided Korean subtitle evidence missing")
    if metadata.get("audioSentExternally") is not False:
        problems.append("audioSentExternally: expected false")
    if not metadata.get("sourceInfoMetadataSha256"):
        problems.append("sourceInfoMetadataSha256: missing")
    if not (metadata.get("attribution") or {}).get("canonicalUrl"):
        problems.append("attribution.canonicalUrl: missing")
    if not (metadata.get("attribution") or {}).get("channel"):
        problems.append("attribution.channel: missing")
    if not metadata.get("sourceOriginalStatus"):
        problems.append("sourceOriginalStatus: missing")

    risk_status = metadata.get("contentOwnershipScreening") == "title_risk_requires_human_third_party_content_review"
    if risk_status and metadata.get("rightsEligibleForModelTuning") is not False:
        problems.append("title-risk item: must not be model-tuning eligible")
    if not risk_status and metadata.get("rightsEligibleForModelTuning") is not True:
        problems.append("strict item: model-tuning rights eligibility should be true")

    if source_path and source_path.is_file():
        try:
            source_probe = probe(source_path)
            if source_probe["durationSec"] <= 0:
                problems.append("source probe: non-positive duration")
        except Exception as error:  # pragma: no cover - error text is evidence
            problems.append(f"source probe failed: {error}")
            source_probe = None
    else:
        source_probe = None

    if audio_path and audio_path.is_file():
        try:
            derived_probe = probe(audio_path)
            if derived_probe["codec"] != "flac":
                problems.append(f"derived probe: expected flac, got {derived_probe['codec']}")
            if derived_probe["sampleRate"] != "16000" or derived_probe["channels"] != 1:
                problems.append("derived probe: expected 16 kHz mono")
            if source_probe and abs(source_probe["durationSec"] - derived_probe["durationSec"]) > 1.0:
                problems.append("source/derived duration difference exceeds 1 second")
        except Exception as error:  # pragma: no cover - error text is evidence
            problems.append(f"derived probe failed: {error}")
            derived_probe = None
    else:
        derived_probe = None

    result = {
        "alias": alias,
        "metadataPath": str(metadata_path),
        "sourceDurationSec": metadata.get("sourceDurationSec"),
        "rightsEligibleForModelTuning": metadata.get("rightsEligibleForModelTuning"),
        "contentOwnershipScreening": metadata.get("contentOwnershipScreening"),
        "verifiedHashes": verified_hashes,
        "sourceProbe": source_probe,
        "derivedProbe": derived_probe,
        "valid": not problems,
    }
    return result, problems


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument(
        "--report",
        type=Path,
        help="output JSON report (default: <root>/04_qa/youtube-cc-collection-integrity-report.json)",
    )
    args = parser.parse_args()
    report_path = args.report or args.root / "04_qa" / "youtube-cc-collection-integrity-report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    metadata_paths = sorted((args.root / "03_meta").glob("*.json"))
    items: list[dict[str, Any]] = []
    findings: list[dict[str, Any]] = []
    for metadata_path in metadata_paths:
        item, problems = validate_item(metadata_path)
        items.append(item)
        if problems:
            findings.append({"alias": item["alias"], "problems": problems})

    total_duration_sec = sum(float(item.get("sourceDurationSec") or 0) for item in items if item["valid"])
    eligible_duration_sec = sum(
        float(item.get("sourceDurationSec") or 0)
        for item in items
        if item["valid"] and item.get("rightsEligibleForModelTuning") is True
    )
    risk_duration_sec = sum(
        float(item.get("sourceDurationSec") or 0)
        for item in items
        if item["valid"] and item.get("contentOwnershipScreening") == "title_risk_requires_human_third_party_content_review"
    )
    report = {
        "validatorVersion": VALIDATOR_VERSION,
        "auditedAt": utc_now(),
        "root": str(args.root),
        "metadataFiles": len(metadata_paths),
        "validItems": sum(1 for item in items if item["valid"]),
        "invalidItems": len(findings),
        "validSourceDurationSec": round(total_duration_sec, 3),
        "validSourceHours": duration_hours(total_duration_sec),
        "rightsEligibleDurationSec": round(eligible_duration_sec, 3),
        "rightsEligibleSourceHours": duration_hours(eligible_duration_sec),
        "titleRiskDurationSec": round(risk_duration_sec, 3),
        "titleRiskSourceHours": duration_hours(risk_duration_sec),
        "findings": findings,
        "items": items,
    }
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"validated: {report['validItems']}/{report['metadataFiles']} items, "
        f"{report['rightsEligibleSourceHours']:.2f} rights-eligible source hours, "
        f"{report['invalidItems']} invalid"
    )
    if findings:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
