#!/usr/bin/env python3
"""Score a reviewed diarization pilot with the Faith metric contract.

This runner is dependency-free on purpose.  It implements the interval
accounting needed for the pilot and keeps the protocol explicit, while the
official pyannote.metrics implementation can still be used as an independent
cross-check in a pinned evaluation environment.

The command never treats missing labels or missing hypotheses as a zero score.
Without --write-ledger it only prints a report, so a failed or partial attempt
cannot replace the current baseline ledger.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Set, Tuple

try:
    from diarization_metric_contract import (
        METRIC_CONTRACT_VERSION,
        metric_contract,
        validate_metric_contract,
    )
except ModuleNotFoundError:  # allows loading the runner from a test harness
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from diarization_metric_contract import (
        METRIC_CONTRACT_VERSION,
        metric_contract,
        validate_metric_contract,
    )


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = (
    REPO_ROOT
    / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa"
)
DEFAULT_QUEUE = DEFAULT_ROOT / "diarization-pilot-queue.v1.json"
DEFAULT_LABELS = DEFAULT_ROOT / "labels"
DEFAULT_HYPOTHESES = DEFAULT_ROOT / "hypotheses"
DEFAULT_UEM = DEFAULT_ROOT / "uem"
DEFAULT_OUTPUT = DEFAULT_ROOT / "baseline-evaluation-ledger.v1.json"
EPSILON = 1e-9
BOUNDARY_TOLERANCE_SEC = 0.5
PROMOTABLE_REVIEW_STATUSES = {"REVIEWED", "DOUBLE_REVIEWED", "ADJUDICATED"}


@dataclass(frozen=True)
class Interval:
    start: float
    end: float
    label: str


@dataclass(frozen=True)
class Atom:
    start: float
    end: float
    reference: frozenset[str]
    hypothesis: frozenset[str]


@dataclass
class CoreScore:
    metrics: Dict[str, Any]
    mapping: Dict[str, Optional[str]]
    atoms: List[Atom]
    reference_labels: List[str]
    hypothesis_labels: List[str]
    overlap_matrix: List[List[float]]


def repo_path(path: Path) -> Path:
    return path if path.is_absolute() else REPO_ROOT / path


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def write_json(path: Path, value: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def number(value: Any, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{field} must be finite")
    return result


def interval_from_object(item: Dict[str, Any], prefix: str) -> Tuple[float, float]:
    start_value = item.get("startSec", item.get("start"))
    end_value = item.get("endSec", item.get("end"))
    start = number(start_value, f"{prefix}.startSec")
    end = number(end_value, f"{prefix}.endSec")
    if start < 0 or end <= start:
        raise ValueError(f"{prefix} has invalid interval {start}..{end}")
    return start, end


def as_label_list(value: Any, field: str) -> List[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        labels = [item for item in value if isinstance(item, str) and item]
        if len(labels) != len(value):
            raise ValueError(f"{field} must contain only non-empty strings")
        return sorted(set(labels))
    if value is None:
        return []
    raise ValueError(f"{field} must be a string or list of strings")


def merge_plain_intervals(intervals: Iterable[Tuple[float, float]]) -> List[Tuple[float, float]]:
    ordered = sorted((float(start), float(end)) for start, end in intervals if end - start > EPSILON)
    if not ordered:
        return []
    merged: List[Tuple[float, float]] = [ordered[0]]
    for start, end in ordered[1:]:
        previous_start, previous_end = merged[-1]
        if start <= previous_end + EPSILON:
            merged[-1] = (previous_start, max(previous_end, end))
        else:
            merged.append((start, end))
    return merged


def merge_labeled_intervals(intervals: Iterable[Interval]) -> List[Interval]:
    by_label: Dict[str, List[Tuple[float, float]]] = defaultdict(list)
    for interval in intervals:
        if interval.end - interval.start > EPSILON:
            by_label[interval.label].append((interval.start, interval.end))
    merged: List[Interval] = []
    for label, spans in by_label.items():
        merged.extend(Interval(start, end, label) for start, end in merge_plain_intervals(spans))
    return sorted(merged, key=lambda item: (item.start, item.end, item.label))


def expand_label_segments(
    labels: Dict[str, Any],
) -> Tuple[List[Interval], List[Tuple[float, float]], Dict[str, Dict[str, Any]]]:
    raw_segments = labels.get("segments")
    if not isinstance(raw_segments, list):
        raise ValueError("gold labels require a segments list")
    intervals: List[Interval] = []
    ambiguous: List[Tuple[float, float]] = []
    segment_by_id: Dict[str, Dict[str, Any]] = {}
    for index, raw in enumerate(raw_segments):
        if not isinstance(raw, dict):
            raise ValueError(f"segments[{index}] must be an object")
        segment_id = raw.get("segmentId")
        if isinstance(segment_id, str) and segment_id:
            segment_by_id[segment_id] = raw
        start, end = interval_from_object(raw, f"segments[{index}]")
        status = raw.get("reviewStatus")
        if status == "REJECTED":
            continue
        if status == "AMBIGUOUS":
            ambiguous.append((start, end))
            continue
        speaker_ids = as_label_list(raw.get("speakerLocalId", []), f"segments[{index}].speakerLocalId")
        for speaker_id in speaker_ids:
            intervals.append(Interval(start, end, speaker_id))
    return merge_labeled_intervals(intervals), merge_plain_intervals(ambiguous), segment_by_id


def hypothesis_payload(value: Dict[str, Any]) -> Dict[str, Any]:
    nested = value.get("diarization")
    return nested if isinstance(nested, dict) else value


def expand_hypothesis_segments(value: Dict[str, Any]) -> List[Interval]:
    payload = hypothesis_payload(value)
    raw_segments = payload.get("segments")
    if not isinstance(raw_segments, list):
        raise ValueError("hypothesis requires a segments list")
    intervals: List[Interval] = []
    for index, raw in enumerate(raw_segments):
        if not isinstance(raw, dict):
            raise ValueError(f"hypothesis.segments[{index}] must be an object")
        start, end = interval_from_object(raw, f"hypothesis.segments[{index}]")
        labels = as_label_list(
            raw.get("speakerLocalId", raw.get("speaker", raw.get("speakerId"))),
            f"hypothesis.segments[{index}].speaker",
        )
        for label in labels:
            intervals.append(Interval(start, end, label))
    return merge_labeled_intervals(intervals)


def parse_uem(path: Optional[Path], duration: float) -> List[Tuple[float, float]]:
    if path is None:
        return [(0.0, duration)]
    if not path.is_file():
        raise FileNotFoundError(f"UEM file not found: {path}")
    spans: List[Tuple[float, float]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        fields = stripped.split()
        try:
            if len(fields) >= 4:
                start = float(fields[-2])
                end = float(fields[-1])
            elif len(fields) == 3:
                start = float(fields[-2])
                end = float(fields[-1])
            elif len(fields) == 2:
                start = float(fields[0])
                end = float(fields[1])
            else:
                raise ValueError("expected start/end columns")
        except ValueError as exc:
            raise ValueError(f"{path}:{line_number} invalid UEM row: {stripped}") from exc
        if start < 0 or end <= start:
            raise ValueError(f"{path}:{line_number} invalid UEM interval {start}..{end}")
        spans.append((max(0.0, start), min(duration, end)))
    merged = merge_plain_intervals(spans)
    if not merged:
        raise ValueError(f"UEM file has no usable intervals: {path}")
    return merged


def intersect_intervals(
    left: Iterable[Tuple[float, float]], right: Iterable[Tuple[float, float]]
) -> List[Tuple[float, float]]:
    left_spans = merge_plain_intervals(left)
    right_spans = merge_plain_intervals(right)
    result: List[Tuple[float, float]] = []
    right_index = 0
    for left_start, left_end in left_spans:
        while right_index < len(right_spans) and right_spans[right_index][1] <= left_start:
            right_index += 1
        index = right_index
        while index < len(right_spans) and right_spans[index][0] < left_end:
            start = max(left_start, right_spans[index][0])
            end = min(left_end, right_spans[index][1])
            if end - start > EPSILON:
                result.append((start, end))
            index += 1
    return merge_plain_intervals(result)


def subtract_intervals(
    base: Iterable[Tuple[float, float]], exclusions: Iterable[Tuple[float, float]]
) -> List[Tuple[float, float]]:
    base_spans = merge_plain_intervals(base)
    exclusions_spans = merge_plain_intervals(exclusions)
    if not exclusions_spans:
        return base_spans
    result: List[Tuple[float, float]] = []
    for base_start, base_end in base_spans:
        cursor = base_start
        for exclusion_start, exclusion_end in exclusions_spans:
            if exclusion_end <= cursor:
                continue
            if exclusion_start >= base_end:
                break
            if exclusion_start > cursor:
                result.append((cursor, min(exclusion_start, base_end)))
            cursor = max(cursor, exclusion_end)
            if cursor >= base_end:
                break
        if cursor < base_end:
            result.append((cursor, base_end))
    return merge_plain_intervals(result)


def iter_atoms(
    reference: Sequence[Interval], hypothesis: Sequence[Interval], uem: Sequence[Tuple[float, float]]
) -> Iterator[Atom]:
    """Yield atomic intervals with active reference and hypothesis labels."""

    events: Dict[float, Dict[str, Any]] = defaultdict(
        lambda: {
            "reference_add": set(),
            "reference_remove": set(),
            "hypothesis_add": set(),
            "hypothesis_remove": set(),
            "uem_add": 0,
            "uem_remove": 0,
        }
    )
    boundaries: Set[float] = set()
    for start, end in uem:
        events[start]["uem_add"] += 1
        events[end]["uem_remove"] += 1
        boundaries.update((start, end))
    for item in reference:
        events[item.start]["reference_add"].add(item.label)
        events[item.end]["reference_remove"].add(item.label)
        boundaries.update((item.start, item.end))
    for item in hypothesis:
        events[item.start]["hypothesis_add"].add(item.label)
        events[item.end]["hypothesis_remove"].add(item.label)
        boundaries.update((item.start, item.end))

    ordered = sorted(boundaries)
    reference_active: Set[str] = set()
    hypothesis_active: Set[str] = set()
    uem_active = 0
    for index, start in enumerate(ordered[:-1]):
        current = events[start]
        reference_active.difference_update(current["reference_remove"])
        hypothesis_active.difference_update(current["hypothesis_remove"])
        reference_active.update(current["reference_add"])
        hypothesis_active.update(current["hypothesis_add"])
        uem_active -= current["uem_remove"]
        uem_active += current["uem_add"]
        end = ordered[index + 1]
        if end - start <= EPSILON or uem_active <= 0:
            continue
        yield Atom(start, end, frozenset(reference_active), frozenset(hypothesis_active))


def hungarian_max(matrix: Sequence[Sequence[float]]) -> List[Optional[int]]:
    """Return maximum-weight row-to-column assignment for a rectangular matrix."""

    row_count = len(matrix)
    column_count = len(matrix[0]) if row_count else 0
    if row_count == 0:
        return []
    if column_count == 0:
        return [None] * row_count

    if row_count > column_count:
        transposed = [
            [float(matrix[row][column]) for row in range(row_count)]
            for column in range(column_count)
        ]
        transposed_assignment = hungarian_max(transposed)
        result: List[Optional[int]] = [None] * row_count
        for transposed_row, original_row in enumerate(transposed_assignment):
            if original_row is not None:
                result[original_row] = transposed_row
        return result

    # Hungarian algorithm for minimum cost, with negative weights for max.
    n = row_count
    m = column_count
    costs = [[-float(value) for value in row] for row in matrix]
    u = [0.0] * (n + 1)
    v = [0.0] * (m + 1)
    p = [0] * (m + 1)
    way = [0] * (m + 1)
    for row in range(1, n + 1):
        p[0] = row
        column_zero = 0
        minimum = [float("inf")] * (m + 1)
        used = [False] * (m + 1)
        while True:
            used[column_zero] = True
            row_zero = p[column_zero]
            delta = float("inf")
            column_one = 0
            for column in range(1, m + 1):
                if used[column]:
                    continue
                current = costs[row_zero - 1][column - 1] - u[row_zero] - v[column]
                if current < minimum[column]:
                    minimum[column] = current
                    way[column] = column_zero
                if minimum[column] < delta:
                    delta = minimum[column]
                    column_one = column
            for column in range(m + 1):
                if used[column]:
                    u[p[column]] += delta
                    v[column] -= delta
                else:
                    minimum[column] -= delta
            column_zero = column_one
            if p[column_zero] == 0:
                break
        while True:
            column_one = way[column_zero]
            p[column_zero] = p[column_one]
            column_zero = column_one
            if column_zero == 0:
                break

    assignment: List[Optional[int]] = [None] * n
    for column in range(1, m + 1):
        if p[column] != 0:
            assignment[p[column] - 1] = column - 1
    return assignment


def round_metric(value: Optional[float], digits: int = 6) -> Optional[float]:
    return None if value is None else round(float(value), digits)


def durations_by_label(atoms: Sequence[Atom], side: str) -> Dict[str, float]:
    result: Dict[str, float] = defaultdict(float)
    for atom in atoms:
        labels = atom.reference if side == "reference" else atom.hypothesis
        for label in labels:
            result[label] += atom.end - atom.start
    return dict(result)


def matrix_from_atoms(
    atoms: Sequence[Atom], reference_labels: Sequence[str], hypothesis_labels: Sequence[str]
) -> List[List[float]]:
    reference_index = {label: index for index, label in enumerate(reference_labels)}
    hypothesis_index = {label: index for index, label in enumerate(hypothesis_labels)}
    matrix = [[0.0 for _ in reference_labels] for _ in hypothesis_labels]
    for atom in atoms:
        duration = atom.end - atom.start
        for hypothesis_label in atom.hypothesis:
            row = hypothesis_index[hypothesis_label]
            for reference_label in atom.reference:
                matrix[row][reference_index[reference_label]] += duration
    return matrix


def mapping_from_atoms(
    atoms: Sequence[Atom], reference_labels: Sequence[str], hypothesis_labels: Sequence[str]
) -> Tuple[Dict[str, Optional[str]], List[List[float]]]:
    matrix = matrix_from_atoms(atoms, reference_labels, hypothesis_labels)
    assignment = hungarian_max(matrix)
    mapping = {
        hypothesis_label: (
            reference_labels[column] if column is not None and column < len(reference_labels) else None
        )
        for hypothesis_label, column in zip(hypothesis_labels, assignment)
    }
    return mapping, matrix


def correct_count(
    reference_active: Set[str], hypothesis_active: Set[str], mapping: Dict[str, Optional[str]]
) -> int:
    mapped = {mapping[label] for label in hypothesis_active if mapping.get(label) is not None}
    return len(reference_active & mapped)


def metric_from_ratio(numerator: float, denominator: float) -> Optional[float]:
    return numerator / denominator if denominator > EPSILON else None


def jaccard_metrics(
    atoms: Sequence[Atom],
    reference_labels: Sequence[str],
    hypothesis_labels: Sequence[str],
    mapping: Dict[str, Optional[str]],
    matrix: Sequence[Sequence[float]],
) -> Tuple[Optional[float], Dict[str, Dict[str, Any]]]:
    reference_duration = durations_by_label(atoms, "reference")
    hypothesis_duration = durations_by_label(atoms, "hypothesis")
    reference_index = {label: index for index, label in enumerate(reference_labels)}
    reverse_mapping = {reference: hypothesis for hypothesis, reference in mapping.items() if reference is not None}
    per_speaker: Dict[str, Dict[str, Any]] = {}
    errors: List[float] = []
    for reference_label in reference_labels:
        mapped_hypothesis = reverse_mapping.get(reference_label)
        reference_time = reference_duration.get(reference_label, 0.0)
        if mapped_hypothesis is None:
            error = 1.0
            intersection = 0.0
            hypothesis_time = 0.0
            union = reference_time
        else:
            hypothesis_time = hypothesis_duration.get(mapped_hypothesis, 0.0)
            intersection = matrix[
                next(index for index, label in enumerate(hypothesis_labels) if label == mapped_hypothesis)
            ][reference_index[reference_label]]
            union = reference_time + hypothesis_time - intersection
            error = (reference_time + hypothesis_time - 2.0 * intersection) / union if union > EPSILON else 0.0
        errors.append(error)
        per_speaker[reference_label] = {
            "mappedHypothesis": mapped_hypothesis,
            "referenceSpeakerTime": round_metric(reference_time),
            "hypothesisSpeakerTime": round_metric(hypothesis_time),
            "intersection": round_metric(intersection),
            "union": round_metric(union),
            "jaccardError": round_metric(error),
        }
    return (
        metric_from_ratio(sum(errors), len(errors)) if errors else None,
        per_speaker,
    )


def purity_coverage(
    atoms: Sequence[Atom],
    reference_labels: Sequence[str],
    hypothesis_labels: Sequence[str],
    matrix: Sequence[Sequence[float]],
) -> Dict[str, Optional[float]]:
    hypothesis_duration = durations_by_label(atoms, "hypothesis")
    reference_duration = durations_by_label(atoms, "reference")
    purity_total = sum(hypothesis_duration.values())
    purity_correct = sum(max(row) if row else 0.0 for row in matrix)
    coverage_total = sum(reference_duration.values())
    coverage_correct = sum(
        max((matrix[row][column] for row in range(len(matrix))), default=0.0)
        for column in range(len(reference_labels))
    )
    purity = metric_from_ratio(purity_correct, purity_total)
    coverage = metric_from_ratio(coverage_correct, coverage_total)
    harmonic = (
        2.0 * purity * coverage / (purity + coverage)
        if purity is not None and coverage is not None and purity + coverage > EPSILON
        else None
    )
    return {
        "purity": round_metric(purity),
        "coverage": round_metric(coverage),
        "purity_coverage_f1": round_metric(harmonic),
    }


def overlap_metrics(
    atoms: Sequence[Atom], mapping: Dict[str, Optional[str]]
) -> Dict[str, Optional[float]]:
    reference_overlap_time = 0.0
    hypothesis_overlap_time = 0.0
    overlap_intersection_time = 0.0
    reference_overlap_speaker_time = 0.0
    correctly_attributed_overlap_speaker_time = 0.0
    for atom in atoms:
        duration = atom.end - atom.start
        reference_overlap = len(atom.reference) >= 2
        hypothesis_overlap = len(atom.hypothesis) >= 2
        if reference_overlap:
            reference_overlap_time += duration
            reference_overlap_speaker_time += len(atom.reference) * duration
            correctly_attributed_overlap_speaker_time += correct_count(
                set(atom.reference), set(atom.hypothesis), mapping
            ) * duration
        if hypothesis_overlap:
            hypothesis_overlap_time += duration
        if reference_overlap and hypothesis_overlap:
            overlap_intersection_time += duration
    if reference_overlap_time > EPSILON:
        recall = overlap_intersection_time / reference_overlap_time
        precision = (
            overlap_intersection_time / hypothesis_overlap_time
            if hypothesis_overlap_time > EPSILON
            else 0.0
        )
        f1 = (
            2.0 * precision * recall / (precision + recall)
            if precision + recall > EPSILON
            else 0.0
        )
    elif hypothesis_overlap_time > EPSILON:
        precision = 0.0
        recall = None
        f1 = 0.0
    else:
        precision = None
        recall = None
        f1 = None
    return {
        "overlap_activity_precision": round_metric(precision),
        "overlap_activity_recall": round_metric(recall),
        "overlap_activity_f1": round_metric(f1),
        "overlap_speaker_time_recall": round_metric(
            metric_from_ratio(
                correctly_attributed_overlap_speaker_time,
                reference_overlap_speaker_time,
            )
        ),
        "reference_overlap_durationSec": round_metric(reference_overlap_time),
        "hypothesis_overlap_durationSec": round_metric(hypothesis_overlap_time),
        "reference_overlap_speaker_timeSec": round_metric(reference_overlap_speaker_time),
    }


def boundary_values(atoms: Sequence[Atom], side: str) -> List[float]:
    result: List[float] = []
    previous: Optional[frozenset[str]] = None
    previous_end: Optional[float] = None
    for atom in atoms:
        current = atom.reference if side == "reference" else atom.hypothesis
        if previous is not None and previous_end is not None and abs(previous_end - atom.start) <= EPSILON:
            if current != previous:
                result.append(atom.start)
        previous = current
        previous_end = atom.end
    return result


def boundary_metrics(predicted: Sequence[float], gold: Sequence[float]) -> Dict[str, Any]:
    used_gold: Set[int] = set()
    matched_errors: List[float] = []
    for predicted_boundary in predicted:
        candidates = [
            (abs(predicted_boundary - gold_boundary), index)
            for index, gold_boundary in enumerate(gold)
            if index not in used_gold and abs(predicted_boundary - gold_boundary) <= BOUNDARY_TOLERANCE_SEC
        ]
        if not candidates:
            continue
        error, index = min(candidates)
        used_gold.add(index)
        matched_errors.append(error)
    precision = metric_from_ratio(len(matched_errors), len(predicted))
    recall = metric_from_ratio(len(matched_errors), len(gold))
    f1 = (
        2.0 * precision * recall / (precision + recall)
        if precision is not None and recall is not None and precision + recall > EPSILON
        else None
    )
    return {
        "toleranceSec": BOUNDARY_TOLERANCE_SEC,
        "predicted": len(predicted),
        "gold": len(gold),
        "matched": len(matched_errors),
        "precision": round_metric(precision),
        "recall": round_metric(recall),
        "f1": round_metric(f1),
        "meanMatchedErrorSec": round_metric(
            metric_from_ratio(sum(matched_errors), len(matched_errors))
        ),
    }


def core_score(
    reference: Sequence[Interval],
    hypothesis: Sequence[Interval],
    uem: Sequence[Tuple[float, float]],
    mapping: Optional[Dict[str, Optional[str]]] = None,
) -> CoreScore:
    atoms = list(iter_atoms(reference, hypothesis, uem))
    reference_labels = sorted({label for atom in atoms for label in atom.reference})
    hypothesis_labels = sorted({label for atom in atoms for label in atom.hypothesis})
    if mapping is None:
        mapping, overlap_matrix = mapping_from_atoms(atoms, reference_labels, hypothesis_labels)
    else:
        overlap_matrix = matrix_from_atoms(atoms, reference_labels, hypothesis_labels)
        mapping = {label: mapping.get(label) for label in hypothesis_labels}

    false_alarm = 0.0
    miss = 0.0
    confusion = 0.0
    reference_speaker_time = 0.0
    for atom in atoms:
        duration = atom.end - atom.start
        reference_count = len(atom.reference)
        hypothesis_count = len(atom.hypothesis)
        correct = correct_count(set(atom.reference), set(atom.hypothesis), mapping)
        false_alarm += max(0, hypothesis_count - reference_count) * duration
        miss += max(0, reference_count - hypothesis_count) * duration
        confusion += max(0, min(reference_count, hypothesis_count) - correct) * duration
        reference_speaker_time += reference_count * duration

    der = metric_from_ratio(false_alarm + miss + confusion, reference_speaker_time)
    jer, jer_per_speaker = jaccard_metrics(
        atoms, reference_labels, hypothesis_labels, mapping, overlap_matrix
    )
    metrics: Dict[str, Any] = {
        "der": round_metric(der),
        "jer": round_metric(jer),
        "false_alarm": round_metric(false_alarm),
        "miss": round_metric(miss),
        "confusion": round_metric(confusion),
        "reference_speaker_time": round_metric(reference_speaker_time),
        "speaker_count_error": abs(len(hypothesis_labels) - len(reference_labels)),
        "speakerCount": len(hypothesis_labels),
        "referenceSpeakerCount": len(reference_labels),
        "jerPerSpeaker": jer_per_speaker,
        **purity_coverage(atoms, reference_labels, hypothesis_labels, overlap_matrix),
        **overlap_metrics(atoms, mapping),
        "boundary_f1": boundary_metrics(
            boundary_values(atoms, "hypothesis"), boundary_values(atoms, "reference")
        ),
    }
    return CoreScore(
        metrics=metrics,
        mapping=mapping,
        atoms=atoms,
        reference_labels=reference_labels,
        hypothesis_labels=hypothesis_labels,
        overlap_matrix=overlap_matrix,
    )


def attribution_recall(core: CoreScore) -> Optional[float]:
    numerator = 0.0
    denominator = 0.0
    for atom in core.atoms:
        duration = atom.end - atom.start
        denominator += len(atom.reference) * duration
        numerator += correct_count(set(atom.reference), set(atom.hypothesis), core.mapping) * duration
    return metric_from_ratio(numerator, denominator)


def extra_attributed_time_rate(core: CoreScore) -> Optional[float]:
    reference_duration = durations_by_label(core.atoms, "reference")
    if not reference_duration:
        return None
    dominant_reference = max(reference_duration, key=reference_duration.get)
    reverse_mapping = {reference: hypothesis for hypothesis, reference in core.mapping.items() if reference}
    dominant_hypothesis = reverse_mapping.get(dominant_reference)
    extra = 0.0
    denominator = reference_duration[dominant_reference]
    for atom in core.atoms:
        if dominant_reference not in atom.reference:
            continue
        extra += sum(
            atom.end - atom.start
            for hypothesis_label in atom.hypothesis
            if hypothesis_label != dominant_hypothesis
        )
    return metric_from_ratio(extra, denominator)


def dominant_hypothesis_for_interval(
    hypothesis: Sequence[Interval], start: float, end: float
) -> Optional[str]:
    overlap_by_label: Dict[str, float] = defaultdict(float)
    for item in hypothesis:
        overlap = max(0.0, min(end, item.end) - max(start, item.start))
        if overlap > EPSILON:
            overlap_by_label[item.label] += overlap
    if not overlap_by_label:
        return None
    return max(sorted(overlap_by_label), key=lambda label: overlap_by_label[label])


def reappearance_metrics(
    labels: Dict[str, Any],
    hypothesis: Sequence[Interval],
    segment_by_id: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    relations = labels.get("speakerRelations", [])
    if not isinstance(relations, list):
        return {"status": "NOT_OBSERVED", "reason": "speakerRelations is not a list"}
    reviewed = [
        relation
        for relation in relations
        if isinstance(relation, dict)
        and relation.get("type") == "SAME_SPEAKER_REAPPEARANCE"
        and relation.get("reviewStatus") in PROMOTABLE_REVIEW_STATUSES
    ]
    if not reviewed:
        return {
            "status": "NOT_OBSERVED",
            "reason": "no reviewed SAME_SPEAKER_REAPPEARANCE relation",
            "denominator": 0,
        }
    correct = 0
    details: List[Dict[str, Any]] = []
    for relation in reviewed:
        first = segment_by_id.get(relation.get("firstSegmentId"))
        second = segment_by_id.get(relation.get("secondSegmentId"))
        if first is None or second is None:
            raise ValueError(f"relation {relation.get('relationId')} references a missing segment")
        first_start, first_end = interval_from_object(first, "speakerRelations.firstSegment")
        second_start, second_end = interval_from_object(second, "speakerRelations.secondSegment")
        first_hypothesis = dominant_hypothesis_for_interval(hypothesis, first_start, first_end)
        second_hypothesis = dominant_hypothesis_for_interval(hypothesis, second_start, second_end)
        is_correct = first_hypothesis is not None and first_hypothesis == second_hypothesis
        correct += int(is_correct)
        details.append(
            {
                "relationId": relation.get("relationId"),
                "firstHypothesis": first_hypothesis,
                "secondHypothesis": second_hypothesis,
                "correct": is_correct,
            }
        )
    return {
        "status": "OBSERVED",
        "recall": round_metric(correct / len(reviewed)),
        "correct": correct,
        "denominator": len(reviewed),
        "details": details,
    }


def overlap_reference_uem(
    reference: Sequence[Interval], uem: Sequence[Tuple[float, float]]
) -> List[Tuple[float, float]]:
    atoms = list(iter_atoms(reference, [], uem))
    return merge_plain_intervals(
        (atom.start, atom.end) for atom in atoms if len(atom.reference) >= 2
    )


def condition_uems(
    labels: Dict[str, Any],
    reference: Sequence[Interval],
    uem: Sequence[Tuple[float, float]],
    duration: float,
    contract: Dict[str, Any],
) -> Dict[str, List[Tuple[float, float]]]:
    raw_segments = labels.get("segments") or []
    by_condition: Dict[str, List[Tuple[float, float]]] = defaultdict(list)
    tag_map: Dict[str, Set[str]] = {
        item["id"]: set(item.get("sourceTags", []))
        for item in contract.get("conditionSlices", [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    for raw in raw_segments:
        if not isinstance(raw, dict) or raw.get("reviewStatus") not in PROMOTABLE_REVIEW_STATUSES:
            continue
        start, end = interval_from_object(raw, "segments")
        tags = set(as_label_list(raw.get("tags", []), "segments.tags"))
        for condition, source_tags in tag_map.items():
            if tags & source_tags:
                by_condition[condition].append((start, end))
    # The actual overlap condition can be derived from reviewed multi-label
    # reference intervals even when the annotator omitted the convenience tag.
    if not by_condition.get("actual_overlap_speech"):
        by_condition["actual_overlap_speech"] = overlap_reference_uem(reference, uem)
    return {
        condition: intersect_intervals(spans, uem)
        for condition, spans in by_condition.items()
        if intersect_intervals(spans, uem)
    }


def uem_metadata(path: Optional[Path], uem: Sequence[Tuple[float, float]]) -> Dict[str, Any]:
    return {
        "path": display_path(path) if path is not None else None,
        "sha256": sha256_file(path) if path is not None else None,
        "intervalCount": len(uem),
        "durationSec": round_metric(sum(end - start for start, end in uem)),
    }


def metric_slice(
    condition: str,
    core: CoreScore,
    labels: Dict[str, Any],
    hypothesis: Sequence[Interval],
    segment_by_id: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    metrics = {
        "slice_der": core.metrics.get("der"),
        "slice_jer": core.metrics.get("jer"),
        "false_alarm": core.metrics.get("false_alarm"),
        "miss": core.metrics.get("miss"),
        "confusion": core.metrics.get("confusion"),
        "reference_speaker_time": core.metrics.get("reference_speaker_time"),
    }
    if condition == "actual_overlap_speech":
        metrics.update(
            {
                "overlap_activity_f1": core.metrics.get("overlap_activity_f1"),
                "overlap_speaker_time_recall": core.metrics.get("overlap_speaker_time_recall"),
            }
        )
    if condition == "short_new_speaker":
        recall = attribution_recall(core)
        metrics.update({"short_turn_recall": round_metric(recall), "late_entrant_recall": round_metric(recall)})
    if condition == "long_gap_reappearance":
        metrics["same_speaker_reappearance_recall"] = reappearance_metrics(
            labels, hypothesis, segment_by_id
        ).get("recall")
    if condition == "single_speaker_control":
        metrics["single_speaker_extra_attributed_time_rate"] = round_metric(
            extra_attributed_time_rate(core)
        )
    return metrics


def score_session(
    labels: Dict[str, Any],
    label_path: Path,
    hypothesis_payload_value: Dict[str, Any],
    hypothesis_path: Path,
    uem_path: Optional[Path],
    contract: Dict[str, Any],
) -> Dict[str, Any]:
    source = labels.get("source")
    if not isinstance(source, dict):
        raise ValueError(f"{label_path} has no source metadata")
    duration = number(source.get("durationSec"), f"{label_path}.source.durationSec")
    reference, ambiguous, segment_by_id = expand_label_segments(labels)
    if ambiguous and uem_path is None:
        raise ValueError(
            f"{label_path} contains AMBIGUOUS intervals; provide a UEM that excludes them before scoring"
        )
    uem = parse_uem(uem_path, duration)
    if ambiguous and intersect_intervals(ambiguous, uem):
        raise ValueError(f"{label_path} UEM still includes AMBIGUOUS time")
    hypothesis = expand_hypothesis_segments(hypothesis_payload_value)
    expected_hash = source.get("sha256")
    reported_hash = hypothesis_payload_value.get("sourceSha256", hypothesis_payload_value.get("source_sha256"))
    if reported_hash is not None and reported_hash != expected_hash:
        raise ValueError(f"{hypothesis_path} sourceSha256 does not match gold source")
    reported_duration = hypothesis_payload(hypothesis_payload_value).get("durationSec")
    if reported_duration is not None and abs(number(reported_duration, "hypothesis.durationSec") - duration) > 1.0:
        raise ValueError(f"{hypothesis_path} duration differs from gold source by more than 1 second")

    main = core_score(reference, hypothesis, uem)
    reference_overlap = overlap_reference_uem(reference, uem)
    overlap_excluded_uem = subtract_intervals(uem, reference_overlap)
    overlap_control = (
        core_score(reference, hypothesis, overlap_excluded_uem)
        if overlap_excluded_uem
        else None
    )

    conditions = condition_uems(labels, reference, uem, duration, contract)
    condition_results: Dict[str, Any] = {}
    denominators: Dict[str, Any] = {
        "main": {
            "uemSec": round_metric(sum(end - start for start, end in uem)),
            "referenceSpeakerTimeSec": main.metrics.get("reference_speaker_time"),
        },
        "overlapExcludedControl": {
            "uemSec": round_metric(sum(end - start for start, end in overlap_excluded_uem)),
            "referenceSpeakerTimeSec": (
                overlap_control.metrics.get("reference_speaker_time") if overlap_control else None
            ),
        },
        "conditionSlices": {},
    }
    for condition_spec in contract.get("conditionSlices", []):
        if not isinstance(condition_spec, dict):
            continue
        condition = condition_spec.get("id")
        if not isinstance(condition, str):
            continue
        slice_uem = conditions.get(condition, [])
        if not slice_uem:
            condition_results[condition] = {
                "status": "NOT_OBSERVED",
                "reason": "no reviewed gold interval carries this condition",
                "metrics": {},
                "denominator": None,
            }
            denominators["conditionSlices"][condition] = None
            continue
        slice_score = core_score(reference, hypothesis, slice_uem, mapping=main.mapping)
        condition_results[condition] = {
            "status": "OBSERVED",
            "uem": {
                "intervalCount": len(slice_uem),
                "durationSec": round_metric(sum(end - start for start, end in slice_uem)),
            },
            "metrics": metric_slice(
                condition, slice_score, labels, hypothesis, segment_by_id
            ),
            "denominator": {
                "referenceSpeakerTimeSec": slice_score.metrics.get("reference_speaker_time"),
                "observedWindowSec": round_metric(sum(end - start for start, end in slice_uem)),
            },
        }
        denominators["conditionSlices"][condition] = condition_results[condition]["denominator"]

    main_metrics = dict(main.metrics)
    main_metrics["same_speaker_reappearance_recall"] = reappearance_metrics(
        labels, hypothesis, segment_by_id
    ).get("recall")
    main_metrics["single_speaker_extra_attributed_time_rate"] = round_metric(
        extra_attributed_time_rate(main)
    )

    payload = hypothesis_payload(hypothesis_payload_value)
    model = payload.get("model", hypothesis_payload_value.get("model", "unknown"))
    model_version = payload.get("modelVersion", hypothesis_payload_value.get("modelVersion"))
    return {
        "sessionId": labels.get("sessionId"),
        "goldLabelVersion": f"diarization-labels.v1@{sha256_file(label_path)}",
        "uem": uem_metadata(uem_path, uem),
        "hypothesis": {
            "path": display_path(hypothesis_path),
            "sha256": sha256_file(hypothesis_path),
            "model": model,
            "modelVersion": model_version,
        },
        "protocol": {
            "metricContractVersion": METRIC_CONTRACT_VERSION,
            "collarSec": contract["protocol"]["collarSec"],
            "skipOverlap": False,
            "mapping": contract["protocol"]["labelMapping"],
            "aggregation": contract["protocol"]["primaryAggregation"],
        },
        "main": main_metrics,
        "overlapExcludedControl": (
            overlap_control.metrics if overlap_control else {"status": "NOT_OBSERVED"}
        ),
        "conditionSlices": condition_results,
        "denominators": denominators,
        "mapping": main.mapping,
        "ambiguousExcludedSec": round_metric(sum(end - start for start, end in ambiguous)),
    }


def load_label_validator() -> Any:
    validator_path = Path(__file__).with_name("validate-diarization-labels.py")
    spec = importlib.util.spec_from_file_location("validate_diarization_labels", validator_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load label validator: {validator_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def selected_tasks(queue: Dict[str, Any]) -> List[Dict[str, Any]]:
    tasks = queue.get("tasks")
    if not isinstance(tasks, list):
        raise ValueError("queue.tasks must be a list")
    return [task for task in tasks if isinstance(task, dict)]


def attempt_report(
    status: str,
    errors: List[str],
    contract: Dict[str, Any],
    results: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    return {
        "schemaVersion": "diarization-pilot-evaluation-attempt.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "metricContractVersion": contract.get("metricContractVersion"),
        "errors": errors,
        "results": results or [],
    }


def build_ledger(
    queue_path: Path,
    labels_dir: Path,
    hypotheses_dir: Path,
    uem_dir: Optional[Path],
    output_path: Path,
) -> Tuple[Optional[Dict[str, Any]], Dict[str, Any]]:
    contract = metric_contract()
    contract_errors = validate_metric_contract(contract)
    if contract_errors:
        return None, attempt_report("INVALID_CONTRACT", contract_errors, contract)
    queue = load_json(queue_path)
    if queue.get("schemaVersion") != "diarization-pilot-queue.v1":
        return None, attempt_report("INVALID_QUEUE", ["unexpected queue schemaVersion"], contract)
    tasks = selected_tasks(queue)
    if not tasks:
        return None, attempt_report("INVALID_QUEUE", ["queue has no selected tasks"], contract)
    validator = load_label_validator()
    errors: List[str] = []
    results: List[Dict[str, Any]] = []
    model_records: Dict[Tuple[str, Optional[str]], Dict[str, Any]] = {}
    for task in tasks:
        session_id = task.get("sessionId")
        if not isinstance(session_id, str):
            errors.append("queue task has no sessionId")
            continue
        label_path = labels_dir / f"{session_id}.labels.v1.json"
        hypothesis_path = hypotheses_dir / f"{session_id}.hypothesis.v1.json"
        if not label_path.is_file():
            errors.append(f"{session_id}: missing label file {label_path}")
            continue
        if not hypothesis_path.is_file():
            errors.append(f"{session_id}: missing hypothesis file {hypothesis_path}")
            continue
        try:
            labels = load_json(label_path)
            validation = validator.validate_labels(labels, queue_path)
            if not validation.get("ok"):
                errors.append(f"{session_id}: label validation failed: {validation.get('errors')}")
                continue
            if validation.get("reviewStatus") not in PROMOTABLE_REVIEW_STATUSES:
                errors.append(f"{session_id}: review status is not gold-promotable")
                continue
            if not validation.get("eligibleForGold"):
                errors.append(f"{session_id}: label is not eligibleForGold; check rights and preannotations")
                continue
            hypothesis = load_json(hypothesis_path)
            session_uem_path = None
            if uem_dir is not None:
                candidate = uem_dir / f"{session_id}.uem"
                if candidate.is_file():
                    session_uem_path = candidate
            result = score_session(
                labels,
                label_path,
                hypothesis,
                hypothesis_path,
                session_uem_path,
                contract,
            )
            results.append(result)
            model_key = (str(result["hypothesis"]["model"]), result["hypothesis"].get("modelVersion"))
            model_records[model_key] = {
                "model": model_key[0],
                "modelVersion": model_key[1],
            }
        except (OSError, ValueError, json.JSONDecodeError, StopIteration) as exc:
            errors.append(f"{session_id}: {exc}")

    if errors or len(results) != len(tasks):
        missing_count = len(tasks) - len(results)
        if missing_count > 0:
            errors.append(f"{missing_count} selected session(s) did not produce a scored result")
        return None, attempt_report("NOT_RUN", errors, contract, results)

    existing: Dict[str, Any] = {}
    if output_path.is_file():
        try:
            existing = load_json(output_path)
        except (OSError, json.JSONDecodeError, ValueError):
            existing = {}
    ledger = {
        "schemaVersion": "diarization-baseline-evaluation-ledger.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": "PASS",
        "evaluationMode": "human_gold",
        "goldSource": "diarization-labels.v1",
        "queueSchemaVersion": queue["schemaVersion"],
        "metricContractVersion": contract["metricContractVersion"],
        "metricContract": contract,
        "noInventedGold": True,
        "legacyRegressionEvidence": existing.get("legacyRegressionEvidence", {}),
        "derJERAvailable": True,
        "speakerF1Available": False,
        "wordMaeAvailable": False,
        "boundaryF1Role": "legacy_diagnostic_only",
        "requiredBeforeRun": [],
        "models": sorted(model_records.values(), key=lambda item: (item["model"], item.get("modelVersion") or "")),
        "results": results,
        "notes": "DER/JER main score는 overlap-inclusive multi-label protocol로 계산했다. boundary F1은 legacy diagnostic only다.",
    }
    return ledger, attempt_report("PASS", [], contract, results)


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--labels-dir", type=Path, default=DEFAULT_LABELS)
    parser.add_argument("--hypotheses-dir", type=Path, default=DEFAULT_HYPOTHESES)
    parser.add_argument("--uem-dir", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument(
        "--write-ledger",
        action="store_true",
        help="write the PASS ledger only after every selected task scores successfully",
    )
    parser.add_argument(
        "--attempt-output",
        type=Path,
        help="optional path for a NOT_RUN/PASS attempt report; it never replaces the baseline ledger",
    )
    return parser.parse_args(list(argv))


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    paths = {
        "queue": repo_path(args.queue),
        "labels": repo_path(args.labels_dir),
        "hypotheses": repo_path(args.hypotheses_dir),
        "uem": repo_path(args.uem_dir) if args.uem_dir is not None else None,
        "output": repo_path(args.output),
        "attempt": repo_path(args.attempt_output) if args.attempt_output is not None else None,
    }
    try:
        ledger, report = build_ledger(
            paths["queue"],
            paths["labels"],
            paths["hypotheses"],
            paths["uem"],
            paths["output"],
        )
        if paths["attempt"] is not None:
            write_json(paths["attempt"], report)
        if ledger is not None and args.write_ledger:
            write_json(paths["output"], ledger)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if ledger is not None else 2
    except (OSError, ValueError, json.JSONDecodeError, RuntimeError) as exc:
        report = attempt_report(
            "ERROR",
            [str(exc)],
            metric_contract(),
        )
        if paths["attempt"] is not None:
            write_json(paths["attempt"], report)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
