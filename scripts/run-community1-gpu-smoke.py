#!/usr/bin/env python3
"""Prepare or execute one tightly bounded Community-1 GPU smoke run.

The default mode is local/read-only with respect to GCP.  ``--execute`` is an
explicit paid-operation gate: it uploads one temporary analysis derivative and
the immutable runner, temporarily adds one L4 to the existing Faith model-lab
job, executes once with no retries, downloads the result, and restores the
job's original CPU/memory/timeout limits in a ``finally`` block.

This script never creates a server, VM, Cloud Run job, training label, or gold
annotation.  The model hypothesis is only input to the human-review queue.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List


REPO_ROOT = Path(__file__).resolve().parents[1]
QA_ROOT = (
    REPO_ROOT
    / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa"
)
QUEUE_PATH = QA_ROOT / "diarization-pilot-queue.v1.json"
PLAN_PATH = QA_ROOT / "preannotations/community1-gpu-smoke-plan.v1.json"
RUNNER_PATH = REPO_ROOT / "experiments/speech-model-lab/community1/run.py"
HYPOTHESES_DIR = QA_ROOT / "hypotheses"

PROJECT = "project-e80b5533-27b9-4476-9a4"
REGION = "asia-southeast1"
JOB = "faith-community1-cpu"
EXPECTED_SERVICE_ACCOUNT = (
    "faith-speech-model-lab@project-e80b5533-27b9-4476-9a4.iam.gserviceaccount.com"
)
EXPECTED_IMAGE = (
    "asia-southeast1-docker.pkg.dev/project-e80b5533-27b9-4476-9a4/"
    "faith-speech-model-lab/community1:pyannote-4.0.7-r2"
)
BUCKET = "faith-speech-model-lab-e80b5533-27b9-4476-9a4"
MODEL_URI = f"gs://{BUCKET}/models/community1-3533c8cf.tar.gz"
MODEL_REVISION = "3533c8cf8e369892e6b79ff1bf80f7b0286a54ee"

TASK_ID = "PILOT-001"
SOURCE_OFFSET_SEC = 5565.0  # 01:32:45; puts the reported 01:37:45 event at center.
WINDOW_DURATION_SEC = 600.0
TASK_TIMEOUT_SEC = 900
GPU_HOURLY_ESTIMATE_USD = 1.05
MAX_ESTIMATED_RUN_USD = round(TASK_TIMEOUT_SEC * GPU_HOURLY_ESTIMATE_USD / 3600, 4)
RECOMMENDED_APPROVAL_CAP_USD = 0.35


def run(command: List[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=capture,
    )


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
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


def source_task() -> Dict[str, Any]:
    queue = load_json(QUEUE_PATH)
    matches = [task for task in queue.get("tasks", []) if task.get("taskId") == TASK_ID]
    if len(matches) != 1:
        raise RuntimeError(f"expected exactly one {TASK_ID} task, found {len(matches)}")
    return matches[0]


def source_path(task: Dict[str, Any]) -> Path:
    path = Path(str((task.get("source") or {}).get("path") or ""))
    return path if path.is_absolute() else REPO_ROOT / path


def make_clip(source: Path, target: Path) -> None:
    run(
        [
            "ffmpeg",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{SOURCE_OFFSET_SEC:.3f}",
            "-i",
            str(source),
            "-t",
            f"{WINDOW_DURATION_SEC:.3f}",
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(target),
        ]
    )


def probe_duration(path: Path) -> float:
    completed = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(path),
        ],
        capture=True,
    )
    return float(completed.stdout.strip())


def validate_source(task: Dict[str, Any]) -> Path:
    source = task.get("source") or {}
    path = source_path(task)
    if not path.is_file():
        raise FileNotFoundError(path)
    expected_bytes = int(source.get("bytes") or 0)
    if expected_bytes and path.stat().st_size != expected_bytes:
        raise RuntimeError("source byte count changed")
    expected_sha256 = str(source.get("sha256") or "")
    actual_sha256 = sha256_file(path)
    if not expected_sha256 or actual_sha256 != expected_sha256:
        raise RuntimeError("source SHA-256 does not match the intake ledger")
    source_duration = float(source.get("durationSec") or 0)
    if SOURCE_OFFSET_SEC + WINDOW_DURATION_SEC > source_duration + 0.1:
        raise RuntimeError("requested smoke window exceeds the source duration")
    return path


def new_plan() -> Dict[str, Any]:
    task = source_task()
    source = task.get("source") or {}
    source_file = validate_source(task)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    run_id = f"{timestamp}-pilot001-window013-community1-l4-r5"
    runner_sha256 = sha256_file(RUNNER_PATH)
    runner_uri = f"gs://{BUCKET}/runners/community1-r5-{runner_sha256[:12]}.py"
    with tempfile.TemporaryDirectory(prefix="faith-community1-smoke-preflight-") as temp:
        clip = Path(temp) / "pilot001-window013.wav"
        make_clip(source_file, clip)
        clip_duration = probe_duration(clip)
        if not math.isclose(clip_duration, WINDOW_DURATION_SEC, abs_tol=0.05):
            raise RuntimeError(f"unexpected clip duration: {clip_duration}")
        clip_sha256 = sha256_file(clip)
        clip_bytes = clip.stat().st_size

    input_uri = f"gs://{BUCKET}/fixtures/pilot/{run_id}.wav"
    output_uri = f"gs://{BUCKET}/results/{run_id}.json"
    return {
        "schemaVersion": 1,
        "status": "PREPARED_NOT_EXECUTED",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "Community-1 hard-condition baseline before human review",
        "scope": {
            "project": PROJECT,
            "region": REGION,
            "existingJob": JOB,
            "createsNewComputeResource": False,
            "touchesActiveFaithAnalysisWorker": False,
            "executionScriptPath": str(Path(__file__).resolve().relative_to(REPO_ROOT)),
            "executionScriptSha256": sha256_file(Path(__file__).resolve()),
        },
        "model": {
            "id": "pyannote/speaker-diarization-community-1",
            "revision": MODEL_REVISION,
            "runnerPath": str(RUNNER_PATH.relative_to(REPO_ROOT)),
            "runnerSha256": runner_sha256,
            "runnerUri": runner_uri,
            "mainOutput": "speaker_diarization",
            "derivedOutput": "exclusive_speaker_diarization",
        },
        "input": {
            "taskId": task.get("taskId"),
            "sessionId": task.get("sessionId"),
            "sourcePath": str(source_file.relative_to(REPO_ROOT)),
            "sourcePageUrl": source.get("sourcePageUrl"),
            "sourceSha256": source.get("sha256"),
            "sourceDurationSec": source.get("durationSec"),
            "offsetSec": SOURCE_OFFSET_SEC,
            "offsetText": "01:32:45",
            "durationSec": WINDOW_DURATION_SEC,
            "endText": "01:42:45",
            "reportedEventSec": 5865.0,
            "reportedEventText": "01:37:45",
            "clipSha256": clip_sha256,
            "clipBytes": clip_bytes,
            "cloudUri": input_uri,
        },
        "output": {
            "runId": run_id,
            "cloudUri": output_uri,
            "localHypothesisPath": str(
                (HYPOTHESES_DIR / "SESSION_PILOT_001.community1.v2.json").relative_to(
                    REPO_ROOT
                )
            ),
            "goldPromotion": False,
            "requiresHumanReview": True,
        },
        "runtimeGuard": {
            "accelerator": "1x NVIDIA L4 24GB",
            "cpu": 4,
            "memory": "16Gi",
            "taskTimeoutSec": TASK_TIMEOUT_SEC,
            "maxRetries": 0,
            "hourlyEstimateUsd": GPU_HOURLY_ESTIMATE_USD,
            "timeoutUpperBoundUsd": MAX_ESTIMATED_RUN_USD,
            "recommendedApprovalCapUsd": RECOMMENDED_APPROVAL_CAP_USD,
            "scaleToZeroAfterExecution": True,
            "restoreExistingJobResources": True,
        },
        "approval": {
            "requiredBeforeExecute": True,
            "approved": False,
        },
    }


def describe_job() -> Dict[str, Any]:
    completed = run(
        [
            "gcloud",
            "run",
            "jobs",
            "describe",
            JOB,
            f"--region={REGION}",
            f"--project={PROJECT}",
            "--format=json",
        ],
        capture=True,
    )
    return json.loads(completed.stdout)


def validate_existing_job(job: Dict[str, Any]) -> Dict[str, Any]:
    task_spec = job["spec"]["template"]["spec"]["template"]["spec"]
    container = task_spec["containers"][0]
    if task_spec.get("serviceAccountName") != EXPECTED_SERVICE_ACCOUNT:
        raise RuntimeError("existing job service account changed; refusing mutation")
    if container.get("image") != EXPECTED_IMAGE:
        raise RuntimeError("existing job image changed; refusing mutation")
    limits = container.get("resources", {}).get("limits", {})
    return {
        "cpu": str(limits.get("cpu")),
        "memory": str(limits.get("memory")),
        "gpu": str(limits.get("nvidia.com/gpu") or "0"),
        "timeoutSec": int(task_spec.get("timeoutSeconds")),
        "maxRetries": int(task_spec.get("maxRetries", 0)),
    }


def update_job_for_gpu() -> None:
    run(
        [
            "gcloud",
            "run",
            "jobs",
            "update",
            JOB,
            f"--region={REGION}",
            f"--project={PROJECT}",
            "--gpu=1",
            "--gpu-type=nvidia-l4",
            "--no-gpu-zonal-redundancy",
            "--cpu=4",
            "--memory=16Gi",
            f"--task-timeout={TASK_TIMEOUT_SEC}s",
            "--max-retries=0",
            "--quiet",
        ]
    )


def restore_job(original: Dict[str, Any]) -> None:
    last_error: Exception | None = None
    for _ in range(3):
        try:
            run(
                [
                    "gcloud",
                    "run",
                    "jobs",
                    "update",
                    JOB,
                    f"--region={REGION}",
                    f"--project={PROJECT}",
                    "--gpu=0",
                    f"--cpu={original['cpu']}",
                    f"--memory={original['memory']}",
                    f"--task-timeout={original['timeoutSec']}s",
                    f"--max-retries={original['maxRetries']}",
                    "--quiet",
                ]
            )
            restored = validate_existing_job(describe_job())
            if restored == original:
                return
            last_error = RuntimeError(f"restored job limits do not match: {restored}")
        except Exception as exc:
            last_error = exc
    raise RuntimeError("failed to restore and verify the existing Faith job") from last_error


def execute(plan: Dict[str, Any], approved_cap_usd: float) -> None:
    if plan.get("status") != "PREPARED_NOT_EXECUTED":
        raise RuntimeError("plan is not in PREPARED_NOT_EXECUTED state")
    if sha256_file(Path(__file__).resolve()) != (plan.get("scope") or {}).get(
        "executionScriptSha256"
    ):
        raise RuntimeError("execution script hash differs from the approved plan")
    upper_bound = float(plan["runtimeGuard"]["timeoutUpperBoundUsd"])
    if not math.isfinite(approved_cap_usd) or approved_cap_usd < 0:
        raise RuntimeError("approved cap must be a finite non-negative number")
    if approved_cap_usd < upper_bound:
        raise RuntimeError(
            f"approved cap ${approved_cap_usd:.2f} is below timeout upper bound ${upper_bound:.2f}"
        )
    if approved_cap_usd > RECOMMENDED_APPROVAL_CAP_USD:
        raise RuntimeError(
            f"approved cap exceeds the prepared safety cap ${RECOMMENDED_APPROVAL_CAP_USD:.2f}"
        )

    task = source_task()
    source_file = validate_source(task)
    current_job = describe_job()
    original = validate_existing_job(current_job)
    if original != {
        "cpu": "8",
        "memory": "32Gi",
        "gpu": "0",
        "timeoutSec": 1800,
        "maxRetries": 0,
    }:
        raise RuntimeError(f"existing job limits changed; refusing mutation: {original}")

    input_spec = plan["input"]
    output_spec = plan["output"]
    runner_uri = plan["model"]["runnerUri"]
    if sha256_file(RUNNER_PATH) != plan["model"].get("runnerSha256"):
        raise RuntimeError("local runner hash differs from the approved plan")
    with tempfile.TemporaryDirectory(prefix="faith-community1-smoke-execute-") as temp:
        clip = Path(temp) / "pilot001-window013.wav"
        make_clip(source_file, clip)
        if sha256_file(clip) != input_spec["clipSha256"]:
            raise RuntimeError("regenerated clip hash differs from prepared plan")

        run(["gcloud", "storage", "cp", str(RUNNER_PATH), runner_uri])
        run(["gcloud", "storage", "cp", str(clip), input_spec["cloudUri"]])

        update_attempted = False
        execution_error: Exception | None = None
        restoration_error: Exception | None = None
        try:
            update_attempted = True
            update_job_for_gpu()
            environment = {
                "INPUT_AUDIO_URI": input_spec["cloudUri"],
                "INPUT_AUDIO_SHA256": input_spec["clipSha256"],
                "MODEL_ARCHIVE_URI": MODEL_URI,
                "OUTPUT_JSON_URI": output_spec["cloudUri"],
                "RUN_ID": output_spec["runId"],
                "SESSION_ID": input_spec["sessionId"],
                "FIXTURE_ID": "PILOT-001-window-013",
                "SOURCE_SHA256": input_spec["sourceSha256"],
                "SOURCE_OFFSET_SEC": str(input_spec["offsetSec"]),
                "SOURCE_DURATION_SEC": str(input_spec["sourceDurationSec"]),
                "MIN_SPEAKERS": "1",
                "MAX_SPEAKERS": "20",
                "DEVICE": "cuda",
                "HOURLY_USD": str(GPU_HOURLY_ESTIMATE_USD),
                "CLOUD_RUN_REGION": REGION,
                "MACHINE_TYPE": "4-vcpu-16GiB-1xL4",
                "RUNNER_URI": runner_uri,
            }
            env_arg = ",".join(f"{key}={value}" for key, value in environment.items())
            run(
                [
                    "gcloud",
                    "run",
                    "jobs",
                    "execute",
                    JOB,
                    f"--region={REGION}",
                    f"--project={PROJECT}",
                    f"--task-timeout={TASK_TIMEOUT_SEC}s",
                    f"--update-env-vars={env_arg}",
                    "--wait",
                    "--quiet",
                ]
            )
        except Exception as exc:  # restoration must run before surfacing the error
            execution_error = exc
        finally:
            if update_attempted:
                try:
                    current = validate_existing_job(describe_job())
                    if current != original:
                        restore_job(original)
                except Exception as exc:
                    try:
                        # A failed status read cannot prove that the GPU update
                        # was atomic.  Restore unconditionally rather than
                        # leaving a potentially billable job configuration.
                        restore_job(original)
                    except Exception as restore_exc:
                        restoration_error = RuntimeError(
                            f"status check failed ({exc}); restore also failed"
                        )
                        restoration_error.__cause__ = restore_exc
        if restoration_error is not None:
            raise RuntimeError(
                "GPU execution cleanup could not verify restoration of the existing Faith job"
            ) from restoration_error
        if execution_error is not None:
            raise execution_error

        hypothesis_path = REPO_ROOT / output_spec["localHypothesisPath"]
        hypothesis_path.parent.mkdir(parents=True, exist_ok=True)
        run(["gcloud", "storage", "cp", output_spec["cloudUri"], str(hypothesis_path)])
        hypothesis = load_json(hypothesis_path)
        if hypothesis.get("schemaVersion") != 2:
            raise RuntimeError("downloaded hypothesis is not schemaVersion 2")
        if hypothesis.get("sessionId") != input_spec["sessionId"]:
            raise RuntimeError("downloaded hypothesis sessionId mismatch")
        source_window = (hypothesis.get("source") or {}).get("sourceWindow") or {}
        if not source_window.get("timestampsUseOriginalTimeline"):
            raise RuntimeError("downloaded hypothesis lost the original timeline contract")

    plan["status"] = "EXECUTED_HYPOTHESIS_PENDING_HUMAN_REVIEW"
    plan["executedAt"] = datetime.now(timezone.utc).isoformat()
    plan["approval"] = {
        "requiredBeforeExecute": True,
        "approved": True,
        "approvedCapUsd": approved_cap_usd,
    }
    write_json(PLAN_PATH, plan)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--execute",
        action="store_true",
        help="perform the paid GCP run; absent means local preparation only",
    )
    parser.add_argument(
        "--approved-cap-usd",
        type=float,
        help="required with --execute; must be within the prepared safety cap",
    )
    parser.add_argument(
        "--replace-plan",
        action="store_true",
        help="replace an existing completed plan; never implied by preparation",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.execute:
        if args.approved_cap_usd is None:
            raise RuntimeError("--approved-cap-usd is required with --execute")
        plan = load_json(PLAN_PATH)
        execute(plan, args.approved_cap_usd)
        print(json.dumps({"status": "executed", "plan": str(PLAN_PATH)}, ensure_ascii=False))
        return

    if PLAN_PATH.is_file() and not args.replace_plan:
        existing = load_json(PLAN_PATH)
        if existing.get("status") != "PREPARED_NOT_EXECUTED":
            raise RuntimeError("existing plan is completed; use --replace-plan intentionally")
    plan = new_plan()
    write_json(PLAN_PATH, plan)
    print(json.dumps(plan, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
