#!/usr/bin/env python3
"""Prepare Community-1 batch preflight and human-sized review cards.

This script never promotes model output to gold.  It inventories the selected
pilot sources, estimates rented-compute cost from cached Community-1 runs, and
turns available overlap-inclusive hypotheses into short questions a reviewer
can answer without typing timestamps.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import statistics
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_QA = REPO_ROOT / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa"
DEFAULT_QUEUE = DEFAULT_QA / "diarization-pilot-queue.v1.json"
DEFAULT_OUTPUT = DEFAULT_QA / "preannotations"
DEFAULT_HYPOTHESES = DEFAULT_QA / "hypotheses"
DEFAULT_LABELS = DEFAULT_QA / "labels"
DEFAULT_RUNS = REPO_ROOT / ".data/stt-bench/model-lab/runs"

MODEL = "pyannote/speaker-diarization-community-1"
MODEL_REVISION = "3533c8cf8e369892e6b79ff1bf80f7b0286a54ee"
RUNTIME = "pyannote.audio==4.0.7"
DEFAULT_HOURLY_USD: Optional[float] = None


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


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def seconds_text(value: float) -> str:
    whole = max(0, int(round(value)))
    hours, remainder = divmod(whole, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def absolute(path: Path) -> Path:
    return path if path.is_absolute() else REPO_ROOT / path


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def selected_tasks(queue: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [item for item in queue.get("tasks", []) if isinstance(item, dict)]


def historical_runtime(runs_dir: Path) -> Dict[str, Any]:
    samples: List[Dict[str, Any]] = []
    if runs_dir.is_dir():
        for path in sorted(runs_dir.glob("*community1*.json")):
            try:
                run = load_json(path)
                duration = float(run.get("durationSec") or 0)
                wall_ms = float((run.get("runtime") or {}).get("wallMs") or 0)
                if duration <= 0 or wall_ms <= 0:
                    continue
                samples.append(
                    {
                        "runId": run.get("id"),
                        "durationSec": duration,
                        "wallSec": wall_ms / 1000.0,
                        "realTimeFactor": wall_ms / 1000.0 / duration,
                        "estimatedUsd": (run.get("cost") or {}).get("estimatedUsd"),
                    }
                )
            except (OSError, ValueError, TypeError, json.JSONDecodeError):
                continue
    rtfs = [float(item["realTimeFactor"]) for item in samples]
    return {
        "sampleCount": len(samples),
        "medianRealTimeFactor": round(statistics.median(rtfs), 4) if rtfs else None,
        "maxObservedRealTimeFactor": round(max(rtfs), 4) if rtfs else None,
        "samples": samples,
    }


def source_inventory(tasks: Sequence[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[str]]:
    rows: List[Dict[str, Any]] = []
    errors: List[str] = []
    for task in tasks:
        source = task.get("source") or {}
        relative = Path(str(source.get("path") or ""))
        path = absolute(relative)
        exists = path.is_file()
        expected_bytes = int(source.get("bytes") or 0)
        actual_bytes = path.stat().st_size if exists else 0
        if not exists:
            errors.append(f"{task.get('taskId')}: source missing: {relative}")
        elif expected_bytes and expected_bytes != actual_bytes:
            errors.append(f"{task.get('taskId')}: source byte count changed")
        rows.append(
            {
                "taskId": task.get("taskId"),
                "sessionId": task.get("sessionId"),
                "sourcePath": str(relative),
                "sourcePageUrl": source.get("sourcePageUrl"),
                "sourceSha256": source.get("sha256"),
                "durationSec": round(float(source.get("durationSec") or 0), 3),
                "bytes": actual_bytes,
                "exists": exists,
                "primaryFocus": (task.get("classification") or {}).get("primaryFocus"),
                "candidateTags": (task.get("classification") or {}).get("candidateTags") or [],
            }
        )
    return rows, errors


def hypothesis_candidates(hypotheses_dir: Path, session_id: str) -> List[Path]:
    return [
        hypotheses_dir / f"{session_id}.community1.v2.json",
        hypotheses_dir / f"{session_id}.hypothesis.v1.json",
        hypotheses_dir / f"{session_id}.json",
    ]


def regular_segments(hypothesis: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], str]:
    outputs = hypothesis.get("outputs") or {}
    regular = outputs.get("regular") if isinstance(outputs, dict) else None
    exclusive = outputs.get("exclusive") if isinstance(outputs, dict) else None
    if not isinstance(regular, dict) or regular.get("outputType") != "speaker_diarization":
        raise ValueError("hypothesis is missing outputs.regular speaker_diarization")
    if not isinstance(regular.get("segments"), list):
        raise ValueError("hypothesis outputs.regular.segments must be a list")
    if (
        not isinstance(exclusive, dict)
        or exclusive.get("outputType") != "exclusive_speaker_diarization"
        or not isinstance(exclusive.get("segments"), list)
    ):
        raise ValueError("hypothesis is missing outputs.exclusive exclusive_speaker_diarization")
    return regular["segments"], "speaker_diarization"


def clean_segments(items: Sequence[Dict[str, Any]], duration: float) -> List[Dict[str, Any]]:
    cleaned: List[Dict[str, Any]] = []
    for item in items:
        try:
            start = max(0.0, float(item["startSec"]))
            end = min(duration, float(item["endSec"]))
            speaker = str(item["speaker"])
        except (KeyError, TypeError, ValueError):
            continue
        if end <= start or not speaker:
            continue
        cleaned.append({"startSec": start, "endSec": end, "speaker": speaker})
    return sorted(cleaned, key=lambda item: (item["startSec"], item["endSec"], item["speaker"]))


def overlap_regions(segments: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    points: Dict[float, List[Tuple[str, int]]] = defaultdict(list)
    for segment in segments:
        points[float(segment["startSec"])].append((str(segment["speaker"]), 1))
        points[float(segment["endSec"])].append((str(segment["speaker"]), -1))
    counts: Counter[str] = Counter()
    regions: List[Dict[str, Any]] = []
    previous: Optional[float] = None
    for timestamp in sorted(points):
        active = sorted(speaker for speaker, count in counts.items() if count > 0)
        if previous is not None and timestamp > previous and len(active) >= 2:
            if regions and abs(regions[-1]["endSec"] - previous) < 0.001 and regions[-1]["speakers"] == active:
                regions[-1]["endSec"] = timestamp
            else:
                regions.append({"startSec": previous, "endSec": timestamp, "speakers": active})
        # End events must be applied before start events at an identical boundary.
        for speaker, delta in sorted(points[timestamp], key=lambda item: item[1]):
            counts[speaker] += delta
            if counts[speaker] <= 0:
                counts.pop(speaker, None)
        previous = timestamp
    return regions


def card_definition(kind: str) -> Tuple[str, List[str], int]:
    definitions = {
        "manual_report": (
            "이 시점에 다른 사람이 끼어들거나 두 목소리가 동시에 들립니까? 정확한 초는 입력하지 않아도 됩니다.",
            ["OVERLAP_CONFIRMED", "SEQUENTIAL_ONLY", "INTERRUPTION_BUT_NO_OVERLAP", "UNCERTAIN"],
            110,
        ),
        "overlap": (
            "강조된 구간에 실제로 두 명 이상이 동시에 말합니까?",
            ["OVERLAP_CONFIRMED", "SEQUENTIAL_ONLY", "NONSPEECH_MIXED", "UNCERTAIN"],
            100,
        ),
        "single_speaker_extra_cluster": (
            "1인 기준 영상에서 이 목소리가 본 발표자와 다른 실제 화자입니까?",
            ["SAME_SPEAKER", "DIFFERENT_SPEAKER", "NONSPEECH", "UNCERTAIN"],
            95,
        ),
        "late_entrant": (
            "이 짧은 발화는 앞 화자와 다른 새 화자입니까?",
            ["SAME_SPEAKER", "DIFFERENT_SPEAKER", "NONSPEECH", "UNCERTAIN"],
            90,
        ),
        "reappearance": (
            "앞뒤 두 발화는 긴 공백 뒤 다시 등장한 같은 사람입니까?",
            ["SAME_SPEAKER", "DIFFERENT_SPEAKER", "UNCERTAIN"],
            80,
        ),
        "short_turn": (
            "이 짧은 구간은 실제 발화이며 표시된 주변 화자와 구분되는 목소리입니까?",
            ["DIFFERENT_SPEAKER", "SAME_SPEAKER", "NONSPEECH", "UNCERTAIN"],
            60,
        ),
    }
    return definitions[kind]


def make_card(
    task: Dict[str, Any],
    kind: str,
    start: float,
    end: float,
    speakers: Sequence[str],
    sequence: int,
    detail: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    source = task.get("source") or {}
    duration = float(source.get("durationSec") or 0)
    boundary_start = max(0.0, min(duration, start))
    boundary_end = max(boundary_start, min(duration, end))
    question, options, priority = card_definition(kind)
    review_start = max(0.0, start - 5.0)
    review_end = min(duration, end + 5.0)
    page_url = source.get("sourcePageUrl")
    jump_url = None
    if isinstance(page_url, str) and "youtube.com/watch" in page_url:
        separator = "&" if "?" in page_url else "?"
        jump_url = f"{page_url}{separator}t={int(review_start)}s"
    digest = hashlib.sha1(
        f"{task.get('sessionId')}|{kind}|{start:.3f}|{end:.3f}|{','.join(speakers)}".encode("utf-8")
    ).hexdigest()[:8]
    return {
        "cardId": f"{task.get('taskId')}-{kind.upper()}-{sequence:03d}-{digest}",
        "taskId": task.get("taskId"),
        "sessionId": task.get("sessionId"),
        "kind": kind,
        "priority": priority,
        "machineBoundary": {
            "startSec": round(boundary_start, 3),
            "endSec": round(boundary_end, 3),
        },
        "machineSpeakers": list(speakers),
        "reviewWindow": {
            "startSec": round(review_start, 3),
            "endSec": round(review_end, 3),
            "startText": seconds_text(review_start),
            "endText": seconds_text(review_end),
        },
        "sourcePath": source.get("path"),
        "sourceDurationSec": round(duration, 3),
        "sourcePageUrl": page_url,
        "jumpUrl": jump_url,
        "question": question,
        "answerOptions": options,
        "detail": detail or {},
        "visualReviewRecommended": True,
        "status": "PENDING_HUMAN_DECISION",
        "humanDecision": None,
        "goldStatus": "NOT_GOLD_PREANNOTATION",
    }


def manual_cards(task: Dict[str, Any], labels_dir: Path) -> List[Dict[str, Any]]:
    label_path = labels_dir / f"{task.get('sessionId')}.labels.v1.json"
    if not label_path.is_file():
        return []
    labels = load_json(label_path)
    cards: List[Dict[str, Any]] = []
    for index, event in enumerate(labels.get("events") or [], start=1):
        if not isinstance(event, dict) or not isinstance(event.get("anchorSec"), (int, float)):
            continue
        anchor = float(event["anchorSec"])
        card = make_card(
            task,
            "manual_report",
            anchor - 0.75,
            anchor + 0.75,
            [],
            index,
            {"eventId": event.get("eventId"), "notes": event.get("notes")},
        )
        if event.get("humanDecision") is not None:
            card["humanDecision"] = copy.deepcopy(event["humanDecision"])
            card["status"] = "HUMAN_DECISION_RECORDED"
        cards.append(card)
    return cards


def apply_label_decisions(
    cards: Sequence[Dict[str, Any]], session_id: str, labels_dir: Path
) -> None:
    """Recover card decisions from the label ledger after an interrupted write."""

    label_path = labels_dir / f"{session_id}.labels.v1.json"
    if not label_path.is_file():
        return
    labels = load_json(label_path)
    decisions = {
        str(event.get("reviewCardId")): event.get("humanDecision")
        for event in labels.get("events") or []
        if isinstance(event, dict)
        and event.get("reviewCardId")
        and event.get("humanDecision") is not None
    }
    for card in cards:
        decision = decisions.get(str(card.get("cardId")))
        if decision is not None:
            card["humanDecision"] = copy.deepcopy(decision)
            card["status"] = "HUMAN_DECISION_RECORDED"


def hypothesis_cards(
    task: Dict[str, Any],
    segments: Sequence[Dict[str, Any]],
    analyzed_window: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    cards: List[Dict[str, Any]] = []
    sequence: Counter[str] = Counter()

    def add(kind: str, start: float, end: float, speakers: Sequence[str], detail: Optional[Dict[str, Any]] = None) -> None:
        sequence[kind] += 1
        cards.append(make_card(task, kind, start, end, speakers, sequence[kind], detail))

    for region in overlap_regions(segments):
        add("overlap", region["startSec"], region["endSec"], region["speakers"])

    first_seen: Dict[str, float] = {}
    by_speaker: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    duration_by_speaker: Counter[str] = Counter()
    window_offset = float((analyzed_window or {}).get("offsetSec") or 0)
    for segment in segments:
        speaker = str(segment["speaker"])
        start = float(segment["startSec"])
        end = float(segment["endSec"])
        first_seen.setdefault(speaker, start)
        by_speaker[speaker].append(segment)
        duration_by_speaker[speaker] += end - start
        turn_duration = end - start
        if turn_duration <= 2.5:
            add("short_turn", start, end, [speaker], {"durationSec": round(turn_duration, 3)})
        if (
            first_seen[speaker] - window_offset >= 60.0
            and turn_duration <= 8.0
            and len(by_speaker[speaker]) == 1
        ):
            add(
                "late_entrant",
                start,
                end,
                [speaker],
                {
                    "firstAppearanceSec": round(start, 3),
                    "firstAppearanceWithinAnalyzedWindowSec": round(start - window_offset, 3),
                    "partialSourceContext": bool(window_offset),
                },
            )

    for speaker, speaker_segments in by_speaker.items():
        for left, right in zip(speaker_segments, speaker_segments[1:]):
            gap = float(right["startSec"]) - float(left["endSec"])
            if gap >= 30.0:
                first_start = max(float(left["startSec"]), float(left["endSec"]) - 3.0)
                first_end = float(left["endSec"])
                second_start = float(right["startSec"])
                second_end = min(float(right["endSec"]), float(right["startSec"]) + 3.0)
                add(
                    "reappearance",
                    second_start,
                    second_end,
                    [speaker],
                    {
                        "firstInterval": [left["startSec"], left["endSec"]],
                        "secondInterval": [right["startSec"], right["endSec"]],
                        "comparisonWindows": [
                            {"startSec": first_start, "endSec": first_end},
                            {"startSec": second_start, "endSec": second_end},
                        ],
                        "gapSec": round(gap, 3),
                    },
                )

    tags = set((task.get("classification") or {}).get("candidateTags") or [])
    if "single_speaker_control_candidate" in tags and duration_by_speaker:
        dominant = duration_by_speaker.most_common(1)[0][0]
        for segment in segments:
            speaker = str(segment["speaker"])
            if speaker != dominant:
                add(
                    "single_speaker_extra_cluster",
                    float(segment["startSec"]),
                    float(segment["endSec"]),
                    [speaker, dominant],
                    {"dominantMachineSpeaker": dominant},
                )

    # Keep all high-risk overlap/manual/control cards and cap repetitive lower
    # priority cards so the reviewer sees decisions, not an automatic transcript.
    cards.sort(key=lambda card: (-int(card["priority"]), card["machineBoundary"]["startSec"]))
    high = [card for card in cards if int(card["priority"]) >= 95]
    lower = [card for card in cards if int(card["priority"]) < 95][:80]
    return sorted(high + lower, key=lambda card: (-int(card["priority"]), card["machineBoundary"]["startSec"]))


def preserve_human_decisions(
    cards: Sequence[Dict[str, Any]], existing_review: Optional[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Carry reviewed decisions across deterministic regeneration.

    Decisions whose old card no longer exists are retained separately as stale
    provenance.  They are never silently attached to a changed machine boundary.
    """

    old_cards = {
        str(card.get("cardId")): card
        for card in (existing_review or {}).get("cards", [])
        if isinstance(card, dict) and card.get("cardId")
    }
    merged: List[Dict[str, Any]] = []
    generated_ids = set()
    for generated in cards:
        card = copy.deepcopy(generated)
        card_id = str(card.get("cardId"))
        generated_ids.add(card_id)
        old = old_cards.get(card_id)
        if isinstance(old, dict) and old.get("humanDecision") is not None:
            card["humanDecision"] = copy.deepcopy(old["humanDecision"])
            card["status"] = str(old.get("status") or "HUMAN_DECISION_RECORDED")
        merged.append(card)
    retired_by_id = {
        str(card.get("cardId")): copy.deepcopy(card)
        for card in (existing_review or {}).get("retiredDecidedCards", [])
        if isinstance(card, dict) and card.get("cardId") and card.get("humanDecision") is not None
    }
    for card_id, old in old_cards.items():
        if card_id in generated_ids or old.get("humanDecision") is None:
            continue
        retained = copy.deepcopy(old)
        retained["status"] = "STALE_PREANNOTATION_DECISION_PRESERVED"
        retained["staleReason"] = "card not reproduced by the current machine hypothesis"
        retired_by_id[card_id] = retained
    return merged, sorted(retired_by_id.values(), key=lambda card: str(card.get("cardId")))


