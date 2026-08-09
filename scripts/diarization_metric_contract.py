#!/usr/bin/env python3
"""Shared evaluation contract for the Faith diarization pilot.

The contract is deliberately data-only so that the workspace generator, gate
auditor, and future metric runner cannot silently disagree about what a score
means.  It does not compute DER/JER itself; computation belongs in the pinned
evaluation environment that can read multi-label RTTM/UEM files.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List


METRIC_CONTRACT_VERSION = "diarization-metrics.v2"


METRIC_CONTRACT: Dict[str, Any] = {
    "metricContractVersion": METRIC_CONTRACT_VERSION,
    "status": "ACTIVE_FOR_PILOT_DESIGN",
    "scope": "Faith Community-1 화자분리 튜닝 파일럿",
    "decision": {
        "primaryMetrics": ["der", "jer"],
        "hardConditionMetricsAreRequired": True,
        "boundaryF1IsGate": False,
        "speakerCountIsGate": False,
        "wordMetricsAreOutOfScope": True,
    },
    "researchBasis": [
        {
            "name": "DIHARD evaluation overview",
            "url": "https://dihardchallenge.github.io/dihard1/overview.html",
            "reason": "DER를 FA/MISS/ERROR 구성요소로 분해하고, 겹침·잡음·잔향을 포함한 조건에서 DER와 MI를 함께 사용한다.",
        },
        {
            "name": "pyannote.metrics diarization API",
            "url": "https://pyannote.github.io/pyannote-metrics/reference.html",
            "reason": "최적 일대일 매핑 기반 DER와 overlap 포함/제외 옵션, JER·purity·coverage의 재현 가능한 구현을 제공한다.",
        },
        {
            "name": "pyannote.metrics diarization implementation",
            "url": "https://pyannote.github.io/pyannote-metrics/_modules/pyannote/metrics/diarization.html",
            "reason": "JER의 화자별 집계와 overlap-aware purity/coverage 구현 세부를 고정한다.",
        },
    ],
    "protocol": {
        "evaluationUnit": "session",
        "referenceFormat": "multi-label RTTM plus UEM",
        "hypothesisFormat": "multi-label RTTM plus UEM",
        "referenceRequirement": "human reviewed absolute speaker intervals; simultaneous speakers remain separate rows",
        "uem": "full_audio_after_technical_qc",
        "collarSec": 0.0,
        "skipOverlap": False,
        "overlapPolicy": "main_score_retains_all_reference_and_hypothesis_speakers",
        "labelMapping": "optimal_one_to_one_hungarian_per_session",
        "primaryAggregation": "micro_by_reference_speaker_time",
        "secondaryAggregation": ["macro_mean_by_session", "per_condition_slice"],
        "pairedControl": {
            "id": "overlap_excluded_control",
            "skipOverlap": True,
            "role": "diagnostic_only",
            "reason": "겹침을 제외했을 때의 오류와 겹침을 포함한 본 점수를 분리해 원인을 진단한다.",
        },
        "undefinedMetricPolicy": "null_value_with_zero_denominator_and_reason; never_impute",
        "versionPin": {
            "library": "pyannote.metrics",
            "requiredMajor": 4,
            "recommendedRange": "4.1.x",
            "reason": "metric implementation과 overlap 처리 변경을 실행 장부에 고정한다.",
        },
    },
    "primaryMetrics": [
        {
            "id": "der",
            "name": "Diarization Error Rate",
            "direction": "lower_is_better",
            "role": "primary_gate_metric",
            "formula": "(false_alarm + miss + confusion) / reference_speaker_time",
            "components": ["false_alarm", "miss", "confusion", "reference_speaker_time"],
            "implementation": "pyannote.metrics.diarization.DiarizationErrorRate",
            "notes": "main protocol은 collar=0.0, skip_overlap=false이며 overlap을 점수에서 제거하지 않는다.",
        },
        {
            "id": "jer",
            "name": "Jaccard Error Rate",
            "direction": "lower_is_better",
            "role": "primary_gate_metric",
            "formula": "macro mean of per-reference-speaker Jaccard error after optimal mapping",
            "implementation": "pyannote.metrics.diarization.JaccardErrorRate",
            "notes": "화자별 긴 재등장·fragmentation·merge 불균형을 DER 보완점수로 본다.",
        },
    ],
    "requiredDiagnostics": [
        {
            "id": "der_components",
            "name": "DER components",
            "direction": "lower_is_better",
            "role": "required_diagnostic",
            "fields": ["false_alarm", "miss", "confusion", "reference_speaker_time"],
            "reason": "전체 DER만으로 놓침·오탐·화자 혼동의 원인을 섞지 않는다.",
        },
        {
            "id": "overlap_activity_f1",
            "name": "Overlap activity F1",
            "direction": "higher_is_better",
            "role": "required_hard_condition_diagnostic",
            "formula": "duration-based F1 of reference/system regions with at least two active speakers",
            "custom": True,
            "reason": "겹침 자체를 찾았는지 확인하며, 표준 DER의 대체값이 아니다.",
        },
        {
            "id": "overlap_speaker_time_recall",
            "name": "Overlap speaker-time recall",
            "direction": "higher_is_better",
            "role": "required_hard_condition_diagnostic",
            "formula": "correctly mapped reference speaker-time inside reference overlap / reference overlap speaker-time",
            "custom": True,
            "reason": "겹침을 단순히 감지하는 것과 두 화자를 모두 올바르게 귀속하는 것을 분리한다.",
        },
        {
            "id": "purity",
            "name": "Diarization purity",
            "direction": "higher_is_better",
            "role": "required_diagnostic",
            "implementation": "pyannote.metrics.diarization.DiarizationPurity",
            "reason": "한 예측 cluster가 여러 정답 화자를 섞는 merge 오류를 드러낸다.",
        },
        {
            "id": "coverage",
            "name": "Diarization coverage",
            "direction": "higher_is_better",
            "role": "required_diagnostic",
            "implementation": "pyannote.metrics.diarization.DiarizationCoverage",
            "reason": "한 정답 화자가 여러 예측 cluster로 쪼개지는 fragmentation을 드러낸다.",
        },
        {
            "id": "purity_coverage_f1",
            "name": "Purity-coverage F1",
            "direction": "higher_is_better",
            "role": "required_diagnostic",
            "formula": "harmonic mean of purity and coverage",
            "custom": True,
        },
        {
            "id": "same_speaker_reappearance_recall",
            "name": "Same-speaker reappearance recall",
            "direction": "higher_is_better",
            "role": "required_hard_condition_diagnostic",
            "formula": "same-cluster decisions correct / annotated same-speaker reappearance pairs",
            "custom": True,
            "reason": "긴 공백 후 같은 화자를 새 화자로 쪼개는 오류를 직접 측정한다.",
        },
        {
            "id": "short_turn_recall",
            "name": "Short-turn speaker-time recall",
            "direction": "higher_is_better",
            "role": "required_hard_condition_diagnostic",
            "formula": "correctly attributed reference speaker-time in annotated short turns / annotated short-turn speaker-time",
            "custom": True,
        },
        {
            "id": "late_entrant_recall",
            "name": "Late-entrant speaker-time recall",
            "direction": "higher_is_better",
            "role": "required_hard_condition_diagnostic",
            "formula": "correctly attributed reference speaker-time in annotated late-entrant turns / annotated late-entrant speaker-time",
            "custom": True,
        },
        {
            "id": "single_speaker_extra_attributed_time_rate",
            "name": "Single-speaker extra-attributed time rate",
            "direction": "lower_is_better",
            "role": "required_hard_condition_diagnostic",
            "formula": "predicted speaker-time outside the dominant mapped speaker / reference speech-time in single-speaker control",
            "custom": True,
            "reason": "단일 화자 구간에서 허위 화자를 추가하거나 과분리하는 오류를 speaker count 하나보다 잘 포착한다.",
        },
        {
            "id": "speaker_count_error",
            "name": "Absolute speaker-count error",
            "direction": "lower_is_better",
            "role": "descriptive_only",
            "formula": "abs(predicted_speaker_count - reference_speaker_count)",
            "reason": "화자 수 일치는 identity·시간 정답을 대체하지 못하므로 설명용으로만 남긴다.",
        },
        {
            "id": "boundary_f1",
            "name": "Turn-boundary F1",
            "direction": "higher_is_better",
            "role": "legacy_diagnostic_only",
            "formula": "duration-independent boundary matching F1 at fixed tolerance",
            "toleranceSec": 0.5,
            "reason": "짧은 전환 위치 진단에는 유용하지만 overlap·merge·reappearance를 종합하지 못하므로 단독 게이트로 쓰지 않는다.",
        },
        {
            "id": "framewise_mutual_information",
            "name": "Framewise mutual information",
            "direction": "higher_is_better",
            "role": "optional_secondary",
            "implementation": "DIHARD-compatible framewise MI implementation",
            "reason": "DER/JER와 다른 관점의 보조 점수로, 구현 가능할 때만 보고한다.",
        },
    ],
    "conditionSlices": [
        {
            "id": "actual_overlap_speech",
            "sourceTags": ["actual_overlap_speech", "actual_overlap_speech_candidate"],
            "requiredMetrics": ["slice_der", "slice_jer", "overlap_activity_f1", "overlap_speaker_time_recall"],
        },
        {
            "id": "stationary_background_noise",
            "sourceTags": ["stationary_background_noise", "stationary_background_noise_candidate"],
            "requiredMetrics": ["slice_der", "slice_jer"],
        },
        {
            "id": "far_mic_or_reverb",
            "sourceTags": ["far_mic_or_reverb", "far_mic_reverb_candidate"],
            "requiredMetrics": ["slice_der", "slice_jer"],
        },
        {
            "id": "similar_timbre",
            "sourceTags": ["similar_timbre", "similar_timbre_candidate"],
            "requiredMetrics": ["slice_der", "slice_jer"],
        },
        {
            "id": "short_new_speaker",
            "sourceTags": ["short_new_speaker", "short_new_speaker_candidate"],
            "requiredMetrics": ["slice_der", "slice_jer", "short_turn_recall", "late_entrant_recall"],
        },
        {
            "id": "long_gap_reappearance",
            "sourceTags": ["long_gap_reappearance", "long_gap_reappearance_candidate"],
            "requiredMetrics": ["slice_der", "slice_jer", "same_speaker_reappearance_recall"],
        },
        {
            "id": "single_speaker_control",
            "sourceTags": ["single_speaker_control", "single_speaker_control_candidate"],
            "requiredMetrics": ["slice_der", "slice_jer", "single_speaker_extra_attributed_time_rate"],
        },
    ],
    "resultContract": {
        "requiredTopLevelFields": [
            "metricContractVersion",
            "protocol",
            "goldSource",
            "hypothesisSource",
            "results",
            "status",
        ],
        "requiredResultFields": [
            "sessionId",
            "goldLabelVersion",
            "uem",
            "hypothesis",
            "protocol",
            "main",
            "overlapExcludedControl",
            "conditionSlices",
            "denominators",
        ],
        "requiredMainFields": [
            "der",
            "jer",
            "false_alarm",
            "miss",
            "confusion",
            "reference_speaker_time",
        ],
        "nullRequires": ["denominator", "reason"],
    },
    "gatePolicy": {
        "status": "CALIBRATION_REQUIRED",
        "absoluteThresholds": "NOT_SET_BEFORE_FIRST_REVIEWED_GOLD_CALIBRATION",
        "comparisonRule": "baseline_and_candidate_must_use_same_gold_version_uem_collar_mapping_and_aggregation",
        "requiredRules": [
            "main DER/JER use overlap-inclusive protocol",
            "DER components and reference speaker-time denominator are always reported",
            "all observed hard-condition slices report slice DER/JER and denominators",
            "overlap slice reports both overlap activity F1 and overlap speaker-time recall",
            "long-gap slice reports same-speaker reappearance recall",
            "single-speaker control reports extra-attributed time rate",
            "boundary F1 never becomes the sole pass criterion",
            "undefined or unobserved slices are null with a reason and do not become zero",
        ],
        "calibratedAcceptanceRule": "after_first_gold_baseline, candidate must not regress overall DER/JER or any predeclared hard-condition error budget; absolute numbers are recorded only after calibration",
    },
    "legacyCompatibility": {
        "boundaryF1": "diagnostic_only_for_legacy_KTV_and_brief_fixtures",
        "oneToOneIdentity": "legacy_fixture_diagnostic_only",
        "speakerCount": "descriptive_only",
        "legacyResultsCannotPopulatePilotGold": True,
    },
}


REQUIRED_PRIMARY_IDS = {"der", "jer"}
REQUIRED_DIAGNOSTIC_IDS = {
    "der_components",
    "overlap_activity_f1",
    "overlap_speaker_time_recall",
    "purity",
    "coverage",
    "purity_coverage_f1",
    "same_speaker_reappearance_recall",
    "short_turn_recall",
    "late_entrant_recall",
    "single_speaker_extra_attributed_time_rate",
    "boundary_f1",
}


def metric_contract() -> Dict[str, Any]:
    """Return an isolated copy suitable for JSON serialization."""

    return deepcopy(METRIC_CONTRACT)


def validate_metric_contract(contract: Any) -> List[str]:
    """Return structural contract errors without requiring pyannote.metrics."""

    if not isinstance(contract, dict):
        return ["metric contract must be an object"]

    errors: List[str] = []
    if contract.get("metricContractVersion") != METRIC_CONTRACT_VERSION:
        errors.append(f"metricContractVersion must be {METRIC_CONTRACT_VERSION}")
    protocol = contract.get("protocol")
    if not isinstance(protocol, dict):
        errors.append("protocol must be an object")
    else:
        for field in ("referenceFormat", "hypothesisFormat", "uem", "labelMapping"):
            if not protocol.get(field):
                errors.append(f"protocol.{field} is required")
        if protocol.get("collarSec") != 0.0:
            errors.append("protocol.collarSec must be 0.0 for this pilot")
        if protocol.get("skipOverlap") is not False:
            errors.append("protocol.skipOverlap must be false for the main score")

    primary = contract.get("primaryMetrics")
    primary_ids = {
        item.get("id")
        for item in primary
        if isinstance(item, dict) and item.get("id")
    } if isinstance(primary, list) else set()
    if not REQUIRED_PRIMARY_IDS.issubset(primary_ids):
        errors.append("primaryMetrics must contain der and jer")

    diagnostics = contract.get("requiredDiagnostics")
    diagnostic_ids = {
        item.get("id")
        for item in diagnostics
        if isinstance(item, dict) and item.get("id")
    } if isinstance(diagnostics, list) else set()
    missing_diagnostics = sorted(REQUIRED_DIAGNOSTIC_IDS - diagnostic_ids)
    if missing_diagnostics:
        errors.append("requiredDiagnostics missing: " + ", ".join(missing_diagnostics))

    boundary = next(
        (
            item
            for item in diagnostics
            if isinstance(item, dict) and item.get("id") == "boundary_f1"
        ),
        None,
    ) if isinstance(diagnostics, list) else None
    if boundary and boundary.get("role") not in {"legacy_diagnostic_only", "diagnostic_only"}:
        errors.append("boundary_f1 must not be a gate metric")

    gate_policy = contract.get("gatePolicy")
    if not isinstance(gate_policy, dict):
        errors.append("gatePolicy must be an object")
    elif gate_policy.get("status") != "CALIBRATION_REQUIRED":
        errors.append("gatePolicy.status must remain CALIBRATION_REQUIRED before pilot gold")

    return errors
