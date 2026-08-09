#!/usr/bin/env python3
"""Audit all gates required before promoting the diarization pilot to gold.

This report is a current-state audit, not a claim of completion. It writes a
machine-readable report and keeps quarantine readiness separate from training
promotion readiness.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

try:
    from diarization_metric_contract import (
        METRIC_CONTRACT_VERSION,
        validate_metric_contract,
    )
except ModuleNotFoundError:  # allows importing the auditor from a test harness
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from diarization_metric_contract import (
        METRIC_CONTRACT_VERSION,
        validate_metric_contract,
    )


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ROOT = (
    REPO_ROOT
    / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa"
)
DEFAULT_QUEUE = DEFAULT_ROOT / "diarization-pilot-queue.v1.json"
DEFAULT_LABELS = DEFAULT_ROOT / "labels"
DEFAULT_RIGHTS = DEFAULT_ROOT / "rights-ledger.v1.json"
DEFAULT_SPLIT = DEFAULT_ROOT / "split-ledger.v1.json"
DEFAULT_BASELINE = DEFAULT_ROOT / "baseline-evaluation-ledger.v1.json"
DEFAULT_WINDOWS = DEFAULT_ROOT / "review-windows.v1.json"
DEFAULT_OUTPUT = DEFAULT_ROOT / "pilot-gate-report.v1.json"


def repo_path(path: Path) -> Path:
    return path if path.is_absolute() else REPO_ROOT / path


def load_json(path: Path) -> Optional[Dict[str, Any]]:
    if not path.is_file():
        return None
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain a JSON object")
    return value


def load_validator() -> Any:
    validator_path = Path(__file__).with_name("validate-diarization-labels.py")
    spec = importlib.util.spec_from_file_location("validate_diarization_labels", validator_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"could not load validator: {validator_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def gate(name: str, status: str, evidence: Any, blockers: List[str]) -> Dict[str, Any]:
    return {"name": name, "status": status, "evidence": evidence, "blockers": blockers}


def selected_tasks(queue: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [task for task in queue.get("tasks", []) if isinstance(task, dict)]


def audit_labels(
    queue: Dict[str, Any], labels_dir: Path, queue_path: Path, validator: Any
) -> Dict[str, Any]:
    reports: List[Dict[str, Any]] = []
    missing: List[str] = []
    for task in selected_tasks(queue):
        label_path = labels_dir / f"{task['sessionId']}.labels.v1.json"
        if not label_path.is_file():
            missing.append(task["taskId"])
            continue
        try:
            labels = load_json(label_path)
            if labels is None:
                missing.append(task["taskId"])
                continue
            report = validator.validate_labels(labels, queue_path)
        except (OSError, json.JSONDecodeError, ValueError) as exc:
            report = {"ok": False, "eligibleForGold": False, "errors": [str(exc)], "warnings": []}
        reports.append(
            {
                "taskId": task["taskId"],
                "sessionId": task["sessionId"],
                "labelPath": str(label_path.relative_to(REPO_ROOT)),
                "report": report,
            }
        )

    valid_reports = [item["report"] for item in reports]
    reviewed = sum(
        item.get("reviewStatus") in {"REVIEWED", "DOUBLE_REVIEWED", "ADJUDICATED"}
        and item.get("segmentCount", 0) > 0
        for item in valid_reports
    )
    double_reviewed = sum(
        item.get("reviewStatus") in {"DOUBLE_REVIEWED", "ADJUDICATED"}
        and item.get("segmentCount", 0) > 0
        for item in valid_reports
    )
    required_double_review_tasks = max(1, math.ceil(len(selected_tasks(queue)) * 0.15))
    return {
        "taskCount": len(selected_tasks(queue)),
        "missingTaskIds": missing,
        "reports": reports,
        "reviewedTaskCount": reviewed,
        "doubleReviewedTaskCount": double_reviewed,
        "minimumDoubleReviewedTaskCount": required_double_review_tasks,
    }


def audit_rights(queue: Dict[str, Any], rights: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    tasks = selected_tasks(queue)
    rows = rights.get("rows", []) if rights else []
    approved = {
        "approved",
        "cleared",
        "passed",
    }
    row_by_task = {row.get("taskId"): row for row in rows if isinstance(row, dict)}
    missing = [task["taskId"] for task in tasks if task["taskId"] not in row_by_task]
    uncleared = [
        task_id
        for task_id, row in row_by_task.items()
        if row.get("rightsStatus") not in approved
        or not row.get("licenseOrPermissionEvidence")
    ]
    return {
        "ledgerPresent": rights is not None,
        "rowCount": len(rows),
        "missingTaskIds": missing,
        "unclearedTaskIds": uncleared,
        "status": rights.get("status") if rights else None,
    }


def audit_split(queue: Dict[str, Any], split: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    tasks = selected_tasks(queue)
    rows = split.get("rows", []) if split else []
    row_by_task = {row.get("taskId"): row for row in rows if isinstance(row, dict)}
    missing = [task["taskId"] for task in tasks if task["taskId"] not in row_by_task]
    quarantine_ok = bool(split) and not missing and all(
        row.get("assignedSplit") in {"diagnostic_regression", "regression", "development"}
        for row in row_by_task.values()
    )
    promotion_ready = quarantine_ok and all(
        row.get("leakageReviewStatus") == "PASSED"
        and row.get("promotionStatus") == "PROMOTABLE"
        for row in row_by_task.values()
    )
    return {
        "ledgerPresent": split is not None,
        "rowCount": len(rows),
        "missingTaskIds": missing,
        "quarantineReady": quarantine_ok,
        "promotionReady": promotion_ready,
        "status": split.get("status") if split else None,
    }


def audit_baseline(baseline: Optional[Dict[str, Any]], queue: Dict[str, Any]) -> Dict[str, Any]:
    if baseline is None:
        return {
            "ledgerPresent": False,
            "status": "MISSING",
            "cacheOnly": False,
            "passed": False,
            "resultCount": 0,
            "metricContractValid": False,
            "resultContractReady": False,
            "blockingReasons": ["baseline evaluation ledger is missing"],
        }
    results = baseline.get("results")
    contract = baseline.get("metricContract")
    contract_errors = validate_metric_contract(contract)
    result_errors: List[str] = []
    condition_specs = {
        item.get("id"): item
        for item in (contract.get("conditionSlices", []) if isinstance(contract, dict) else [])
        if isinstance(item, dict) and isinstance(item.get("id"), str)
    }
    if isinstance(results, list):
        required_result_fields = {
            "sessionId",
            "goldLabelVersion",
            "uem",
            "hypothesis",
            "protocol",
            "main",
            "overlapExcludedControl",
            "conditionSlices",
            "denominators",
        }
        required_main_fields = {
            "der",
            "jer",
            "false_alarm",
            "miss",
            "confusion",
            "reference_speaker_time",
        }
        for index, result in enumerate(results):
            if not isinstance(result, dict):
                result_errors.append(f"result[{index}] must be an object")
                continue
            missing = sorted(required_result_fields - set(result))
            if missing:
                result_errors.append(f"result[{index}] missing: {', '.join(missing)}")
            main = result.get("main")
            if isinstance(main, dict):
                missing_main = sorted(required_main_fields - set(main))
                if missing_main:
                    result_errors.append(
                        f"result[{index}].main missing: {', '.join(missing_main)}"
                    )
                for field in ("der", "jer"):
                    if main.get(field) is None:
                        result_errors.append(f"result[{index}].main.{field} must be a number")
                reference_time = main.get("reference_speaker_time")
                if not isinstance(reference_time, (int, float)) or reference_time <= 0:
                    result_errors.append(
                        f"result[{index}].main.reference_speaker_time must be positive"
                    )
            else:
                result_errors.append(f"result[{index}].main must be an object")
            protocol = result.get("protocol")
            if not isinstance(protocol, dict) or protocol.get("metricContractVersion") != METRIC_CONTRACT_VERSION:
                result_errors.append(f"result[{index}].protocol must identify {METRIC_CONTRACT_VERSION}")
            elif protocol.get("skipOverlap") is not False:
                result_errors.append(f"result[{index}].protocol.skipOverlap must be false for main score")
            condition_slices = result.get("conditionSlices")
            if not isinstance(condition_slices, dict):
                result_errors.append(f"result[{index}].conditionSlices must be an object")
            else:
                for condition, spec in condition_specs.items():
                    item = condition_slices.get(condition)
                    if not isinstance(item, dict):
                        result_errors.append(f"result[{index}].conditionSlices missing: {condition}")
                        continue
                    status = item.get("status")
                    if status == "NOT_OBSERVED":
                        if not item.get("reason"):
                            result_errors.append(
                                f"result[{index}].conditionSlices.{condition} NOT_OBSERVED needs reason"
                            )
                    elif status == "OBSERVED":
                        metrics = item.get("metrics")
                        if not isinstance(metrics, dict):
                            result_errors.append(
                                f"result[{index}].conditionSlices.{condition}.metrics must be an object"
                            )
                            continue
                        for metric_id in spec.get("requiredMetrics", []):
                            if metric_id not in metrics or metrics.get(metric_id) is None:
                                result_errors.append(
                                    f"result[{index}].conditionSlices.{condition}.{metric_id} must be present"
                                )
                    else:
                        result_errors.append(
                            f"result[{index}].conditionSlices.{condition} status must be OBSERVED or NOT_OBSERVED"
                        )

    metric_contract_valid = (
        baseline.get("metricContractVersion") == METRIC_CONTRACT_VERSION
        and not contract_errors
    )
    result_contract_ready = bool(results) and not result_errors
    passed = (
        baseline.get("status") == "PASS"
        and result_contract_ready
        and baseline.get("goldSource") == "diarization-labels.v1"
        and baseline.get("queueSchemaVersion") == queue.get("schemaVersion")
        and baseline.get("noInventedGold") is True
        and metric_contract_valid
    )
    blocking_reasons = []
    if not metric_contract_valid:
        blocking_reasons.append("metric contract v2 is missing or invalid")
        blocking_reasons.extend(contract_errors)
    if not result_contract_ready:
        blocking_reasons.append("DER/JER pilot result records are missing or incomplete")
        blocking_reasons.extend(result_errors)
    if baseline.get("status") != "PASS":
        blocking_reasons.append("human-gold baseline evaluation has not passed")
    return {
        "ledgerPresent": True,
        "status": baseline.get("status"),
        "cacheOnly": baseline.get("evaluationMode") == "cache_only_until_gold_labels_exist",
        "passed": passed,
        "resultCount": len(results) if isinstance(results, list) else 0,
        "metricContractVersion": baseline.get("metricContractVersion"),
        "metricContractValid": metric_contract_valid,
        "metricContractErrors": contract_errors,
        "resultContractReady": result_contract_ready,
        "resultContractErrors": result_errors,
        "blockingReasons": blocking_reasons,
    }


def audit_windows(queue: Dict[str, Any], windows: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    tasks = selected_tasks(queue)
    rows = windows.get("windows", []) if windows else []
    by_task: Dict[str, List[Dict[str, Any]]] = {}
    for row in rows:
        if isinstance(row, dict):
            by_task.setdefault(row.get("taskId"), []).append(row)
    task_results: List[Dict[str, Any]] = []
    for task in tasks:
        task_rows = sorted(by_task.get(task["taskId"], []), key=lambda row: row.get("startSec", 0))
        duration = float(task["source"]["durationSec"])
        gaps = 0
        covered = 0.0
        previous_end = 0.0
        for row in task_rows:
            start = float(row.get("startSec", -1))
            end = float(row.get("endSec", -1))
            if abs(start - previous_end) > 0.01:
                gaps += 1
            if end <= start:
                gaps += 1
            covered += max(0.0, end - start)
            previous_end = end
        complete = bool(task_rows) and abs(previous_end - duration) <= 0.25 and gaps == 0
        task_results.append(
            {
                "taskId": task["taskId"],
                "windowCount": len(task_rows),
                "coveredSec": round(covered, 3),
                "sourceDurationSec": duration,
                "gapCount": gaps,
                "complete": complete,
            }
        )
    return {
        "ledgerPresent": windows is not None,
        "windowCount": len(rows),
        "allSelectedSourcesCovered": bool(task_results) and all(row["complete"] for row in task_results),
        "tasks": task_results,
    }


def build_report(
    queue_path: Path,
    labels_dir: Path,
    rights_path: Path,
    split_path: Path,
    baseline_path: Path,
    windows_path: Path,
) -> Dict[str, Any]:
    queue = load_json(queue_path)
    if queue is None:
        raise FileNotFoundError(f"queue not found: {queue_path}")
    if queue.get("schemaVersion") != "diarization-pilot-queue.v1":
        raise ValueError("unexpected queue schemaVersion")

    validator = load_validator()
    label_audit = audit_labels(queue, labels_dir, queue_path, validator)
    rights = audit_rights(queue, load_json(rights_path))
    split = audit_split(queue, load_json(split_path))
    baseline = audit_baseline(load_json(baseline_path), queue)
    windows = audit_windows(queue, load_json(windows_path))

    labels_pass = (
        not label_audit["missingTaskIds"]
        and label_audit["reviewedTaskCount"] == label_audit["taskCount"]
        and all(item["report"].get("ok") for item in label_audit["reports"])
    )
    double_pass = (
        label_audit["doubleReviewedTaskCount"] >= label_audit["minimumDoubleReviewedTaskCount"]
    )
    rights_pass = (
        rights["ledgerPresent"]
        and not rights["missingTaskIds"]
        and not rights["unclearedTaskIds"]
        and rights["status"] == "APPROVED"
    )
    split_promotion_pass = split["promotionReady"]
    baseline_pass = baseline["passed"]

    gates = [
        gate(
            "queue_intake",
            "PASS"
            if queue.get("status") == "READY_FOR_HUMAN_REVIEW" and windows["allSelectedSourcesCovered"]
            else "PENDING",
            {
                "selectedSourceHours": queue.get("pilotTarget", {}).get("selectedSourceHours"),
                "selectedSourceCount": queue.get("pilotTarget", {}).get("selectedSourceCount"),
                "reviewWindows": windows,
            },
            []
            if queue.get("status") == "READY_FOR_HUMAN_REVIEW" and windows["allSelectedSourcesCovered"]
            else ["queue 또는 연속 review window가 준비되지 않음"],
        ),
        gate(
            "human_diarization_labels",
            "PASS" if labels_pass else "PENDING",
            {
                "taskCount": label_audit["taskCount"],
                "reviewedTaskCount": label_audit["reviewedTaskCount"],
                "missingTaskIds": label_audit["missingTaskIds"],
            },
            [] if labels_pass else ["사람의 구간 라벨과 validator 통과가 필요"],
        ),
        gate(
            "independent_double_review",
            "PASS" if double_pass else "PENDING",
            {
                "doubleReviewedTaskCount": label_audit["doubleReviewedTaskCount"],
                "minimumDoubleReviewedTaskCount": label_audit["minimumDoubleReviewedTaskCount"],
            },
            [] if double_pass else ["전체의 15-20% 이상 독립 이중검수와 고위험 구간 검수가 필요"],
        ),
        gate(
            "rights_gate",
            "PASS" if rights_pass else "PENDING",
            rights,
            [] if rights_pass else ["각 출처의 학습 사용권한·범위·증거가 필요"],
        ),
        gate(
            "leakage_safe_split",
            "PASS" if split_promotion_pass else ("PASS_QUARANTINE" if split["quarantineReady"] else "PENDING"),
            split,
            [] if split_promotion_pass else ["train/dev/sealed 승격 전 lineage와 독립 split 검토가 필요"],
        ),
        gate(
            "baseline_evaluation",
            "PASS" if baseline_pass else "PENDING",
            baseline,
            []
            if baseline_pass
            else [
                "검증된 human gold와 DER/JER 기준모델 결과가 필요",
                *baseline.get("blockingReasons", []),
            ],
        ),
    ]
    promotion_ready = all(item["status"] == "PASS" for item in gates)
    return {
        "schemaVersion": "diarization-pilot-gate-report.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "overallStatus": "READY_FOR_GOLD_PROMOTION" if promotion_ready else "NOT_READY",
        "promotionReady": promotion_ready,
        "queuePath": str(queue_path.relative_to(REPO_ROOT)),
        "labelsDir": str(labels_dir.relative_to(REPO_ROOT)),
        "gates": gates,
        "labelAudit": label_audit,
        "rightsAudit": rights,
        "splitAudit": split,
        "baselineAudit": baseline,
        "reviewWindowAudit": windows,
    }


def parse_args(argv: Iterable[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--queue", type=Path, default=DEFAULT_QUEUE)
    parser.add_argument("--labels-dir", type=Path, default=DEFAULT_LABELS)
    parser.add_argument("--rights", type=Path, default=DEFAULT_RIGHTS)
    parser.add_argument("--split", type=Path, default=DEFAULT_SPLIT)
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--windows", type=Path, default=DEFAULT_WINDOWS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    return parser.parse_args(list(argv))


def main(argv: Iterable[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    paths = {
        name: repo_path(path)
        for name, path in {
            "queue": args.queue,
            "labels": args.labels_dir,
            "rights": args.rights,
            "split": args.split,
            "baseline": args.baseline,
            "windows": args.windows,
            "output": args.output,
        }.items()
    }
    try:
        report = build_report(
            paths["queue"],
            paths["labels"],
            paths["rights"],
            paths["split"],
            paths["baseline"],
            paths["windows"],
        )
        paths["output"].parent.mkdir(parents=True, exist_ok=True)
        with paths["output"].open("w", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
    except (OSError, ValueError, json.JSONDecodeError, RuntimeError) as exc:
        print(f"pilot gate audit failed: {exc}", file=sys.stderr)
        return 1

    print(
        json.dumps(
            {
                "output": str(paths["output"]),
                "overallStatus": report["overallStatus"],
                "promotionReady": report["promotionReady"],
                "gates": [{"name": item["name"], "status": item["status"]} for item in report["gates"]],
            },
            ensure_ascii=False,
        )
    )
    return 0 if report["promotionReady"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
