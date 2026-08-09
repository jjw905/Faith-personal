#!/usr/bin/env python3
"""Create non-gold work files for the diarization pilot.

The generated label files are intentionally empty and pending. This command
refuses to overwrite any existing file unless --force is supplied, so a later
run cannot erase human annotations by accident.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

try:
    from diarization_metric_contract import metric_contract, validate_metric_contract
except ModuleNotFoundError:  # allows importing the generator from a test harness
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from diarization_metric_contract import metric_contract, validate_metric_contract


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_QUEUE = (
    REPO_ROOT
    / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa"
    / "diarization-pilot-queue.v1.json"
)
DEFAULT_OUTPUT = DEFAULT_QUEUE.parent


def load_queue(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        queue = json.load(handle)
    if queue.get("schemaVersion") != "diarization-pilot-queue.v1":
        raise ValueError("queue schemaVersion must be diarization-pilot-queue.v1")
    if queue.get("status") != "READY_FOR_HUMAN_REVIEW":
        raise ValueError("queue status must be READY_FOR_HUMAN_REVIEW")
    return queue


def write_json(path: Path, value: Dict[str, Any], force: bool) -> None:
    if path.exists() and not force:
        raise FileExistsError(f"refusing to overwrite existing file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def selected_tasks(queue: Dict[str, Any]) -> List[Dict[str, Any]]:
    tasks = queue.get("tasks")
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("queue has no selected tasks")
    return [task for task in tasks if isinstance(task, dict)]


def label_template(task: Dict[str, Any], generated_at: str) -> Dict[str, Any]:
    source = task["source"]
    classification = task["classification"]
    return {
        "schemaVersion": "diarization-labels.v1",
        "createdAt": generated_at,
        "sessionId": task["sessionId"],
        "sourceId": task["sourceId"],
        "source": {
            "path": source["path"],
            "sha256": source["sha256"],
            "durationSec": source["durationSec"],
        },
        "classification": {
            "primaryBucket": classification["primaryBucket"],
            "primaryDomain": classification["primaryDomain"],
            "primaryFocus": classification["primaryFocus"],
            "candidateTags": classification["candidateTags"],
            "candidateVerdict": "PENDING_HUMAN_REVIEW",
            "speakerProfile": "PENDING_HUMAN_REVIEW",
            "noiseProfile": "PENDING_HUMAN_REVIEW",
            "recordingProfile": "PENDING_HUMAN_REVIEW",
        },
        "review": {
            "status": "PENDING_HUMAN_REVIEW",
            "reviewerIds": [],
            "adjudicatorId": None,
            "reviewedAt": None,
            "secondReviewStatus": "PENDING",
            "adjudicationStatus": "PENDING",
            "notes": "사람 청취 전에는 후보 태그·화자 수·조건을 확정하지 않는다.",
        },
        "gates": {
            "rightsStatus": "PENDING_RIGHTS_REVIEW",
            "split": "diagnostic_regression",
            "splitPromotionStatus": "HOLD_UNTIL_GOLD",
            "annotationVersion": "diarization-v1-draft",
            "diarizationGoldStatus": "none",
            "wordTimingGoldStatus": "none",
            "trainingEligible": False,
            "sealedTestEligible": False,
        },
        "segments": [],
        "speakerRelations": [],
        "events": [],
        "provenance": {
            "queueTaskId": task["taskId"],
            "sourceMetadataPath": source["metadataPath"],
            "candidateOnly": True,
            "automaticOrOfficialReferenceIsGold": False,
        },
    }


def rights_ledger(queue: Dict[str, Any], generated_at: str) -> Dict[str, Any]:
    rows = []
    for task in selected_tasks(queue):
        source = task["source"]
        rows.append(
            {
                "taskId": task["taskId"],
                "sessionId": task["sessionId"],
                "sourceId": task["sourceId"],
                "sourcePath": source["path"],
                "sourceSha256": source["sha256"],
                "sourcePageUrl": source.get("sourcePageUrl"),
                "rightsStatus": "PENDING_RIGHTS_REVIEW",
                "rightsGateApplied": False,
                "holderOrPublisher": None,
                "licenseOrPermissionEvidence": None,
                "trainingScope": None,
                "internalEvaluationScope": "diagnostic review only",
                "attributionRequired": None,
                "retentionUntil": None,
                "reviewerId": None,
                "reviewedAt": None,
                "notes": "공개 URL 또는 포털 제공만으로 학습권한을 추정하지 않는다.",
            }
        )
    return {
        "schemaVersion": "diarization-rights-ledger.v1",
        "generatedAt": generated_at,
        "status": "PENDING_RIGHTS_REVIEW",
        "promotionRule": "모든 selected task가 approved/cleared/passed이고 증거 링크·범위·보존 조건이 있어야 training 승격 가능",
        "rows": rows,
    }


def split_ledger(queue: Dict[str, Any], generated_at: str) -> Dict[str, Any]:
    rows = []
    for task in selected_tasks(queue):
        rows.append(
            {
                "taskId": task["taskId"],
                "sessionId": task["sessionId"],
                "sourceId": task["sourceId"],
                "sourcePath": task["source"]["path"],
                "sourceGroup": task["source"].get("lineage", {}).get("sourceGroup"),
                "seriesGroup": task["source"].get("lineage", {}).get("seriesGroup"),
                "sourceFamily": task["source"].get("lineage", {}).get("sourceFamily"),
                "institution": task["source"].get("lineage", {}).get("institution"),
                "committee": task["source"].get("lineage", {}).get("committee"),
                "meetingDate": task["source"].get("lineage", {}).get("meetingDate"),
                "programOrPlaceGroup": None,
                "assignedSplit": "diagnostic_regression",
                "promotionStatus": "HOLD_UNTIL_GOLD_AND_LEAKAGE_REVIEW",
                "leakageReviewStatus": "PENDING",
                "leakageEvidence": None,
                "notes": "candidate source는 train/dev/sealed에 배치하지 않는다.",
            }
        )
    return {
        "schemaVersion": "diarization-split-ledger.v1",
        "generatedAt": generated_at,
        "status": "HOLD_UNTIL_GOLD_AND_LEAKAGE_REVIEW",
        "allowedSplitsBeforePromotion": ["diagnostic_regression", "regression", "development"],
        "forbiddenBeforePromotion": ["train", "dev", "sealed_test"],
        "leakageRule": "source/session/program/place/equipment/speaker lineage를 비교한 뒤 split을 고정한다.",
        "rows": rows,
    }


def baseline_ledger(queue: Dict[str, Any], generated_at: str) -> Dict[str, Any]:
    contract = metric_contract()
    contract_errors = validate_metric_contract(contract)
    if contract_errors:
        raise ValueError("invalid diarization metric contract: " + "; ".join(contract_errors))

    legacy_summary_path = REPO_ROOT / ".data/stt-bench/model-lab/summary.json"
    legacy_evidence: Dict[str, Any] = {
        "status": "MISSING",
        "path": ".data/stt-bench/model-lab/summary.json",
        "scope": "legacy KTV regression only",
        "metricScope": "legacy_diagnostic_only",
        "notPilotGold": True,
    }
    if legacy_summary_path.is_file():
        try:
            with legacy_summary_path.open("r", encoding="utf-8") as handle:
                legacy_summary = json.load(handle)
            runs = [
                run
                for run in legacy_summary.get("runs", [])
                if run.get("task") == "diarization"
                and run.get("fixtureId") == "ktv-briefing-20251231"
                and isinstance(run.get("metrics", {}).get("boundary", {}).get("f1"), (int, float))
            ]
            runs.sort(key=lambda run: run["metrics"]["boundary"]["f1"], reverse=True)
            legacy_evidence = {
                "status": "AVAILABLE_CACHE_ONLY",
                "path": ".data/stt-bench/model-lab/summary.json",
                "scope": "legacy KTV regression only",
                "metricScope": "legacy_diagnostic_only",
                "notPilotGold": True,
                "generatedAt": legacy_summary.get("generatedAt"),
                "runCount": legacy_summary.get("runCount"),
                "topCachedRuns": [
                    {
                        "id": run.get("id"),
                        "model": run.get("model"),
                        "boundaryF1": run["metrics"]["boundary"].get("f1"),
                        "speakerCount": run["metrics"].get("speakerCount"),
                        "hostCallSameAsHost": run["metrics"].get("criticalHandoff", {}).get("hostCallSameAsHost"),
                    }
                    for run in runs[:3]
                ],
            }
        except (OSError, json.JSONDecodeError, TypeError, KeyError):
            legacy_evidence["status"] = "UNREADABLE"
    generalization_path = REPO_ROOT / ".data/stt-bench/model-lab/community1-generalization.json"
    if generalization_path.is_file():
        try:
            with generalization_path.open("r", encoding="utf-8") as handle:
                generalization = json.load(handle)
            legacy_evidence["community1Generalization"] = {
                "status": "AVAILABLE_CACHE_ONLY",
                "path": ".data/stt-bench/model-lab/community1-generalization.json",
                "metricScope": "legacy_diagnostic_only",
                "notPilotGold": True,
                "generatedAt": generalization.get("generatedAt"),
                "passed": generalization.get("passed"),
                "fixtures": [
                    {
                        "fixtureId": fixture.get("fixtureId"),
                        "passed": fixture.get("passed"),
                        "goldSpeakerCount": fixture.get("gold", {}).get("speakerCount"),
                        "predictedSpeakerCount": fixture.get("predicted", {}).get("speakerCount"),
                        "boundaryF1": fixture.get("boundary", {}).get("f1"),
                        "oneToOneAccuracy": fixture.get("identity", {}).get("oneToOneAccuracy"),
                    }
                    for fixture in generalization.get("fixtures", [])
                ],
            }
        except (OSError, json.JSONDecodeError, TypeError, KeyError):
            legacy_evidence["community1Generalization"] = {"status": "UNREADABLE", "notPilotGold": True}
    return {
        "schemaVersion": "diarization-baseline-evaluation-ledger.v1",
        "generatedAt": generated_at,
        "status": "NOT_RUN",
        "evaluationMode": "cache_only_until_gold_labels_exist",
        "goldSource": "diarization-labels.v1",
        "targetModelContract": {
            "program": "community1_korean_meeting_adaptation",
            "model": "pyannote/speaker-diarization-community-1",
            "revision": "3533c8cf8e369892e6b79ff1bf80f7b0286a54ee",
            "runtime": "pyannote.audio==4.0.7",
            "input": "mono_16khz_audio_only",
            "mainOutput": "speaker_diarization",
            "derivedOutput": "exclusive_speaker_diarization",
            "derivedOutputRole": "stt_alignment_and_product_only",
            "whisperRole": "navigation_reference_only_not_training_target",
            "weightFineTuningStatus": "NOT_STARTED",
            "segmentationFineTuningCompatibility": "NOT_VERIFIED",
        },
        "queueSchemaVersion": queue["schemaVersion"],
        "metricContractVersion": contract["metricContractVersion"],
        "metricContract": contract,
        "noInventedGold": True,
        "legacyRegressionEvidence": legacy_evidence,
        "speakerF1Available": False,
        "wordMaeAvailable": False,
        "boundaryF1Role": "legacy_diagnostic_only",
        "requiredBeforeRun": [
            "human_diarization_segments",
            "absolute_speaker_start_end",
            "review_status_REVIEWED_or_better",
            "rights_gate_for_training_claim",
            "leakage_safe_split_ledger",
            "metric_contract_v2",
            "multi_label_rttm_and_uem",
            "overlap_inclusive_main_protocol",
            "community1_regular_and_exclusive_outputs_preserved_separately",
            "same_protocol_baseline_and_candidate",
        ],
        "models": [],
        "results": [],
        "notes": "기존 KTV/brief 캐시는 boundary F1 중심의 회귀·개발용이며 새 파일럿 gold 성능으로 재명명하지 않는다. 새 파일럿은 DER/JER와 조건별 진단 지표를 사용한다.",
    }


def progress_ledger(queue: Dict[str, Any], generated_at: str) -> Dict[str, Any]:
    rows = []
    for task in selected_tasks(queue):
        rows.append(
            {
                "taskId": task["taskId"],
                "sessionId": task["sessionId"],
                "labelFile": f"labels/{task['sessionId']}.labels.v1.json",
                "sourceHours": round(task["source"]["durationSec"] / 3600.0, 6),
                "candidateVerdict": "PENDING_HUMAN_REVIEW",
                "labelStatus": "PENDING_HUMAN_REVIEW",
                "doubleReviewStatus": "PENDING",
                "adjudicationStatus": "PENDING",
                "rightsStatus": "PENDING_RIGHTS_REVIEW",
                "splitStatus": "HOLD_UNTIL_GOLD",
                "baselineStatus": "NOT_RUN",
                "eligibleForGold": False,
            }
        )
    return {
        "schemaVersion": "diarization-pilot-progress.v1",
        "generatedAt": generated_at,
        "queueSchemaVersion": queue["schemaVersion"],
        "status": "READY_FOR_HUMAN_REVIEW",
        "aggregate": {
            "selectedSourceHours": queue["pilotTarget"]["selectedSourceHours"],
            "confirmedSituationHours": 0.0,
            "humanReviewedHours": 0.0,
            "doubleReviewedHours": 0.0,
            "adjudicatedHours": 0.0,
            "rightsClearedHours": 0.0,
            "goldHours": 0.0,
        },
        "rows": rows,
    }


def review_windows(queue: Dict[str, Any], generated_at: str, window_sec: float = 600.0) -> Dict[str, Any]:
    windows: List[Dict[str, Any]] = []
    for task in selected_tasks(queue):
        duration = float(task["source"]["durationSec"])
        start = 0.0
        index = 1
        while start < duration:
            end = min(duration, start + window_sec)
            windows.append(
                {
                    "windowId": f"{task['taskId']}-W{index:03d}",
                    "taskId": task["taskId"],
                    "sessionId": task["sessionId"],
                    "labelFile": f"labels/{task['sessionId']}.labels.v1.json",
                    "sourcePath": task["source"]["path"],
                    "startSec": round(start, 3),
                    "endSec": round(end, 3),
                    "durationSec": round(end - start, 3),
                    "primaryFocus": task["classification"]["primaryFocus"],
                    "candidateTags": task["classification"]["candidateTags"],
                    "reviewStatus": "PENDING_HUMAN_REVIEW",
                    "candidateOnly": True,
                }
            )
            start = end
            index += 1
    return {
        "schemaVersion": "diarization-review-windows.v1",
        "generatedAt": generated_at,
        "status": "READY_FOR_HUMAN_REVIEW",
        "coverageRule": "10분 창으로 selected 원본 전체를 연속 덮는다. 창 자체는 gold interval이 아니다.",
        "windowSizeSec": window_sec,
        "sourceHours": queue["pilotTarget"]["selectedSourceHours"],
        "windowCount": len(windows),
        "windows": windows,
    }


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--force", action="store_true", help="allow overwriting generated files")
    parser.add_argument(
        "--refresh-ledgers",
        action="store_true",
        help="refresh rights/split/baseline/progress ledgers without touching label files",
    )
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    queue_path = args.queue if args.queue.is_absolute() else REPO_ROOT / args.queue
    output_dir = args.output if args.output.is_absolute() else REPO_ROOT / args.output
    try:
        queue = load_queue(queue_path)
        generated_at = datetime.now(timezone.utc).isoformat()
        tasks = selected_tasks(queue)
        labels_dir = output_dir / "labels"
        # Keep empty input folders visible so a later scorer cannot silently
        # confuse a missing evaluation input with an empty score.
        (output_dir / "hypotheses").mkdir(parents=True, exist_ok=True)
        (output_dir / "uem").mkdir(parents=True, exist_ok=True)
        if not args.refresh_ledgers or args.force:
            for task in tasks:
                label_path = labels_dir / f"{task['sessionId']}.labels.v1.json"
                write_json(label_path, label_template(task, generated_at), args.force)
        ledger_force = args.force or args.refresh_ledgers
        write_json(output_dir / "rights-ledger.v1.json", rights_ledger(queue, generated_at), ledger_force)
        write_json(output_dir / "split-ledger.v1.json", split_ledger(queue, generated_at), ledger_force)
        write_json(output_dir / "baseline-evaluation-ledger.v1.json", baseline_ledger(queue, generated_at), ledger_force)
        write_json(output_dir / "review-progress.v1.json", progress_ledger(queue, generated_at), ledger_force)
        write_json(output_dir / "review-windows.v1.json", review_windows(queue, generated_at), ledger_force)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"pilot workspace build failed: {exc}", file=sys.stderr)
        return 1

    print(
        json.dumps(
            {
                "output": str(output_dir),
                "labelTemplates": len(tasks),
                "status": "READY_FOR_HUMAN_REVIEW",
                "overwrote": args.force,
                "refreshedLedgers": args.refresh_ledgers or args.force,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
