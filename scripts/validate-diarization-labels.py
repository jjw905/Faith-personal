#!/usr/bin/env python3
"""Validate a human diarization label file before gold promotion.

This validator is intentionally conservative. It validates the label contract,
checks interval and overlap structure, optionally matches the source to the
pilot queue, and never treats PREANNOTATED output as gold.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple


REPO_ROOT = Path(__file__).resolve().parents[1]
ALLOWED_REVIEW_STATUSES = {
    "PREANNOTATED",
    "REVIEWED",
    "DOUBLE_REVIEWED",
    "ADJUDICATED",
    "AMBIGUOUS",
    "REJECTED",
}
ALLOWED_WORKFLOW_STATUSES = ALLOWED_REVIEW_STATUSES | {"PENDING_HUMAN_REVIEW"}
PROMOTABLE_REVIEW_STATUSES = {"REVIEWED", "DOUBLE_REVIEWED", "ADJUDICATED"}
NON_SPEECH_TAGS = {
    "non_speech_event",
    "applause",
    "laughter",
    "cough",
    "playback_audio",
    "silence",
}
RELATION_TYPES = {
    "SAME_SPEAKER_REAPPEARANCE",
    "DIFFERENT_SPEAKER_SEPARATION",
}
SPEAKER_ID_PATTERN = re.compile(r"^SPK_[A-Za-z0-9_-]+$")


class Validation:
    def __init__(self) -> None:
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def error(self, message: str) -> None:
        self.errors.append(message)

    def warning(self, message: str) -> None:
        self.warnings.append(message)


def as_number(value: Any, field: str, validation: Validation) -> Optional[float]:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        validation.error(f"{field} must be a number")
        return None
    number = float(value)
    if not math.isfinite(number):
        validation.error(f"{field} must be finite")
        return None
    return number


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def queue_task(queue: Dict[str, Any], session_id: str) -> Optional[Dict[str, Any]]:
    for task in [*(queue.get("tasks") or []), *(queue.get("followupTasks") or [])]:
        if isinstance(task, dict) and task.get("sessionId") == session_id:
            return task
    return None


def validate_queue_match(
    labels: Dict[str, Any], queue_path: Path, validation: Validation
) -> Optional[Dict[str, Any]]:
    try:
        queue = load_json(queue_path)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        validation.error(f"could not load queue {queue_path}: {exc}")
        return None

    session_id = labels.get("sessionId")
    task = queue_task(queue, session_id) if isinstance(session_id, str) else None
    if task is None:
        validation.error(f"sessionId {session_id!r} is not present in queue")
        return None

    label_source = labels.get("source") or {}
    queue_source = task.get("source") or {}
    if label_source.get("sha256") != queue_source.get("sha256"):
        validation.error("source.sha256 does not match the selected queue task")
    if label_source.get("path") != queue_source.get("path"):
        validation.error("source.path does not match the selected queue task")

    label_duration = as_number(label_source.get("durationSec"), "source.durationSec", validation)
    queue_duration = as_number(queue_source.get("durationSec"), "queue.source.durationSec", validation)
    if label_duration is not None and queue_duration is not None and abs(label_duration - queue_duration) > 1.0:
        validation.error("source.durationSec differs from the queue by more than 1 second")
    return task


def validate_top_level(labels: Dict[str, Any], validation: Validation) -> Tuple[Optional[float], str]:
    if labels.get("schemaVersion") != "diarization-labels.v1":
        validation.error("schemaVersion must be diarization-labels.v1")

    session_id = labels.get("sessionId")
    source_id = labels.get("sourceId")
    if not isinstance(session_id, str) or not session_id:
        validation.error("sessionId is required")
    if not isinstance(source_id, str) or not source_id:
        validation.error("sourceId is required")

    source = labels.get("source")
    if not isinstance(source, dict):
        validation.error("source object is required")
        duration = None
    else:
        if not isinstance(source.get("path"), str) or not source.get("path"):
            validation.error("source.path is required")
        if not isinstance(source.get("sha256"), str) or not source.get("sha256"):
            validation.error("source.sha256 is required")
        duration = as_number(source.get("durationSec"), "source.durationSec", validation)
        if duration is not None and duration <= 0:
            validation.error("source.durationSec must be positive")

    review = labels.get("review")
    if not isinstance(review, dict):
        validation.error("review object is required")
        review_status = "MISSING"
    else:
        review_status = review.get("status")
        if review_status not in ALLOWED_WORKFLOW_STATUSES:
            validation.error(f"review.status must be one of {sorted(ALLOWED_WORKFLOW_STATUSES)}")
        reviewer_ids = review.get("reviewerIds", [])
        if not isinstance(reviewer_ids, list) or any(not isinstance(item, str) or not item for item in reviewer_ids):
            validation.error("review.reviewerIds must be a list of non-empty strings")
        elif review_status == "REVIEWED" and len(reviewer_ids) < 1:
            validation.error("REVIEWED labels require at least one reviewerId")
        elif review_status in {"DOUBLE_REVIEWED", "ADJUDICATED"} and len(reviewer_ids) < 2:
            validation.error("DOUBLE_REVIEWED/ADJUDICATED labels require two independent reviewerIds")
        if review_status == "ADJUDICATED" and not isinstance(review.get("adjudicatorId"), str):
            validation.error("ADJUDICATED labels require adjudicatorId")

    gates = labels.get("gates") or {}
    rights_status = gates.get("rightsStatus", labels.get("rightsStatus"))
    if rights_status not in {"approved", "cleared", "passed"}:
        validation.warning("rights gate is not approved; this file cannot be promoted to training")

    return duration, review_status


def validate_segments(
    labels: Dict[str, Any], duration: Optional[float], validation: Validation
) -> Tuple[int, int, Set[str], int, bool]:
    segments = labels.get("segments")
    if not isinstance(segments, list) or not segments:
        validation.error("segments must be a non-empty list")
        return 0, 0, set(), 0, False

    seen_ids: Set[str] = set()
    speaker_ids: Set[str] = set()
    speech_intervals: List[Tuple[float, float, Set[str], Optional[str], str]] = []
    overlap_groups: Dict[str, List[Tuple[float, float, Set[str], str]]] = defaultdict(list)
    segment_count = 0
    speech_count = 0
    has_preannotated = False

    for index, segment in enumerate(segments):
        prefix = f"segments[{index}]"
        if not isinstance(segment, dict):
            validation.error(f"{prefix} must be an object")
            continue
        segment_count += 1

        segment_id = segment.get("segmentId")
        if not isinstance(segment_id, str) or not segment_id:
            validation.error(f"{prefix}.segmentId is required")
        elif segment_id in seen_ids:
            validation.error(f"{prefix}.segmentId is duplicated: {segment_id}")
        else:
            seen_ids.add(segment_id)

        start = as_number(segment.get("startSec"), f"{prefix}.startSec", validation)
        end = as_number(segment.get("endSec"), f"{prefix}.endSec", validation)
        if start is not None and end is not None:
            if start < 0:
                validation.error(f"{prefix}.startSec cannot be negative")
            if end <= start:
                validation.error(f"{prefix}.endSec must be greater than startSec")
            if duration is not None and end > duration + 0.25:
                validation.error(f"{prefix}.endSec exceeds source duration")

        speakers = segment.get("speakerLocalId", [])
        if not isinstance(speakers, list) or any(not isinstance(item, str) for item in speakers):
            validation.error(f"{prefix}.speakerLocalId must be a list of strings")
            speakers = []
        if len(set(speakers)) != len(speakers):
            validation.error(f"{prefix}.speakerLocalId contains duplicates")
        for speaker_id in speakers:
            if not SPEAKER_ID_PATTERN.match(speaker_id):
                validation.error(f"{prefix}.speakerLocalId has invalid ID: {speaker_id}")
            speaker_ids.add(speaker_id)

        tags = segment.get("tags", [])
        if not isinstance(tags, list) or any(not isinstance(item, str) for item in tags):
            validation.error(f"{prefix}.tags must be a list of strings")
            tags = []
        tags_set = set(tags)
        overlap_group_id = segment.get("overlapGroupId")
        if overlap_group_id is not None and (not isinstance(overlap_group_id, str) or not overlap_group_id):
            validation.error(f"{prefix}.overlapGroupId must be a non-empty string or null")
            overlap_group_id = None

        review_status = segment.get("reviewStatus")
        if review_status not in ALLOWED_REVIEW_STATUSES:
            validation.error(f"{prefix}.reviewStatus is invalid")
        if review_status == "PREANNOTATED":
            has_preannotated = True
        if review_status == "AMBIGUOUS" and not isinstance(segment.get("ambiguousReason"), str):
            validation.error(f"{prefix}.ambiguousReason is required for AMBIGUOUS segments")
        if not isinstance(segment.get("evidenceSource"), str) or not segment.get("evidenceSource"):
            validation.error(f"{prefix}.evidenceSource is required")

        is_non_speech = bool(tags_set & NON_SPEECH_TAGS)
        if not speakers and not is_non_speech and review_status != "AMBIGUOUS":
            validation.error(f"{prefix} has no speakerLocalId and is not a non-speech or AMBIGUOUS segment")
        if is_non_speech and speakers:
            validation.error(f"{prefix} non-speech events must not carry speakerLocalId")

        if len(speakers) > 1 or "overlap_speech" in tags_set:
            if not overlap_group_id:
                validation.error(f"{prefix} overlap requires overlapGroupId")
        if overlap_group_id and start is not None and end is not None:
            overlap_groups[overlap_group_id].append((start, end, set(speakers), prefix))
        if speakers and start is not None and end is not None and end > start:
            speech_count += 1
            speech_intervals.append((start, end, set(speakers), overlap_group_id, prefix))

    for group_id, members in overlap_groups.items():
        if len(members) < 2:
            validation.error(f"overlapGroupId {group_id} must contain at least two segment rows")
            continue
        has_real_overlap = False
        for index, left in enumerate(members):
            for right in members[index + 1 :]:
                if left[1] > right[0] and right[1] > left[0] and left[2].isdisjoint(right[2]):
                    has_real_overlap = True
        if not has_real_overlap:
            validation.error(f"overlapGroupId {group_id} has no overlapping rows from distinct speakers")

    # A pairwise check is acceptable for the small pilot labels and gives a
    # precise error when overlapping speech was flattened without a group.
    for index, left in enumerate(speech_intervals):
        for right in speech_intervals[index + 1 :]:
            if left[1] <= right[0] or right[1] <= left[0] or not left[2].isdisjoint(right[2]):
                continue
            if not left[3] or left[3] != right[3]:
                validation.error(
                    f"{left[4]} and {right[4]} overlap across distinct speakers without one shared overlapGroupId"
                )

    return segment_count, speech_count, speaker_ids, len(overlap_groups), has_preannotated


def validate_speaker_relations(labels: Dict[str, Any], validation: Validation) -> int:
    """Validate pair annotations used by reappearance/separation diagnostics."""

    relations = labels.get("speakerRelations", [])
    if not isinstance(relations, list):
        validation.error("speakerRelations must be a list")
        return 0

    segments = {
        segment.get("segmentId"): segment
        for segment in labels.get("segments", [])
        if isinstance(segment, dict) and isinstance(segment.get("segmentId"), str)
    }
    seen_ids: Set[str] = set()
    valid_count = 0
    for index, relation in enumerate(relations):
        prefix = f"speakerRelations[{index}]"
        if not isinstance(relation, dict):
            validation.error(f"{prefix} must be an object")
            continue
        relation_id = relation.get("relationId")
        if not isinstance(relation_id, str) or not relation_id:
            validation.error(f"{prefix}.relationId is required")
        elif relation_id in seen_ids:
            validation.error(f"{prefix}.relationId is duplicated: {relation_id}")
        else:
            seen_ids.add(relation_id)

        relation_type = relation.get("type")
        if relation_type not in RELATION_TYPES:
            validation.error(f"{prefix}.type must be one of {sorted(RELATION_TYPES)}")

        first_id = relation.get("firstSegmentId")
        second_id = relation.get("secondSegmentId")
        first = segments.get(first_id)
        second = segments.get(second_id)
        if not isinstance(first_id, str) or first_id not in segments:
            validation.error(f"{prefix}.firstSegmentId must reference an existing segment")
        if not isinstance(second_id, str) or second_id not in segments:
            validation.error(f"{prefix}.secondSegmentId must reference an existing segment")
        if first_id == second_id:
            validation.error(f"{prefix} cannot reference the same segment twice")

        review_status = relation.get("reviewStatus")
        if review_status not in ALLOWED_REVIEW_STATUSES:
            validation.error(f"{prefix}.reviewStatus is invalid")
        if not isinstance(relation.get("evidenceSource"), str) or not relation.get("evidenceSource"):
            validation.error(f"{prefix}.evidenceSource is required")

        if isinstance(first, dict) and isinstance(second, dict):
            first_start = as_number(first.get("startSec"), f"{prefix}.first.startSec", validation)
            first_end = as_number(first.get("endSec"), f"{prefix}.first.endSec", validation)
            second_start = as_number(second.get("startSec"), f"{prefix}.second.startSec", validation)
            if (
                relation_type == "SAME_SPEAKER_REAPPEARANCE"
                and first_end is not None
                and second_start is not None
                and second_start < first_end
            ):
                validation.error(f"{prefix} same-speaker reappearance segments must be ordered with a gap")
            if relation_type == "SAME_SPEAKER_REAPPEARANCE":
                first_speakers = set(first.get("speakerLocalId", []))
                second_speakers = set(second.get("speakerLocalId", []))
                if (
                    review_status in PROMOTABLE_REVIEW_STATUSES
                    and (
                        len(first_speakers) != 1
                        or len(second_speakers) != 1
                        or first_speakers != second_speakers
                    )
                ):
                    validation.error(f"{prefix} reviewed SAME_SPEAKER_REAPPEARANCE must name the same single speaker")
                if first_end is not None and second_start is not None:
                    gap = max(0.0, second_start - first_end)
                    recorded_gap = as_number(relation.get("gapSec"), f"{prefix}.gapSec", validation)
                    if recorded_gap is not None and abs(recorded_gap - gap) > 0.25:
                        validation.error(f"{prefix}.gapSec differs from segment gap by more than 0.25 seconds")
            if relation_type == "DIFFERENT_SPEAKER_SEPARATION" and review_status in PROMOTABLE_REVIEW_STATUSES:
                first_speakers = set(first.get("speakerLocalId", []))
                second_speakers = set(second.get("speakerLocalId", []))
                if first_speakers & second_speakers:
                    validation.error(f"{prefix} reviewed DIFFERENT_SPEAKER_SEPARATION must use different speakers")
        valid_count += 1
    return valid_count


def validate_labels(labels: Dict[str, Any], queue_path: Optional[Path]) -> Dict[str, Any]:
    validation = Validation()
    duration, review_status = validate_top_level(labels, validation)
    matched_task = None
    if queue_path is not None:
        matched_task = validate_queue_match(labels, queue_path, validation)
    segment_count, speech_count, speaker_ids, overlap_group_count, has_preannotated = validate_segments(
        labels, duration, validation
    )
    relation_count = validate_speaker_relations(labels, validation)

    gates = labels.get("gates") or {}
    requested_training = bool(gates.get("trainingEligible", labels.get("trainingEligible", False)))
    requested_gold = gates.get("diarizationGoldStatus", labels.get("goldStatus", "none"))
    rights_status = gates.get("rightsStatus", labels.get("rightsStatus"))
    eligible_for_gold = (
        not validation.errors
        and review_status in PROMOTABLE_REVIEW_STATUSES
        and rights_status in {"approved", "cleared", "passed"}
        and not has_preannotated
    )
    if requested_training and not eligible_for_gold:
        validation.error("trainingEligible cannot be true until all gold promotion gates pass")
    if requested_gold not in {None, "none", "gold", "adjudicated"}:
        validation.error("unknown diarization gold status")

    report: Dict[str, Any] = {
        "schemaVersion": "diarization-label-validation-report.v1",
        "ok": not validation.errors,
        "eligibleForGold": eligible_for_gold,
        "sessionId": labels.get("sessionId"),
        "sourceId": labels.get("sourceId"),
        "reviewStatus": review_status,
        "requestedTrainingEligible": requested_training,
        "requestedGoldStatus": requested_gold,
        "segmentCount": segment_count,
        "speechSegmentCount": speech_count,
        "speakerIds": sorted(speaker_ids),
        "overlapGroupCount": overlap_group_count,
        "speakerRelationCount": relation_count,
        "queueTaskMatched": matched_task is not None if queue_path is not None else None,
        "errors": validation.errors,
        "warnings": validation.warnings,
    }
    return report


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--labels", type=Path, required=True, help="human label JSON file")
    parser.add_argument(
        "--queue",
        type=Path,
        help="optional diarization-pilot-queue.v1.json used to verify source lineage",
    )
    return parser.parse_args(list(argv))


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    labels_path = args.labels if args.labels.is_absolute() else REPO_ROOT / args.labels
    queue_path = None
    if args.queue is not None:
        queue_path = args.queue if args.queue.is_absolute() else REPO_ROOT / args.queue

    try:
        labels = load_json(labels_path)
        report = validate_labels(labels, queue_path)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        report = {
            "schemaVersion": "diarization-label-validation-report.v1",
            "ok": False,
            "eligibleForGold": False,
            "errors": [str(exc)],
            "warnings": [],
        }

    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