def build(args: argparse.Namespace) -> Dict[str, Any]:
    queue = load_json(args.queue)
    tasks = selected_tasks(queue)
    inventory, errors = source_inventory(tasks)
    runtime = historical_runtime(args.runs_dir)
    total_duration = sum(float(row["durationSec"]) for row in inventory)
    total_bytes = sum(int(row["bytes"]) for row in inventory)
    max_rtf = runtime.get("maxObservedRealTimeFactor")
    conservative_rtf = float(max_rtf) * 1.2 if isinstance(max_rtf, (int, float)) else 1.25
    hourly = float(args.hourly_usd) if args.hourly_usd is not None else None

    existing_review_path = args.output / "review-cards.v1.json"
    existing_review = load_json(existing_review_path) if existing_review_path.is_file() else None
    cards: List[Dict[str, Any]] = []
    sessions: List[Dict[str, Any]] = []
    for task in tasks:
        session_id = str(task.get("sessionId"))
        source_duration = float((task.get("source") or {}).get("durationSec") or 0)
        session_cards = manual_cards(task, args.labels_dir)
        hypothesis_path = next((path for path in hypothesis_candidates(args.hypotheses_dir, session_id) if path.is_file()), None)
        hypothesis_status = "WAITING_FOR_COMMUNITY1"
        hypothesis_error = None
        segment_count = 0
        if hypothesis_path is not None:
            try:
                hypothesis = load_json(hypothesis_path)
                if hypothesis.get("schemaVersion") != 2:
                    raise ValueError(f"unexpected schemaVersion: {hypothesis.get('schemaVersion')}")
                if hypothesis.get("model") != MODEL:
                    raise ValueError(f"unexpected model: {hypothesis.get('model')}")
                if hypothesis.get("modelVersion") != MODEL_REVISION:
                    raise ValueError(f"unexpected modelVersion: {hypothesis.get('modelVersion')}")
                if hypothesis.get("sessionId") != session_id:
                    raise ValueError(f"unexpected sessionId: {hypothesis.get('sessionId')}")
                hypothesis_source = hypothesis.get("source") or {}
                if hypothesis_source.get("sourceSha256") != (task.get("source") or {}).get("sha256"):
                    raise ValueError("hypothesis sourceSha256 does not match the queue")
                source_window = hypothesis_source.get("sourceWindow") or {}
                if not source_window.get("timestampsUseOriginalTimeline"):
                    raise ValueError("hypothesis does not prove original-timeline timestamps")
                raw_segments, output_type = regular_segments(hypothesis)
                if output_type != "speaker_diarization":
                    raise ValueError(f"main output is not speaker_diarization: {output_type}")
                segments = clean_segments(raw_segments, source_duration)
                segment_count = len(segments)
                session_cards.extend(hypothesis_cards(task, segments, source_window))
                hypothesis_status = "COMMUNITY1_PREANNOTATION_AVAILABLE"
            except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
                hypothesis_status = "INVALID_HYPOTHESIS"
                hypothesis_error = str(exc)
        apply_label_decisions(session_cards, session_id, args.labels_dir)
        cards.extend(session_cards)
        sessions.append(
            {
                "taskId": task.get("taskId"),
                "sessionId": session_id,
                "hypothesisPath": display_path(hypothesis_path) if hypothesis_path else None,
                "hypothesisStatus": hypothesis_status,
                "hypothesisError": hypothesis_error,
                "regularSegmentCount": segment_count,
                "reviewCardCount": len(session_cards),
            }
        )

    all_hypotheses_available = all(
        row["hypothesisStatus"] == "COMMUNITY1_PREANNOTATION_AVAILABLE"
        for row in sessions
    )
    external_processing_approved = bool(
        args.external_processing_approved or args.faith_gcp_approved
    )
    compute_provider = "faith-gcp" if args.faith_gcp_approved else args.compute_provider
    if errors:
        plan_status = "BLOCKED_SOURCE_INVENTORY"
    elif all_hypotheses_available:
        plan_status = "PREANNOTATION_READY_FOR_HUMAN_REVIEW"
    elif external_processing_approved:
        plan_status = "BLOCKED_PENDING_EXPLICIT_BUDGET_APPROVAL"
    else:
        plan_status = "BLOCKED_PENDING_EXPLICIT_BUDGET_AND_EXTERNAL_AUDIO_APPROVAL"
    plan = {
        "schemaVersion": "community1-preannotation-plan.v1",
        "generatedAt": utc_now(),
        "status": plan_status,
        "targetModel": {
            "model": MODEL,
            "revision": MODEL_REVISION,
            "runtime": RUNTIME,
            "requiredMainOutput": "speaker_diarization",
            "derivedOutput": "exclusive_speaker_diarization",
        },
        "sourceInventory": inventory,
        "sourceErrors": errors,
        "aggregate": {
            "sourceCount": len(inventory),
            "sourceHours": round(total_duration / 3600.0, 6),
            "sourceBytes": total_bytes,
            "sourceGiB": round(total_bytes / 1024**3, 3),
        },
        "computePreflight": {
            "provider": compute_provider,
            "region": "marketplace-offer" if compute_provider == "vast-ai" else "asia-southeast1",
            "machine": "secure-cloud-on-demand-24GiB-vram-minimum" if compute_provider == "vast-ai" else "8-vcpu-32GiB-cpu",
            "project": None if compute_provider == "vast-ai" else "project-e80b5533-27b9-4476-9a4",
            "existingJob": None if compute_provider == "vast-ai" else "faith-community1-cpu",
            "newServerAllowed": compute_provider == "vast-ai",
            "historicalCpuRuntime": runtime,
            "configuredHourlyUsd": hourly,
            "conservativeRealTimeFactor": round(conservative_rtf, 4),
            "estimatedComputeHours": (
                None
                if compute_provider == "vast-ai"
                else round(total_duration / 3600.0 * conservative_rtf, 3)
            ),
            "estimatedComputeUsd": (
                round(total_duration / 3600.0 * conservative_rtf * hourly, 2)
                if hourly is not None and compute_provider != "vast-ai"
                else None
            ),
            "estimateBasis": "Vast.ai GPU time and cost remain null until the repeated full-session canary and a live total hourly offer are available; cached CPU runs are retained as history only",
            "currentJobTimeoutSec": None if compute_provider == "vast-ai" else 1800,
            "requiredTimeoutSec": (
                7200
                if compute_provider == "vast-ai"
                else max(
                    10800,
                    math.ceil(
                        max((row["durationSec"] for row in inventory), default=0)
                        * conservative_rtf
                        * 1.25
                    ),
                )
            ),
        },
        "privacyAndRights": {
            "audioSentExternally": True,
            "cloudInputRole": "temporary_diagnostic_preannotation_only",
            "trainingPromotion": False,
            "sourceRightsRemainPending": True,
            "approvalRecorded": external_processing_approved,
            "approvalScope": (
                "existing_faith_gcp_project_only"
                if args.faith_gcp_approved
                else ("vast_ai_diagnostic_preannotation_only" if args.external_processing_approved else None)
            ),
        },
        "sessions": sessions,
        "nextAction": (
            "Review generated cards; machine boundaries remain non-gold."
            if all_hypotheses_available
            else "After explicit offer and budget approval, run schema-v2 Community-1, download immutable results, and generate review cards."
        ),
    }
    sorted_cards = sorted(
        cards,
        key=lambda card: (-int(card["priority"]), card["taskId"], card["machineBoundary"]["startSec"]),
    )
    sorted_cards, retired_decisions = preserve_human_decisions(sorted_cards, existing_review)
    if any(row["hypothesisStatus"] == "INVALID_HYPOTHESIS" for row in sessions):
        review_status = "BLOCKED_INVALID_HYPOTHESIS"
    elif any(row["hypothesisStatus"] == "WAITING_FOR_COMMUNITY1" for row in sessions):
        review_status = "WAITING_FOR_COMMUNITY1"
    else:
        review_status = "READY_FOR_HUMAN_DECISIONS"
    decided_count = sum(1 for card in sorted_cards if card.get("humanDecision") is not None)
    review = {
        "schemaVersion": "diarization-review-cards.v1",
        "generatedAt": plan["generatedAt"],
        "status": review_status,
        "contract": {
            "userDoesNotEnterTimestamps": True,
            "machineBoundaryIsSuggestionUntilConfirmed": True,
            "visualEvidenceIsAuxiliary": True,
            "automaticOutputIsGold": False,
            "decisionRegistration": "User answers by cardId and option; the agent records exact machine intervals and provenance mechanically.",
        },
        "cardCount": len(sorted_cards),
        "decidedCardCount": decided_count,
        "cards": sorted_cards,
        "retiredDecidedCards": retired_decisions,
    }
    write_json(args.output / "preannotation-plan.v1.json", plan)
    write_json(args.output / "review-cards.v1.json", review)
    return {"plan": plan, "review": review}


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--hypotheses-dir", type=Path, default=DEFAULT_HYPOTHESES)
    parser.add_argument("--labels-dir", type=Path, default=DEFAULT_LABELS)
    parser.add_argument("--runs-dir", type=Path, default=DEFAULT_RUNS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--hourly-usd", type=float, default=DEFAULT_HOURLY_USD)
    parser.add_argument(
        "--compute-provider",
        choices=("vast-ai", "faith-gcp", "other"),
        default="vast-ai",
    )
    parser.add_argument(
        "--external-processing-approved",
        action="store_true",
        help="record approval for Vast.ai diagnostic preannotation only; this does not approve training",
    )
    parser.add_argument(
        "--faith-gcp-approved",
        action="store_true",
        help="record approval to process temporary diagnostic audio only in the existing Faith GCP project",
    )
    values = parser.parse_args(list(argv))
    values.queue = absolute(values.queue)
    values.hypotheses_dir = absolute(values.hypotheses_dir)
    values.labels_dir = absolute(values.labels_dir)
    values.runs_dir = absolute(values.runs_dir)
    values.output = absolute(values.output)
    return values


def main(argv: Optional[Iterable[str]] = None) -> int:
    try:
        args = parse_args(sys.argv[1:] if argv is None else argv)
        result = build(args)
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        print(f"preannotation preparation failed: {exc}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "status": result["plan"]["status"],
                "sourceHours": result["plan"]["aggregate"]["sourceHours"],
                "estimatedComputeUsd": result["plan"]["computePreflight"]["estimatedComputeUsd"],
                "reviewCards": result["review"]["cardCount"],
                "output": str(args.output),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
