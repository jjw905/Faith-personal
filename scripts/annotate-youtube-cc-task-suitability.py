#!/usr/bin/env python3
"""Annotate a collected creator cluster with model-role and diversity limits.

This does not infer a biometric identity.  It uses the channel/series as a
conservative proxy until listening and diarization review establishes the
session's actual speaker composition.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path("Faith-office/08_검증_정답셋/Faith_STT_수집_유튜브_CC_BY_2026-08-05")
DEFAULT_CHANNEL_ID = "UCCaFYslhot_g4QxMjAcC0gg"
VERSION = "youtube-cc-task-suitability-annotation-v0.1"


def now() -> str:
    return datetime.now(UTC).isoformat()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("metadata must be a JSON object")
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--channel-id", default=DEFAULT_CHANNEL_ID)
    parser.add_argument("--series-group", default="didi-korean-culture-podcast")
    parser.add_argument("--apply", action="store_true", help="write annotations into each matching metadata file")
    parser.add_argument(
        "--report",
        type=Path,
        help="report path (default: <root>/04_qa/channel-cluster-task-suitability-report.json)",
    )
    args = parser.parse_args()
    metadata_paths = sorted((args.root / "03_meta").glob("*.json"))
    source_group = f"youtube-channel:{args.channel_id}"
    assessed_at = now()
    matching: list[tuple[Path, dict[str, Any]]] = []
    unexpected: list[str] = []
    for path in metadata_paths:
        metadata = load(path)
        channel_id = metadata.get("catalogChannelId") or (metadata.get("attribution") or {}).get("channelId")
        if channel_id == args.channel_id:
            matching.append((path, metadata))
        else:
            unexpected.append(str(path))

    for path, metadata in matching:
        metadata.update(
            {
                "sourceGroup": source_group,
                "seriesGroup": args.series_group,
                "voiceClusterCandidate": source_group,
                "speakerDiversityEvidence": "unreviewed_single_channel_cluster",
                "observedSpeakerCount": None,
                "hasVerifiedOverlap": False,
                "primarySpeakerReuseRisk": "high_channel_cluster",
                "diversityTargetEligible": False,
                "modelTaskEligibility": {
                    "asr": "candidate_pending_listening_and_transcript_qc",
                    "diarization": "not_evidenced_single_channel_cluster",
                    "wordTiming": "not_evidenced_no_word_gold",
                    "meetingSummary": "not_applicable_podcast_without_meeting_gold",
                },
                "modelTaskSuitability": {
                    "version": VERSION,
                    "assessedAt": assessed_at,
                    "status": "archive_only_not_diverse_training_pool",
                    "reasons": [
                        "single_channel_cluster",
                        "speaker_count_and_overlap_not_human_verified",
                        "manual_vtt_is_not_word_timing_gold",
                        "podcast_source_has_no_meeting_summary_gold",
                    ],
                },
                "trainingEligible": False,
                "goldStatus": "none",
                "split": "intake_pending",
            }
        )
        if args.apply:
            write_json(path, metadata)

    duration_sec = sum(float(metadata.get("sourceDurationSec") or 0) for _, metadata in matching)
    report = {
        "annotationVersion": VERSION,
        "assessedAt": assessed_at,
        "applied": args.apply,
        "channelId": args.channel_id,
        "sourceGroup": source_group,
        "seriesGroup": args.series_group,
        "matchingMetadataFiles": len(matching),
        "matchingSourceDurationSec": round(duration_sec, 3),
        "matchingSourceHours": duration_sec / 3600,
        "unexpectedMetadataFiles": unexpected,
        "verdict": "not_counted_toward_diverse_voice_target",
    }
    report_path = args.report or args.root / "04_qa" / "channel-cluster-task-suitability-report.json"
    write_json(report_path, report)
    print(
        f"annotated {len(matching)} matching files, {report['matchingSourceHours']:.2f}h; "
        f"apply={args.apply}; unexpected={len(unexpected)}"
    )


if __name__ == "__main__":
    main()
