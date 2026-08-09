#!/usr/bin/env python3
"""Run the full Faith Community-1 baseline on Vast.ai with per-session resume.

The batch manifest points only to local container paths.  Each completed session
is an immutable checkpoint.  Existing outputs are reused only after their model,
source, input, and output contracts pass validation.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MODEL_ID = "pyannote/speaker-diarization-community-1"
MODEL_REVISION = "3533c8cf8e369892e6b79ff1bf80f7b0286a54ee"
DEFAULT_HEARTBEAT_SEC = 30


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def write_json_atomic(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_file(path_text: str, expected_sha256: str, label: str) -> Path:
    path = Path(path_text).expanduser().resolve()
    if not path.is_file():
        raise FileNotFoundError(f"{label} missing: {path}")
    actual = sha256_file(path)
    if actual != expected_sha256:
        raise RuntimeError(f"{label} SHA-256 mismatch: {path}")
    return path


def validate_manifest(manifest: dict[str, Any]) -> None:
    if manifest.get("schemaVersion") != "community1-vast-batch.v1":
        raise ValueError("unsupported batch manifest schema")
    model = manifest.get("model") or {}
    if model.get("id") != MODEL_ID or model.get("revision") != MODEL_REVISION:
        raise ValueError("batch manifest model contract does not match the runner")
    sessions = manifest.get("sessions")
    if not isinstance(sessions, list) or not sessions:
        raise ValueError("batch manifest must contain sessions")
    session_ids = [str(item.get("sessionId") or "") for item in sessions]
    run_ids = [str(item.get("runId") or "") for item in sessions]
    if any(not value for value in session_ids + run_ids):
        raise ValueError("every session needs sessionId and runId")
    if len(set(session_ids)) != len(session_ids) or len(set(run_ids)) != len(run_ids):
        raise ValueError("sessionId and runId must be unique")


def output_is_reusable(path: Path, session: dict[str, Any], model_sha256: str) -> bool:
    if not path.is_file():
        return False
    try:
        result = load_json(path)
    except (OSError, ValueError, json.JSONDecodeError):
        return False
    source = result.get("source") or {}
    model_artifact = result.get("modelArtifact") or {}
    contract = result.get("outputContract") or {}
    regular = (result.get("outputs") or {}).get("regular") or {}
    exclusive = (result.get("outputs") or {}).get("exclusive") or {}
    return all(
        (
            result.get("status") == "completed",
            result.get("model") == MODEL_ID,
            result.get("modelVersion") == MODEL_REVISION,
            result.get("sessionId") == session.get("sessionId"),
            source.get("sourceSha256") == session.get("sourceSha256"),
            source.get("inputAudioSha256") == session.get("inputAudioSha256"),
            model_artifact.get("archiveSha256") == model_sha256,
            contract.get("mainEvaluationOutput") == "speaker_diarization",
            contract.get("overlapInclusiveMain") is True,
            regular.get("outputType") == "speaker_diarization",
            isinstance(regular.get("segments"), list),
            exclusive.get("outputType") == "exclusive_speaker_diarization",
            isinstance(exclusive.get("segments"), list),
        )
    )


def hypothesis_outputs_sha256(path: Path) -> str:
    result = load_json(path)
    body = json.dumps(
        result.get("outputs"),
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(body).hexdigest()


def run_session(
    runner: Path,
    session: dict[str, Any],
    model_archive: Path,
    model_sha256: str,
    output_path: Path,
    log_path: Path,
    heartbeat_path: Path,
    hourly_usd: float,
    timeout_sec: int,
    heartbeat_sec: int,
) -> tuple[int, float]:
    env = os.environ.copy()
    env.update(
        {
            "RUN_ID": str(session["runId"]),
            "SESSION_ID": str(session["sessionId"]),
            "FIXTURE_ID": str(session.get("fixtureId") or session["sessionId"]),
            "INPUT_AUDIO_URI": str(Path(session["inputAudioPath"]).resolve()),
            "INPUT_AUDIO_SHA256": str(session["inputAudioSha256"]),
            "MODEL_ARCHIVE_URI": str(model_archive),
            "MODEL_ARCHIVE_SHA256": model_sha256,
            "OUTPUT_JSON_URI": str(output_path.resolve()),
            "SOURCE_SHA256": str(session["sourceSha256"]),
            "SOURCE_OFFSET_SEC": str(session.get("sourceOffsetSec", 0)),
            "SOURCE_DURATION_SEC": str(session["sourceDurationSec"]),
            "MIN_SPEAKERS": str(session.get("minSpeakers", 1)),
            "MAX_SPEAKERS": str(session.get("maxSpeakers", 20)),
            "DEVICE": "cuda",
            "RANDOM_SEED": str(session.get("randomSeed", 1337)),
            "COMPUTE_PROVIDER": "vast-ai",
            "COMPUTE_REGION": os.getenv("VAST_REGION", "marketplace-host"),
            "MACHINE_TYPE": os.getenv("VAST_MACHINE", "unknown-vast-offer"),
            "HOURLY_USD": str(hourly_usd),
        }
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with log_path.open("a", encoding="utf-8") as log:
        log.write(f"[{utc_now()}] start {session['sessionId']}\n")
        log.flush()
        process = subprocess.Popen(
            [sys.executable, str(runner)],
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
        )
        while process.poll() is None:
            elapsed = time.monotonic() - started
            write_json_atomic(
                heartbeat_path,
                {
                    "status": "running",
                    "sessionId": session["sessionId"],
                    "runId": session["runId"],
                    "updatedAt": utc_now(),
                    "elapsedSec": round(elapsed, 1),
                },
            )
            if elapsed > timeout_sec:
                process.terminate()
                try:
                    process.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                log.write(f"[{utc_now()}] timeout after {timeout_sec}s\n")
                return 124, elapsed
            remaining = max(0.1, timeout_sec - elapsed)
            try:
                process.wait(timeout=min(float(heartbeat_sec), remaining))
            except subprocess.TimeoutExpired:
                pass
        elapsed = time.monotonic() - started
        log.write(f"[{utc_now()}] exit={process.returncode} elapsed={elapsed:.1f}s\n")
        return int(process.returncode or 0), elapsed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--runner", default="/app/run.py")
    parser.add_argument("--output-dir")
    parser.add_argument("--hourly-usd", type=float, required=True)
    parser.add_argument("--session-timeout-sec", type=int, default=7200)
    parser.add_argument("--heartbeat-sec", type=int, default=DEFAULT_HEARTBEAT_SEC)
    parser.add_argument(
        "--skip-canary-repeat",
        action="store_true",
        help="skip the default two-run full-session reproducibility gate",
    )
    args = parser.parse_args()

    if args.hourly_usd <= 0:
        raise ValueError("--hourly-usd must be positive")
    if args.session_timeout_sec < 300:
        raise ValueError("--session-timeout-sec must be at least 300")
    if not 5 <= args.heartbeat_sec <= 60:
        raise ValueError("--heartbeat-sec must be between 5 and 60")

    manifest_path = Path(args.manifest).expanduser().resolve()
    runner = Path(args.runner).expanduser().resolve()
    manifest = load_json(manifest_path)
    validate_manifest(manifest)
    if not runner.is_file():
        raise FileNotFoundError(runner)

    model_spec = manifest["model"]
    model_archive = require_file(
        str(model_spec["archivePath"]),
        str(model_spec["archiveSha256"]),
        "model archive",
    )
    model_sha256 = str(model_spec["archiveSha256"])
    output_dir = Path(
        args.output_dir or manifest.get("outputDir") or "/workspace/faith-community1/output"
    ).expanduser().resolve()
    heartbeat_path = output_dir / "batch-heartbeat.json"
    summary_path = output_dir / "batch-summary.json"

    sessions = manifest["sessions"]
    execution_contract = manifest.get("executionContract") or {}
    canary_session_id = str(execution_contract.get("fullSessionCanary") or "")
    if canary_session_id and sessions[0].get("sessionId") != canary_session_id:
        raise ValueError("the declared full-session canary must be the first session")
    for session in sessions:
        require_file(
            str(session["inputAudioPath"]),
            str(session["inputAudioSha256"]),
            f"{session['sessionId']} input",
        )

    results: list[dict[str, Any]] = []
    if canary_session_id and not args.skip_canary_repeat:
        canary = sessions[0]
        final_canary = output_dir / "hypotheses" / f"{canary_session_id}.community1.v2.json"
        if not output_is_reusable(final_canary, canary, model_sha256):
            repeated_outputs: list[Path] = []
            repeat_results: list[dict[str, Any]] = []
            for repeat in ("a", "b"):
                repeat_output = output_dir / "canary-repeat" / repeat / f"{canary_session_id}.json"
                repeat_log = output_dir / "logs" / f"{canary_session_id}.repeat-{repeat}.log"
                code, elapsed = run_session(
                    runner,
                    canary,
                    model_archive,
                    model_sha256,
                    repeat_output,
                    repeat_log,
                    heartbeat_path,
                    args.hourly_usd,
                    args.session_timeout_sec,
                    args.heartbeat_sec,
                )
                valid = code == 0 and output_is_reusable(
                    repeat_output, canary, model_sha256
                )
                repeat_results.append(
                    {
                        "repeat": repeat,
                        "status": "completed" if valid else "failed",
                        "exitCode": code,
                        "elapsedSec": round(elapsed, 1),
                        "outputPath": str(repeat_output),
                        "outputsSha256": (
                            hypothesis_outputs_sha256(repeat_output) if valid else None
                        ),
                        "logPath": str(repeat_log),
                    }
                )
                if valid:
                    repeated_outputs.append(repeat_output)
            reproducible = (
                len(repeated_outputs) == 2
                and hypothesis_outputs_sha256(repeated_outputs[0])
                == hypothesis_outputs_sha256(repeated_outputs[1])
            )
            if not reproducible:
                summary = {
                    "schemaVersion": "community1-vast-batch-summary.v1",
                    "status": "FAILED_CANARY_REPRODUCIBILITY",
                    "manifestPath": str(manifest_path),
                    "completedAt": utc_now(),
                    "canarySessionId": canary_session_id,
                    "repeatResults": repeat_results,
                    "results": [],
                }
                write_json_atomic(summary_path, summary)
                write_json_atomic(
                    heartbeat_path,
                    {"status": summary["status"], "updatedAt": utc_now()},
                )
                print(json.dumps(summary, ensure_ascii=False))
                return 1
            final_canary.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(repeated_outputs[0], final_canary)

    for index, session in enumerate(sessions, start=1):
        output_path = output_dir / "hypotheses" / f"{session['sessionId']}.community1.v2.json"
        log_path = output_dir / "logs" / f"{session['sessionId']}.log"
        if output_is_reusable(output_path, session, model_sha256):
            results.append(
                {
                    "sessionId": session["sessionId"],
                    "status": "reused",
                    "outputPath": str(output_path),
                    "outputSha256": sha256_file(output_path),
                }
            )
            continue

        code, elapsed = run_session(
            runner,
            session,
            model_archive,
            model_sha256,
            output_path,
            log_path,
            heartbeat_path,
            args.hourly_usd,
            args.session_timeout_sec,
            args.heartbeat_sec,
        )
        reusable = code == 0 and output_is_reusable(output_path, session, model_sha256)
        results.append(
            {
                "sessionId": session["sessionId"],
                "status": "completed" if reusable else "failed",
                "exitCode": code,
                "elapsedSec": round(elapsed, 1),
                "outputPath": str(output_path),
                "outputSha256": sha256_file(output_path) if reusable else None,
                "logPath": str(log_path),
            }
        )
        write_json_atomic(
            summary_path,
            {
                "schemaVersion": "community1-vast-batch-summary.v1",
                "status": "RUNNING",
                "manifestPath": str(manifest_path),
                "completedSessions": index,
                "totalSessions": len(sessions),
                "updatedAt": utc_now(),
                "results": results,
            },
        )
        if index == 1 and canary_session_id and not reusable:
            break

    failed = [item for item in results if item["status"] == "failed"]
    incomplete = len(results) != len(sessions)
    summary = {
        "schemaVersion": "community1-vast-batch-summary.v1",
        "status": "PASS" if not failed and not incomplete else "FAILED",
        "manifestPath": str(manifest_path),
        "manifestSha256": sha256_file(manifest_path),
        "runnerSha256": sha256_file(runner),
        "modelArchiveSha256": model_sha256,
        "completedAt": utc_now(),
        "totalSessions": len(sessions),
        "successfulSessions": len(sessions) - len(failed),
        "failedSessions": len(failed),
        "notRunSessions": len(sessions) - len(results),
        "results": results,
    }
    write_json_atomic(summary_path, summary)
    write_json_atomic(
        heartbeat_path,
        {
            "status": summary["status"],
            "updatedAt": utc_now(),
            "summaryPath": str(summary_path),
        },
    )
    print(json.dumps(summary, ensure_ascii=False))
    return 0 if not failed else 1


if __name__ == "__main__":
    raise SystemExit(main())
