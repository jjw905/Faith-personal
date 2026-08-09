#!/usr/bin/env python3
"""Collect a bounded, speaker-balanced ASR-only intake from Zeroth-Korean.

This collector is deliberately narrower than the 100-hour meeting-data goal.
Zeroth-Korean provides source-transcribed, CC BY 4.0, *single-speaker*
utterances.  It is useful only as a small clean/read-speech ASR reference;
it is never counted toward multi-speaker diarization, overlap, or meeting
summary quotas.

The OpenSLR SLR40 archive is about 10 GB.  To avoid downloading the entire
archive merely to retain a bounded pilot, the script fetches the public
Hugging Face mirror's per-row FLAC assets.  It records both the authoritative
OpenSLR license evidence and the mirror revision/path, and never calls the
mirror FLAC the original recording master.

No signed asset URL is written to disk.  Those URLs are transient transport
credentials; durable metadata contains only the dataset revision, row index,
and source-relative path needed to reproduce the lookup.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


COLLECTOR_VERSION = "zeroth-speaker-balanced-asr-intake-v0.1"
DATASET_REPOSITORY = "kresnik/zeroth_korean"
DATASET_CONFIG = "default"
UPSTREAM_SPLIT = "train"
DATASET_API = f"https://huggingface.co/api/datasets/{DATASET_REPOSITORY}"
ROWS_API = "https://datasets-server.huggingface.co/rows"
OFFICIAL_DATASET_PAGE = "https://www.openslr.org/40/"
OFFICIAL_ARCHIVE_URL = "https://openslr.trmal.net/resources/40/zeroth_korean.tar.gz"
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_Zeroth_CC_BY_ASR_2026-08-05"
)
USER_AGENT = "Faith-STT-rights-audited-zeroth-intake/2026-08-05"
ROW_PAGE_SIZE = 100
ESTIMATED_CLIP_SEC = 8.34
DOWNLOAD_CHUNK_BYTES = 1024 * 1024


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_id() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def write_new_json(path: Path, value: Any) -> None:
    """Write once with an atomic final rename; do not replace existing evidence."""
    if path.exists():
        raise RuntimeError(f"refusing to overwrite existing evidence: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.{run_id()}.part")
    if temporary.exists():
        raise RuntimeError(f"temporary evidence already exists and is preserved: {temporary}")
    temporary.write_text(stable_json(value), encoding="utf-8")
    temporary.replace(path)


def request_bytes(url: str, timeout_sec: int = 90) -> tuple[bytes, dict[str, str]]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout_sec) as response:
        return response.read(), {key.lower(): value for key, value in response.headers.items()}


def request_json(url: str, timeout_sec: int = 90) -> dict[str, Any]:
    body, _headers = request_bytes(url, timeout_sec=timeout_sec)
    parsed = json.loads(body.decode("utf-8"))
    if not isinstance(parsed, dict):
        raise RuntimeError(f"expected JSON object from {url}")
    return parsed


def fetch_dataset_info() -> dict[str, Any]:
    info = request_json(DATASET_API)
    sha = info.get("sha")
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha):
        raise RuntimeError("Hugging Face dataset API did not provide a 40-character revision SHA")
    return info


def rows_url(offset: int, length: int) -> str:
    query = urllib.parse.urlencode(
        {
            "dataset": DATASET_REPOSITORY,
            "config": DATASET_CONFIG,
            "split": UPSTREAM_SPLIT,
            "offset": str(offset),
            "length": str(length),
        }
    )
    return f"{ROWS_API}?{query}"


def source_row_index(row: dict[str, Any]) -> int:
    value = row.get("row_idx")
    if not isinstance(value, int) or value < 0:
        raise RuntimeError("datasets-server row omitted a non-negative row_idx")
    return value


def source_payload(row: dict[str, Any]) -> dict[str, Any]:
    payload = row.get("row")
    if not isinstance(payload, dict):
        raise RuntimeError(f"row {source_row_index(row)} omitted its payload")
    return payload


def source_speaker_id(row: dict[str, Any]) -> int:
    value = source_payload(row).get("speaker_id")
    if not isinstance(value, int):
        raise RuntimeError(f"row {source_row_index(row)} omitted integer speaker_id")
    return value


def source_record_id(row: dict[str, Any]) -> str:
    value = source_payload(row).get("id")
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"row {source_row_index(row)} omitted record id")
    return value


def source_text(row: dict[str, Any]) -> str:
    value = source_payload(row).get("text")
    if not isinstance(value, str) or not value.strip():
        raise RuntimeError(f"row {source_row_index(row)} omitted transcript text")
    return value.strip()


def source_relative_path(row: dict[str, Any]) -> str:
    value = source_payload(row).get("path")
    if not isinstance(value, str) or not value:
        raise RuntimeError(f"row {source_row_index(row)} omitted source path")
    return value


def audio_url(row: dict[str, Any]) -> str:
    audio = source_payload(row).get("audio")
    candidates = audio if isinstance(audio, list) else [audio]
    for candidate in candidates:
        if isinstance(candidate, dict) and isinstance(candidate.get("src"), str):
            return candidate["src"]
    raise RuntimeError(f"row {source_row_index(row)} omitted a downloadable audio source")


def normalize_text_key(text: str) -> str:
    return re.sub(r"\s+", "", text).casefold()


def ordering_key(row: dict[str, Any], seed: str) -> str:
    material = f"{seed}\x00{source_record_id(row)}\x00{source_row_index(row)}".encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def fetch_rows(request_delay_sec: float) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    total: int | None = None
    offset = 0
    while total is None or offset < total:
        response = request_json(rows_url(offset, ROW_PAGE_SIZE))
        response_rows = response.get("rows")
        reported_total = response.get("num_rows_total")
        if not isinstance(response_rows, list):
            raise RuntimeError(f"datasets-server response at offset {offset} omitted rows")
        if not isinstance(reported_total, int) or reported_total <= 0:
            raise RuntimeError(f"datasets-server response at offset {offset} omitted num_rows_total")
        if total is None:
            total = reported_total
        elif total != reported_total:
            raise RuntimeError(f"datasets-server total changed during discovery: {total} -> {reported_total}")
        if not response_rows:
            raise RuntimeError(f"datasets-server returned an empty page before offset {total}")
        for row in response_rows:
            if not isinstance(row, dict):
                raise RuntimeError(f"datasets-server returned non-object row at offset {offset}")
            # Validate all durable fields now; transient signed URL is intentionally not persisted.
            source_row_index(row)
            source_speaker_id(row)
            source_record_id(row)
            source_text(row)
            source_relative_path(row)
            audio_url(row)
            rows.append(row)
        offset += len(response_rows)
        if request_delay_sec:
            time.sleep(request_delay_sec)
    if total != len(rows):
        raise RuntimeError(f"datasets-server row count mismatch: expected {total}, received {len(rows)}")
    if len({source_row_index(row) for row in rows}) != len(rows):
        raise RuntimeError("datasets-server returned duplicate row indices")
    return rows


def probe_audio(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,bit_rate:stream=index,codec_name,codec_type,sample_rate,channels,bit_rate,bits_per_raw_sample",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    probe = json.loads(result.stdout)
    streams = probe.get("streams", [])
    audio = next((stream for stream in streams if stream.get("codec_type") == "audio"), None)
    if not isinstance(audio, dict):
        raise RuntimeError(f"ffprobe found no audio stream in {path}")
    duration_raw = probe.get("format", {}).get("duration")
    try:
        duration_sec = float(duration_raw)
    except (TypeError, ValueError) as error:
        raise RuntimeError(f"ffprobe found no usable duration in {path}") from error
    if duration_sec <= 0:
        raise RuntimeError(f"ffprobe found non-positive duration in {path}")
    return {
        "durationSec": round(duration_sec, 6),
        "codec": audio.get("codec_name"),
        "sampleRate": audio.get("sample_rate"),
        "channels": audio.get("channels"),
        "bitrate": audio.get("bit_rate"),
        "bitDepth": audio.get("bits_per_raw_sample"),
        "containerBitrate": probe.get("format", {}).get("bit_rate"),
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_reference(path: Path, transcript: str) -> str:
    encoded = (transcript + "\n").encode("utf-8")
    expected_sha = hashlib.sha256(encoded).hexdigest()
    if path.exists():
        actual = path.read_bytes()
        if hashlib.sha256(actual).hexdigest() != expected_sha:
            raise RuntimeError(f"reference exists with different contents and is preserved: {path}")
        return expected_sha
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encoded)
    return expected_sha


def download_clip(url: str, destination: Path, part_suffix: str) -> tuple[int | None, str]:
    """Download exactly one chosen source asset without persisting the signed URL."""
    if destination.exists():
        raise RuntimeError(f"source destination already exists and is preserved: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(f"{destination.name}.{part_suffix}.part")
    if partial.exists():
        raise RuntimeError(f"prior partial is preserved; refusing to overwrite: {partial}")
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("xb") as output:
        content_length = response.headers.get("Content-Length")
        for block in iter(lambda: response.read(DOWNLOAD_CHUNK_BYTES), b""):
            output.write(block)
    partial.replace(destination)
    size = destination.stat().st_size
    return (int(content_length) if content_length and content_length.isdigit() else None, sha256_file(destination))


def metadata_path(root: Path, alias: str) -> Path:
    return root / "03_meta" / "items" / f"{alias}.json"


def load_completed(root: Path) -> tuple[dict[int, dict[str, Any]], set[str], list[str]]:
    completed: dict[int, dict[str, Any]] = {}
    used_texts: set[str] = set()
    integrity_errors: list[str] = []
    items_dir = root / "03_meta" / "items"
    if not items_dir.exists():
        return completed, used_texts, integrity_errors
    for path in sorted(items_dir.glob("*.json")):
        try:
            metadata = json.loads(path.read_text(encoding="utf-8"))
            row_index = metadata["sourceRowIndex"]
            source_path = root / metadata["sourcePath"]
            reference_path = root / metadata["referenceTextPath"]
            transcript_key = metadata["normalizedTranscriptKey"]
            if not isinstance(row_index, int) or row_index < 0:
                raise ValueError("sourceRowIndex is invalid")
            if not source_path.is_file() or not reference_path.is_file():
                raise ValueError("referenced source or transcript is missing")
            if row_index in completed:
                raise ValueError("duplicate sourceRowIndex")
            completed[row_index] = metadata
            used_texts.add(transcript_key)
        except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
            integrity_errors.append(f"{path}: {error}")
    return completed, used_texts, integrity_errors


def ensure_contract(root: Path, contract: dict[str, Any]) -> None:
    path = root / "00_intake" / "collection-contract.json"
    if not path.exists():
        write_new_json(path, contract)
        return
    existing = json.loads(path.read_text(encoding="utf-8"))
    immutable_fields = (
        "collectorVersion",
        "datasetRepository",
        "datasetRevision",
        "datasetConfig",
        "upstreamSplit",
        "perSpeakerCapSec",
        "selectionSeed",
        "rights",
    )
    changed = [field for field in immutable_fields if existing.get(field) != contract.get(field)]
    if changed:
        raise RuntimeError(
            "existing collection contract differs in " + ", ".join(changed) + "; "
            "create a new root instead of rewriting evidence"
        )


def group_rows(rows: Iterable[dict[str, Any]], seed: str) -> dict[int, list[dict[str, Any]]]:
    groups: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[source_speaker_id(row)].append(row)
    for speaker_rows in groups.values():
        speaker_rows.sort(key=lambda row: ordering_key(row, seed))
    return dict(groups)


def completed_seconds_by_speaker(completed: Iterable[dict[str, Any]]) -> dict[int, float]:
    seconds: dict[int, float] = defaultdict(float)
    for metadata in completed:
        speaker = metadata.get("sourceSpeakerId")
        duration = metadata.get("sourceProbe", {}).get("durationSec")
        if isinstance(speaker, int) and isinstance(duration, (int, float)):
            seconds[speaker] += float(duration)
    return dict(seconds)


def choose_round(
    groups: dict[int, list[dict[str, Any]]],
    completed_rows: set[int],
    failed_rows: set[int],
    used_texts: set[str],
    speaker_seconds: dict[int, float],
    per_speaker_cap_sec: float,
    round_number: int,
    total_seconds: float,
    target_seconds: float,
) -> list[dict[str, Any]]:
    speakers = sorted(groups)
    if not speakers:
        return []
    rotation = round_number % len(speakers)
    rotated = speakers[rotation:] + speakers[:rotation]
    reserved_texts: set[str] = set()
    selected: list[dict[str, Any]] = []
    for speaker in rotated:
        if speaker_seconds.get(speaker, 0.0) >= per_speaker_cap_sec:
            continue
        for row in groups[speaker]:
            row_index = source_row_index(row)
            text_key = normalize_text_key(source_text(row))
            if row_index in completed_rows or row_index in failed_rows:
                continue
            if text_key in used_texts or text_key in reserved_texts:
                continue
            selected.append(row)
            reserved_texts.add(text_key)
            break
    if round_number > 0 and selected:
        remaining = max(0.0, target_seconds - total_seconds)
        soft_limit = max(1, math.ceil(remaining / ESTIMATED_CLIP_SEC))
        selected = selected[:soft_limit]
    return selected


def make_item_metadata(
    row: dict[str, Any],
    root: Path,
    source_path: Path,
    reference_path: Path,
    source_probe: dict[str, Any],
    source_sha256: str,
    reference_sha256: str,
    dataset_revision: str,
    content_length: int | None,
    selection_round: int,
    per_speaker_seconds_after: float,
) -> dict[str, Any]:
    payload = source_payload(row)
    speaker_id = source_speaker_id(row)
    source_duration = source_probe["durationSec"]
    return {
        "collectorVersion": COLLECTOR_VERSION,
        "collectedAt": utc_now(),
        "sourceRowIndex": source_row_index(row),
        "sourceRecordId": source_record_id(row),
        "sourceFamily": "openslr_slr40_zeroth_korean",
        "sourceGroup": "openslr-slr40-zeroth-korean",
        "seriesGroup": "zeroth-korean-train",
        "sourceOrDerived": "source_distribution_artifact",
        "sourceOriginalStatus": "mirror-distributed-16khz-flac; upstream recording master/container not claimed",
        "sourceRenditionPolicy": {
            "action": "preserve downloaded mirror FLAC unchanged",
            "conversion": "none",
            "transcodeCount": 0,
            "reason": "the mirror's 16 kHz FLAC is the selected source distribution; FLAC conversion is not presented as restoration",
        },
        "sourceDataset": {
            "officialLandingPage": OFFICIAL_DATASET_PAGE,
            "officialArchiveUrl": OFFICIAL_ARCHIVE_URL,
            "mirrorRepository": DATASET_REPOSITORY,
            "mirrorRevision": dataset_revision,
            "mirrorConfig": DATASET_CONFIG,
            "upstreamSplit": UPSTREAM_SPLIT,
            "sourceRowIndex": source_row_index(row),
            "sourceRecordId": source_record_id(row),
            "sourceRelativePath": source_relative_path(row),
            "sourceChapterId": payload.get("chapter_id"),
            "transportHost": "datasets-server.huggingface.co",
            "contentLengthHeader": content_length,
        },
        "rights": {
            "license": "CC BY 4.0",
            "licenseUrl": LICENSE_URL,
            "licenseEvidenceUrl": OFFICIAL_DATASET_PAGE,
            "attribution": "Zeroth Project (Lucas Jo / Atlas Guide Inc.; Wonkyum Lee / Gridspace Inc.) via OpenSLR SLR40; CC BY 4.0",
            "rightsStatus": "cc_by_4_0_attribution_required_pending_human_qc",
        },
        "sourcePath": str(source_path.relative_to(root)),
        "sourceSha256": source_sha256,
        "sourceProbe": source_probe,
        "referenceTextPath": str(reference_path.relative_to(root)),
        "referenceTextSha256": reference_sha256,
        "referenceTranscript": {
            "kind": "source-provided utterance transcript",
            "status": "not_yet_human_listened_or_alignment_qc",
            "wordTiming": "not_available",
        },
        "normalizedTranscriptKey": normalize_text_key(source_text(row)),
        "sourceSpeakerId": speaker_id,
        "voiceClusterCandidate": f"zeroth-speaker:{speaker_id}",
        "speakerDiversityEvidence": "source-provided pseudonymous speaker_id; no biometric re-identification performed",
        "observedSpeakerCount": 1,
        "hasVerifiedOverlap": False,
        "primarySpeakerReuseRisk": "bounded_by_150_seconds_per_source_speaker",
        "perSpeakerCollectedSecAfter": round(per_speaker_seconds_after, 6),
        "selectionRound": selection_round,
        "diversityTargetEligible": False,
        "modelTaskEligibility": {
            "asr": "candidate_pending_listening_and_transcript_qc",
            "diarization": "not_applicable_single_speaker_utterance",
            "wordTiming": "not_evidenced_no_word_time_gold",
            "meetingSummary": "not_applicable_no_meeting_gold",
        },
        "modelTaskSuitability": {
            "status": "asr_clean_diverse_reference_only",
            "notCountedFor": ["multi_speaker_diarization", "overlap", "meeting_summary", "100h_diverse_voice_target"],
        },
        "trainingEligible": False,
        "goldStatus": "none",
        "split": "intake_pending",
        "audioSentExternally": False,
        "promotionBlockers": [
            "human_listening_qc",
            "source_transcript_alignment_qc",
            "asr_text_normalization_review",
            "speaker_disjoint_split_assignment",
            "attribution_registry",
        ],
    }


def collect_one(
    row: dict[str, Any],
    root: Path,
    dataset_revision: str,
    selection_round: int,
    per_speaker_seconds_before: float,
    part_suffix: str,
) -> dict[str, Any]:
    record_id = source_record_id(row)
    alias = f"zeroth-{record_id}"
    source_path = root / "00_source" / f"{alias}.flac"
    reference_path = root / "02_references" / f"{alias}.txt"
    item_path = metadata_path(root, alias)
    if item_path.exists():
        raise RuntimeError(f"item metadata already exists and is preserved: {item_path}")
    content_length, source_sha256 = download_clip(audio_url(row), source_path, part_suffix)
    source_probe = probe_audio(source_path)
    reference_sha256 = write_reference(reference_path, source_text(row))
    metadata = make_item_metadata(
        row=row,
        root=root,
        source_path=source_path,
        reference_path=reference_path,
        source_probe=source_probe,
        source_sha256=source_sha256,
        reference_sha256=reference_sha256,
        dataset_revision=dataset_revision,
        content_length=content_length,
        selection_round=selection_round,
        per_speaker_seconds_after=per_speaker_seconds_before + source_probe["durationSec"],
    )
    write_new_json(item_path, metadata)
    return metadata


def summarize(completed: Iterable[dict[str, Any]]) -> dict[str, Any]:
    items = list(completed)
    speaker_seconds = completed_seconds_by_speaker(items)
    codec_counts: dict[str, int] = defaultdict(int)
    sample_rates: dict[str, int] = defaultdict(int)
    for item in items:
        probe = item.get("sourceProbe", {})
        codec_counts[str(probe.get("codec"))] += 1
        sample_rates[str(probe.get("sampleRate"))] += 1
    return {
        "items": len(items),
        "sourceHours": round(sum(speaker_seconds.values()) / 3600, 9),
        "sourceSpeakers": len(speaker_seconds),
        "maxSecondsPerSourceSpeaker": round(max(speaker_seconds.values(), default=0.0), 6),
        "minSecondsPerSourceSpeaker": round(min(speaker_seconds.values(), default=0.0), 6),
        "uniqueTranscriptKeys": len({item.get("normalizedTranscriptKey") for item in items}),
        "codecCounts": dict(sorted(codec_counts.items())),
        "sampleRateCounts": dict(sorted(sample_rates.items())),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--collect", action="store_true", help="download the selected bounded intake")
    parser.add_argument("--target-hours", type=float, default=4.0)
    parser.add_argument("--per-speaker-seconds", type=float, default=150.0)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--selection-seed", default="faith-zeroth-asr-v0.1")
    parser.add_argument("--request-delay-sec", type=float, default=0.03)
    parser.add_argument("--max-rounds", type=int, help="test-only ceiling for selection rounds")
    args = parser.parse_args()

    if args.target_hours <= 0 or args.per_speaker_seconds <= 0:
        raise SystemExit("--target-hours and --per-speaker-seconds must be positive")
    if args.workers < 1 or args.workers > 12:
        raise SystemExit("--workers must be between 1 and 12")
    if args.request_delay_sec < 0:
        raise SystemExit("--request-delay-sec cannot be negative")

    root = args.root
    info = fetch_dataset_info()
    dataset_revision = info["sha"]
    contract = {
        "collectorVersion": COLLECTOR_VERSION,
        "createdAt": utc_now(),
        "purpose": "bounded ASR clean/read-speech reference; excluded from multi-speaker and 100-hour diverse-voice totals",
        "datasetRepository": DATASET_REPOSITORY,
        "datasetRevision": dataset_revision,
        "datasetConfig": DATASET_CONFIG,
        "upstreamSplit": UPSTREAM_SPLIT,
        "upstreamTestSplitPolicy": "not queried or collected; retained as upstream external test",
        "officialDatasetPage": OFFICIAL_DATASET_PAGE,
        "officialArchiveUrl": OFFICIAL_ARCHIVE_URL,
        "perSpeakerCapSec": args.per_speaker_seconds,
        "targetHours": args.target_hours,
        "selectionSeed": args.selection_seed,
        "selectionOrdering": "round-robin across source-provided speaker_id, stable SHA-256 record ordering, no repeated normalized transcript",
        "transport": "Hugging Face datasets-server per-row FLAC; transient signed asset URLs never persisted",
        "rights": {
            "license": "CC BY 4.0",
            "licenseEvidenceUrl": OFFICIAL_DATASET_PAGE,
            "attributionRequired": True,
        },
        "sourceRendition": "mirror-distributed 16 kHz FLAC retained as received; no conversion or false restoration claim",
        "createdBy": COLLECTOR_VERSION,
    }
    ensure_contract(root, contract)
    completed_by_row, used_texts, integrity_errors = load_completed(root)
    if integrity_errors:
        raise SystemExit("existing item metadata integrity errors:\n" + "\n".join(integrity_errors))

    rows = fetch_rows(args.request_delay_sec)
    groups = group_rows(rows, args.selection_seed)
    if len(groups) < 100:
        raise SystemExit(f"unexpectedly low source speaker count: {len(groups)}")
    target_seconds = args.target_hours * 3600
    speaker_seconds = completed_seconds_by_speaker(completed_by_row.values())
    total_seconds = sum(speaker_seconds.values())
    run = {
        "runId": run_id(),
        "startedAt": utc_now(),
        "collectorVersion": COLLECTOR_VERSION,
        "collect": args.collect,
        "datasetRevision": dataset_revision,
        "rowsFetched": len(rows),
        "sourceSpeakersObserved": len(groups),
        "targetSeconds": target_seconds,
        "perSpeakerCapSec": args.per_speaker_seconds,
        "workers": args.workers,
        "selectionSeed": args.selection_seed,
        "existing": summarize(completed_by_row.values()),
        "events": [],
        "errors": [],
    }

    if not args.collect:
        rough_max_seconds = min(len(groups) * args.per_speaker_seconds, target_seconds)
        run["dryRunEstimate"] = {
            "roughMaxHours": round(rough_max_seconds / 3600, 6),
            "note": "actual duration is measured only after source FLAC preservation and ffprobe",
        }
        run["finishedAt"] = utc_now()
        run["result"] = summarize(completed_by_row.values())
        write_new_json(root / "00_intake" / "runs" / f"{run['runId']}.json", run)
        print(json.dumps(run["dryRunEstimate"], ensure_ascii=False))
        return

    free_bytes = shutil.disk_usage(root.parent).free
    if free_bytes < 2 * 1024**3:
        raise SystemExit(f"insufficient free space for bounded intake: {free_bytes} bytes")

    failed_rows: set[int] = set()
    round_number = 0
    while total_seconds < target_seconds:
        if args.max_rounds is not None and round_number >= args.max_rounds:
            run["events"].append({"round": round_number, "status": "max_rounds_reached"})
            break
        selected = choose_round(
            groups=groups,
            completed_rows=set(completed_by_row),
            failed_rows=failed_rows,
            used_texts=used_texts,
            speaker_seconds=speaker_seconds,
            per_speaker_cap_sec=args.per_speaker_seconds,
            round_number=round_number,
            total_seconds=total_seconds,
            target_seconds=target_seconds,
        )
        if not selected:
            run["events"].append({"round": round_number, "status": "no_eligible_rows"})
            break
        round_started = utc_now()
        successes: list[dict[str, Any]] = []
        errors: list[dict[str, Any]] = []
        suffix = f"{run['runId']}-r{round_number}"
        with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = {
                executor.submit(
                    collect_one,
                    row,
                    root,
                    dataset_revision,
                    round_number,
                    speaker_seconds.get(source_speaker_id(row), 0.0),
                    suffix,
                ): row
                for row in selected
            }
            for future in concurrent.futures.as_completed(futures):
                row = futures[future]
                row_index = source_row_index(row)
                try:
                    metadata = future.result()
                except (OSError, RuntimeError, subprocess.CalledProcessError, urllib.error.URLError) as error:
                    failed_rows.add(row_index)
                    errors.append(
                        {
                            "sourceRowIndex": row_index,
                            "sourceRecordId": source_record_id(row),
                            "sourceSpeakerId": source_speaker_id(row),
                            "error": str(error),
                            "signedUrlPersisted": False,
                        }
                    )
                else:
                    successes.append(metadata)

        for metadata in sorted(successes, key=lambda item: item["sourceRowIndex"]):
            row_index = metadata["sourceRowIndex"]
            speaker = metadata["sourceSpeakerId"]
            duration = float(metadata["sourceProbe"]["durationSec"])
            completed_by_row[row_index] = metadata
            used_texts.add(metadata["normalizedTranscriptKey"])
            speaker_seconds[speaker] = speaker_seconds.get(speaker, 0.0) + duration
            total_seconds += duration
        event = {
            "round": round_number,
            "startedAt": round_started,
            "finishedAt": utc_now(),
            "requested": len(selected),
            "succeeded": len(successes),
            "failed": len(errors),
            "completedSourceHoursAfter": round(total_seconds / 3600, 9),
            "sourceSpeakersAfter": len(speaker_seconds),
        }
        run["events"].append(event)
        run["errors"].extend(errors)
        print(json.dumps(event, ensure_ascii=False), flush=True)
        round_number += 1

    run["finishedAt"] = utc_now()
    run["result"] = summarize(completed_by_row.values())
    write_new_json(root / "00_intake" / "runs" / f"{run['runId']}.json", run)
    print(json.dumps(run["result"], ensure_ascii=False))


if __name__ == "__main__":
    main()
