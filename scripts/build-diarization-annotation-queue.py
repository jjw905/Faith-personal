#!/usr/bin/env python3
"""Build a human-review queue for the diarization pilot.

The queue deliberately keeps candidate conditions separate from confirmed gold.
It reads the existing source manifests, preserves their hashes and paths, and
fails closed if a source is missing or the selected source hours exceed the
pilot budget.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = (
    REPO_ROOT
    / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa"
    / "diarization-pilot-queue.v1.json"
)


SELECTED_SPECS: List[Dict[str, Any]] = [
    {
        "taskId": "PILOT-001",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_상황진단_공식공청회_2026-08-06/03_meta/ktv-criminal-justice-joint-debate-20260506-wUdKXlTmW94.json",
        "pilotRole": "focused_actual_overlap_candidate",
        "primaryBucket": "focused_diagnostic",
        "primaryDomain": "hearing_debate_panel",
        "primaryFocus": "actual_overlap_speech_candidate",
        "candidateTags": [
            "actual_overlap_speech_candidate",
            "multiple_panelists",
            "room_reverb_candidate",
        ],
        "selectionReason": "상황 집중 파일럿의 실제 동시발화 후보를 포함한다. 겹침은 사람 청취 전까지 확정하지 않는다.",
    },
    {
        "taskId": "PILOT-002",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_상황진단_공식공청회_2026-08-06/03_meta/ktv-townhall-20191119-VbDeuUJZ60g.json",
        "pilotRole": "focused_stationary_noise_candidate",
        "primaryBucket": "focused_diagnostic",
        "primaryDomain": "town_hall",
        "primaryFocus": "stationary_background_noise_candidate",
        "candidateTags": [
            "stationary_background_noise_candidate",
            "audience_ambience_candidate",
            "multiple_citizen_speakers",
        ],
        "selectionReason": "자연 배경소음과 즉흥 질문이 함께 있는 상황 집중 후보를 포함한다.",
    },
    {
        "taskId": "PILOT-003",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_수집_공식회의_속기록_2026-08-05/03_meta/busan-332-adminculture-14013.json",
        "pilotRole": "natural_multi_speaker_five_plus_candidate",
        "primaryBucket": "natural_complex",
        "primaryDomain": "official_council_meeting",
        "primaryFocus": None,
        "candidateTags": [
            "multi_speaker_candidate",
            "five_plus_speaker_label_evidence",
            "official_minutes_without_frame_offsets",
            "long_gap_reappearance_not_yet_verified",
        ],
        "selectionReason": "5명 이상 다화자 파일럿 조건을 충족할 가능성이 높은 공식 회의 후보다. 회의록 화자명 수는 시각 정렬 골드가 아니다.",
    },
    {
        "taskId": "PILOT-004",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_상황진단_공식공청회_2026-08-06/03_meta/natv-constitutional-citizen-hearing-20230926-h7xBOYOGtFw.json",
        "pilotRole": "focused_far_mic_reverb_candidate",
        "primaryBucket": "focused_diagnostic",
        "primaryDomain": "hearing_debate_panel",
        "primaryFocus": "far_mic_reverb_candidate",
        "candidateTags": [
            "far_mic_reverb_candidate",
            "hearing_debate_panel",
            "compression_channel_candidate",
        ],
        "selectionReason": "원거리·잔향 후보를 상황 집중 파일럿에 포함한다. 거리와 마스킹 정도는 청취 라벨로 다시 기록한다.",
    },
    {
        "taskId": "PILOT-005",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_상황진단_공식공청회_2026-08-06/03_meta/governors-local-autonomy-debate-20210927-GCnhtZ_K1Qc.json",
        "pilotRole": "natural_similar_timbre_candidate",
        "primaryBucket": "natural_complex",
        "primaryDomain": "hearing_debate_panel",
        "primaryFocus": "similar_timbre_candidate",
        "candidateTags": [
            "similar_timbre_candidate",
            "multiple_panelists",
            "compression_channel",
        ],
        "selectionReason": "비슷한 발음·음색과 압축 채널 후보를 자연 복합 파일럿에 포함한다.",
    },
    {
        "taskId": "PILOT-006",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_상황진단_정책브리핑_2026-08-06/03_meta/privacy-plan-20251212.json",
        "pilotRole": "focused_short_new_speaker_candidate",
        "primaryBucket": "focused_diagnostic",
        "primaryDomain": "online_hybrid",
        "primaryFocus": "short_new_speaker",
        "candidateTags": [
            "short_new_speaker_candidate",
            "late_entrant_candidate",
            "online_hybrid",
        ],
        "selectionReason": "중후반의 짧은 새 화자·질문 진입을 확인할 상황 집중 후보를 포함한다.",
    },
    {
        "taskId": "PILOT-007",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_상황진단_정책브리핑_2026-08-06/03_meta/rda-briefing-20260617.json",
        "pilotRole": "clean_single_speaker_control_candidate",
        "primaryBucket": "clean_baseline",
        "primaryDomain": "solo_presentation_lecture",
        "primaryFocus": None,
        "candidateTags": [
            "clean_baseline_candidate",
            "single_speaker_control_candidate",
        ],
        "selectionReason": "깨끗한 기준의 1인 통제 구간 후보다. 과분리와 비음성 사건 기준으로만 사용한다.",
    },
]


FOLLOWUP_SPECS: List[Dict[str, Any]] = [
    {
        "taskId": "FOLLOWUP-001",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_수집_공식회의_속기록_2026-08-05/03_meta/ggc-392-health-welfare-138254.json",
        "pilotRole": "followup_long_gap_reappearance_candidate",
        "primaryBucket": "natural_complex",
        "primaryDomain": "official_council_meeting",
        "primaryFocus": "long_gap_same_speaker_reappearance_candidate",
        "candidateTags": ["long_gap_reappearance_candidate", "official_coarse_event_candidate"],
        "selectionReason": "공식 발언 위치 후보 문서에서 긴 공백 후 재등장 후보로 분류됐지만, 구간 끝과 동일 화자 증거가 없어 파일럿 후속으로 보류한다.",
        "deferReason": "coarse_event_candidate_needs_frame_accurate_human_alignment",
    },
    {
        "taskId": "FOLLOWUP-002",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_수집_공식회의_속기록_2026-08-05/03_meta/ggc-392-urban-environment-138275.json",
        "pilotRole": "followup_long_gap_reappearance_candidate",
        "primaryBucket": "natural_complex",
        "primaryDomain": "official_council_meeting",
        "primaryFocus": "long_gap_same_speaker_reappearance_candidate",
        "candidateTags": ["long_gap_reappearance_candidate", "official_coarse_event_candidate"],
        "selectionReason": "공식 발언 위치 후보 문서에서 긴 공백 후 재등장 후보로 분류됐지만, 구간 끝과 동일 화자 증거가 없어 파일럿 후속으로 보류한다.",
        "deferReason": "coarse_event_candidate_needs_frame_accurate_human_alignment",
    },
    {
        "taskId": "FOLLOWUP-003",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_수집_공식회의_속기록_2026-08-05/03_meta/ggc-392-planning-finance-138263.json",
        "pilotRole": "followup_long_gap_reappearance_candidate",
        "primaryBucket": "natural_complex",
        "primaryDomain": "official_council_meeting",
        "primaryFocus": "long_gap_same_speaker_reappearance_candidate",
        "candidateTags": ["long_gap_reappearance_candidate", "official_coarse_event_candidate"],
        "selectionReason": "공식 발언 위치 후보 문서에서 긴 공백 후 재등장 후보로 분류됐지만, 구간 끝과 동일 화자 증거가 없어 파일럿 후속으로 보류한다.",
        "deferReason": "coarse_event_candidate_needs_frame_accurate_human_alignment",
    },
    {
        "taskId": "FOLLOWUP-004",
        "metadata": "Faith-office/08_검증_정답셋/Faith_STT_수집_공식회의_속기록_2026-08-05/03_meta/ggc-392-agriculture-marine-138269.json",
        "pilotRole": "followup_long_gap_reappearance_candidate",
        "primaryBucket": "natural_complex",
        "primaryDomain": "official_council_meeting",
        "primaryFocus": "long_gap_same_speaker_reappearance_candidate",
        "candidateTags": ["long_gap_reappearance_candidate", "official_coarse_event_candidate"],
        "selectionReason": "공식 발언 위치 후보 문서에서 긴 공백 후 재등장 후보로 분류됐지만, 구간 끝과 동일 화자 증거가 없어 파일럿 후속으로 보류한다.",
        "deferReason": "coarse_event_candidate_needs_frame_accurate_human_alignment",
    },
]


REQUIRED_SEGMENT_FIELDS = [
    "segmentId",
    "startSec",
    "endSec",
    "speakerLocalId[]",
    "overlapGroupId",
    "tags[]",
    "confidence",
    "reviewStatus",
    "ambiguousReason",
    "evidenceSource",
]


def as_float(value: Any, field_name: str, metadata_path: Path) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{metadata_path}: {field_name} is not numeric") from exc
    if result <= 0:
        raise ValueError(f"{metadata_path}: {field_name} must be positive")
    return result


def source_record(spec: Dict[str, Any], selection_status: str) -> Dict[str, Any]:
    metadata_path = REPO_ROOT / spec["metadata"]
    if not metadata_path.is_file():
        raise FileNotFoundError(f"metadata file not found: {metadata_path}")

    with metadata_path.open("r", encoding="utf-8") as handle:
        metadata = json.load(handle)

    source = metadata.get("source") or {}
    source_path = source.get("path")
    if not source_path:
        raise ValueError(f"{metadata_path}: source.path is missing")
    source_sha256 = source.get("sha256")
    if not source_sha256:
        raise ValueError(f"{metadata_path}: source.sha256 is missing")

    source_file = REPO_ROOT / source_path
    if not source_file.is_file():
        raise FileNotFoundError(f"source file not found: {source_file}")

    duration_sec = as_float(source.get("durationSec"), "source.durationSec", metadata_path)
    provenance = metadata.get("provenance") or {}
    quality_gate = metadata.get("qualityGate") or {}
    situation = metadata.get("situationAssessment") or {}
    transcript = metadata.get("transcript") or {}

    observed_speaker_label_count = transcript.get("distinctSpeakerLabelCount")
    if observed_speaker_label_count is not None:
        observed_speaker_label_count = int(observed_speaker_label_count)

    return {
        "recordType": "diarization_annotation_task",
        "taskId": spec["taskId"],
        "sessionId": f"SESSION_{spec['taskId'].replace('-', '_')}",
        "sourceId": f"SOURCE_{spec['taskId'].replace('-', '_')}",
        "selectionStatus": selection_status,
        "pilotRole": spec["pilotRole"],
        "selectionReason": spec["selectionReason"],
        "deferReason": spec.get("deferReason"),
        "candidateOnly": True,
        "source": {
            "metadataPath": spec["metadata"],
            "alias": metadata.get("alias"),
            "path": source_path,
            "sha256": source_sha256,
            "bytes": source.get("bytes"),
            "durationSec": duration_sec,
            "sourcePageUrl": metadata.get("sourcePageUrl") or metadata.get("sourceUrl"),
            "sourceOriginalStatus": source.get("sourceOriginalStatus")
            or metadata.get("sourceOriginalStatus"),
            "reencodedByCollector": source.get("reencodedByCollector"),
            "lineage": {
                "sourceGroup": metadata.get("sourceGroup") or metadata.get("alias"),
                "seriesGroup": metadata.get("seriesGroup") or metadata.get("alias"),
                "sourceFamily": metadata.get("sourceFamily") or provenance.get("sourceFamily"),
                "institution": metadata.get("institution"),
                "committee": metadata.get("committee"),
                "meetingDate": metadata.get("meetingDate"),
                "lineageKeyQuality": "metadata_group_or_alias_fallback",
            },
        },
        "classification": {
            "primaryBucket": spec["primaryBucket"],
            "primaryDomain": spec["primaryDomain"],
            "primaryFocus": spec["primaryFocus"],
            "candidateTags": spec["candidateTags"],
            "speakerProfile": "PENDING_HUMAN_REVIEW",
            "noiseProfile": "PENDING_HUMAN_REVIEW",
            "recordingProfile": "FROM_TECHNICAL_MANIFEST_PENDING_HUMAN_CONFIRMATION",
            "observedSpeakerLabelCount": observed_speaker_label_count,
            "observedSpeakerLabelCountIsGold": False,
        },
        "candidateEvidence": {
            "sourceSituationStatus": situation.get("status"),
            "sourceConfirmedHours": situation.get("confirmedHours", 0),
            "sourceNotEvidenceOf": situation.get("notEvidenceOf", []),
            "automaticOrOfficialReferenceIsGold": False,
            "transcriptAlignmentStatus": transcript.get("alignmentStatus"),
        },
        "review": {
            "status": "PENDING_HUMAN_REVIEW",
            "scope": "full_source_candidate; create only audible, frame-accurate intervals",
            "requiredSegmentFields": REQUIRED_SEGMENT_FIELDS,
            "requiredChecks": [
                "video_and_audio_playback_qc",
                "speakerLocalId_is_session_local_and_consistent_after_reappearance",
                "startSec_endSec_are_frame_or_audio_aligned",
                "overlap_uses_multiple_rows_and_overlapGroupId",
                "short_late_entrant_and_backchannel_are_not_dropped",
                "noise_type_persistence_strength_and_masking_are_recorded",
                "non_speech_events_are_separate_from_speech",
                "AMBIGUOUS_is_preserved_with_reason",
                "evidenceSource_points_to_human_listening_or_visible_evidence",
            ],
            "doubleReviewRequired": True,
            "doubleReviewRate": "15-20% overall; 100% of high-risk intervals",
            "goldPromotionAllowedStatuses": ["REVIEWED", "DOUBLE_REVIEWED", "ADJUDICATED"],
        },
        "gates": {
            "rightsStatus": "PENDING_RIGHTS_REVIEW",
            "rightsGateApplied": bool(
                metadata.get("rightsGateApplied") or provenance.get("rightsGateApplied")
            ),
            "split": "diagnostic_regression",
            "annotationVersion": "diarization-v1-draft",
            "diarizationGoldStatus": "none",
            "wordTimingGoldStatus": "none",
            "trainingEligible": False,
            "sealedTestEligible": False,
            "blockedReasons": [
                "human_diarization_review_not_started",
                "rights_gate_not_passed",
                "candidate_situation_not_confirmed",
            ],
        },
        "collectionEvidence": {
            "intakeGatePassed": bool(quality_gate.get("passedIntakeGate")),
            "sourceTrainingEligibleAtIntake": bool(quality_gate.get("trainingEligible")),
            "sourceGoldStatusAtIntake": quality_gate.get("goldStatus", "none"),
            "audioSentExternally": bool(provenance.get("audioSentExternally")),
        },
    }


def build_queue(max_hours: float) -> Dict[str, Any]:
    selected = [source_record(spec, "selected_for_pilot_review") for spec in SELECTED_SPECS]
    deferred = [source_record(spec, "deferred_followup") for spec in FOLLOWUP_SPECS]

    selected_duration_sec = sum(item["source"]["durationSec"] for item in selected)
    selected_hours = selected_duration_sec / 3600.0
    source_hours_by_bucket: Dict[str, float] = {}
    for item in selected:
        bucket = item["classification"]["primaryBucket"]
        source_hours_by_bucket[bucket] = source_hours_by_bucket.get(bucket, 0.0) + (
            item["source"]["durationSec"] / 3600.0
        )
    if selected_hours < 5.0:
        raise ValueError(f"selected pilot source hours {selected_hours:.3f} is below the 5h minimum")
    if selected_hours > max_hours:
        raise ValueError(
            f"selected pilot source hours {selected_hours:.3f} exceeds --max-hours {max_hours:.3f}"
        )

    source_paths = [item["source"]["path"] for item in selected + deferred]
    if len(source_paths) != len(set(source_paths)):
        raise ValueError("duplicate source paths detected in annotation queue")

    return {
        "schemaVersion": "diarization-pilot-queue.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "READY_FOR_HUMAN_REVIEW",
        "purpose": "화자분리 추가 튜닝 전 사람 검수 파일럿의 source-level 작업 큐",
        "countingRule": "이 시간은 원본 후보 시간이다. confirmedSituationHours와 gold 시간으로 집계하지 않는다.",
        "pilotTarget": {
            "minimumHours": 5.0,
            "softTargetHours": 8.0,
            "maximumHours": 10.0,
            "selectedSourceCount": len(selected),
            "selectedSourceDurationSec": round(selected_duration_sec, 3),
            "selectedSourceHours": round(selected_hours, 6),
            "sourceHoursByBucket": {
                bucket: round(hours, 6) for bucket, hours in sorted(source_hours_by_bucket.items())
            },
            "documentMixTargetHours": {
                "natural_complex": 4.0,
                "focused_diagnostic": 3.0,
                "clean_baseline": 1.0,
            },
            "mixStatus": "SOURCE_CANDIDATE_MIX_REQUIRES_HUMAN_WINDOW_SELECTION",
        },
        "requiredCoverageCandidates": [
            "actual_overlap_speech_candidate",
            "stationary_background_noise_candidate",
            "five_plus_speaker_label_evidence",
            "far_mic_reverb_candidate",
            "similar_timbre_candidate",
            "short_new_speaker_candidate",
            "clean_baseline_candidate",
        ],
        "notYetCompleted": [
            "confirmed_situation_hours",
            "human_diarization_segments",
            "independent_double_review",
            "adjudication",
            "rights_gate",
            "word_timing_gold",
            "train_dev_sealed_split_promotion",
        ],
        "tasks": selected,
        "followupTasks": deferred,
    }


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="output JSON path (default: Faith-office/.../diarization-pilot-queue.v1.json)",
    )
    parser.add_argument(
        "--max-hours",
        type=float,
        default=10.0,
        help="maximum selected source hours; the selected queue is intended to stay within 5-10h",
    )
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        queue = build_queue(args.max_hours)
        output_path = args.output if args.output.is_absolute() else REPO_ROOT / args.output
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with output_path.open("w", encoding="utf-8") as handle:
            json.dump(queue, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"annotation queue build failed: {exc}", file=sys.stderr)
        return 1

    print(json.dumps({
        "output": str(output_path),
        "selectedSourceCount": queue["pilotTarget"]["selectedSourceCount"],
        "selectedSourceHours": queue["pilotTarget"]["selectedSourceHours"],
        "followupSourceCount": len(queue["followupTasks"]),
        "status": queue["status"],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
