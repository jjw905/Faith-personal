#!/usr/bin/env python3
"""Prepare the complete Faith Community-1 Vast.ai baseline bundle.

The default mode verifies every source and writes a plan only.  ``--materialize``
creates temporary lossless audio derivatives and an executable batch manifest;
it requires explicit confirmation that the diagnostic audio will be processed
on an external Vast.ai host.  Nothing in this script promotes data to gold or
training eligibility.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
QA_ROOT = (
    REPO_ROOT
    / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa"
)
DEFAULT_QUEUE = QA_ROOT / "diarization-pilot-queue.v1.json"
DEFAULT_PLAN = QA_ROOT / "preannotations/community1-vast-full-baseline-plan.v1.json"
DEFAULT_BUNDLE = REPO_ROOT / ".data/vast/community1-full-baseline"
DEFAULT_MODEL = REPO_ROOT / ".data/models/community1-3533c8cf.tar.gz"
MODEL_ID = "pyannote/speaker-diarization-community-1"
MODEL_REVISION = "3533c8cf8e369892e6b79ff1bf80f7b0286a54ee"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def write_json(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(body, encoding="utf-8")
    temporary.replace(path)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def absolute(path_text: str) -> Path:
    path = Path(path_text)
    return path if path.is_absolute() else REPO_ROOT / path


def ffprobe_duration(path: Path) -> float:
    completed = subprocess.run(
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
        cwd=REPO_ROOT,
        check=True,
        text=True,
        capture_output=True,
    )
    return float(completed.stdout.strip())


def verify_sources(queue: dict[str, Any]) -> list[dict[str, Any]]:
    tasks = queue.get("tasks")
    if queue.get("schemaVersion") != "diarization-pilot-queue.v1":
        raise ValueError("unsupported queue schema")
    if not isinstance(tasks, list) or not tasks:
        raise ValueError("queue has no tasks")

    rows: list[dict[str, Any]] = []
    for task in tasks:
        source = task.get("source") or {}
        path = absolute(str(source.get("path") or ""))
        if not path.is_file():
            raise FileNotFoundError(path)
        expected_bytes = int(source.get("bytes") or 0)
        if path.stat().st_size != expected_bytes:
            raise RuntimeError(f"{task.get('taskId')}: source byte count changed")
        expected_sha256 = str(source.get("sha256") or "")
        if sha256_file(path) != expected_sha256:
            raise RuntimeError(f"{task.get('taskId')}: source SHA-256 changed")
        expected_duration = float(source.get("durationSec") or 0)
        actual_duration = ffprobe_duration(path)
        if not math.isclose(actual_duration, expected_duration, abs_tol=0.1):
            raise RuntimeError(f"{task.get('taskId')}: source duration changed")
        rows.append(
            {
                "taskId": task["taskId"],
                "sessionId": task["sessionId"],
                "sourceId": task["sourceId"],
                "sourcePath": str(path.relative_to(REPO_ROOT)),
                "sourcePageUrl": source.get("sourcePageUrl"),
                "sourceSha256": expected_sha256,
                "sourceBytes": expected_bytes,
                "sourceDurationSec": round(expected_duration, 3),
                "rightsStatus": (task.get("gates") or {}).get("rightsStatus"),
                "trainingEligible": bool((task.get("gates") or {}).get("trainingEligible")),
            }
        )
    return rows


def materialize_audio(source: Path, target: Path, expected_duration: float) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        actual_duration = ffprobe_duration(target)
        if math.isclose(actual_duration, expected_duration, abs_tol=0.1):
            return
        raise RuntimeError(f"existing derivative duration mismatch: {target}")
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-loglevel",
            "error",
            "-n",
            "-i",
            str(source),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-sample_fmt",
            "s16",
            "-c:a",
            "flac",
            str(target),
        ],
        cwd=REPO_ROOT,
        check=True,
    )
    actual_duration = ffprobe_duration(target)
    if not math.isclose(actual_duration, expected_duration, abs_tol=0.1):
        raise RuntimeError(f"materialized derivative duration mismatch: {target}")


def make_manifest(
    rows: list[dict[str, Any]], bundle: Path, model_sha256: str
) -> dict[str, Any]:
    # A complete short-new-speaker session is the canary, then the remaining
    # sessions run shortest-first.  The batch still covers every selected source.
    ordered = sorted(
        rows,
        key=lambda item: (
            0 if item["sessionId"] == "SESSION_PILOT_006" else 1,
            float(item["sourceDurationSec"]),
        ),
    )
    sessions: list[dict[str, Any]] = []
    for row in ordered:
        name = f"{row['sessionId']}.mono16k.flac"
        local_audio = bundle / "input" / name
        sessions.append(
            {
                "taskId": row["taskId"],
                "sessionId": row["sessionId"],
                "fixtureId": row["taskId"].lower(),
                "runId": f"vast-full-baseline-{row['sessionId'].lower()}",
                "inputAudioPath": f"/workspace/faith-community1/input/{name}",
                "inputAudioSha256": sha256_file(local_audio),
                "sourceSha256": row["sourceSha256"],
                "sourceOffsetSec": 0,
                "sourceDurationSec": row["sourceDurationSec"],
                "minSpeakers": 1,
                "maxSpeakers": 20,
                "randomSeed": 1337,
                "diagnosticOnly": True,
                "trainingEligible": False,
            }
        )
    return {
        "schemaVersion": "community1-vast-batch.v1",
        "createdAt": utc_now(),
        "purpose": "full 7-session Community-1 baseline and human-review preannotation",
        "model": {
            "id": MODEL_ID,
            "revision": MODEL_REVISION,
            "runtime": "pyannote.audio==4.0.7",
            "archivePath": "/workspace/faith-community1/model/community1-3533c8cf.tar.gz",
            "archiveSha256": model_sha256,
        },
        "outputDir": "/workspace/faith-community1/output",
        "executionContract": {
            "provider": "vast-ai",
            "gpuRequired": True,
            "minimumVramGiB": 24,
            "minimumSystemRamGiB": 32,
            "minimumDiskGiB": 50,
            "secureCloudRequired": True,
            "onDemandRequiredForFirstFullRun": True,
            "fullSessionCanary": "SESSION_PILOT_006",
            "repeatFullSessionCanary": 2,
            "requireExactCanonicalOutputsAcrossCanaryRepeats": True,
            "remainingSessionsContinueOnlyAfterValidCanaryArtifact": True,
            "resumeUnit": "session",
            "mainOutput": "speaker_diarization",
            "derivedOutput": "exclusive_speaker_diarization",
            "goldPromotion": False,
        },
        "sessions": sessions,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queue", default=str(DEFAULT_QUEUE))
    parser.add_argument("--model-archive", default=str(DEFAULT_MODEL))
    parser.add_argument("--bundle-dir", default=str(DEFAULT_BUNDLE))
    parser.add_argument("--plan-output", default=str(DEFAULT_PLAN))
    parser.add_argument("--materialize", action="store_true")
    parser.add_argument("--confirm-external-processing", action="store_true")
    args = parser.parse_args()

    queue_path = Path(args.queue).expanduser().resolve()
    model_archive = Path(args.model_archive).expanduser().resolve()
    bundle = Path(args.bundle_dir).expanduser().resolve()
    plan_path = Path(args.plan_output).expanduser().resolve()
    rows = verify_sources(load_json(queue_path))
    if not model_archive.is_file():
        raise FileNotFoundError(f"Community-1 offline archive missing: {model_archive}")
    model_sha256 = sha256_file(model_archive)

    status = "VERIFIED_PLAN_NOT_MATERIALIZED"
    manifest_path: str | None = None
    derivative_bytes = 0
    if args.materialize:
        if not args.confirm_external_processing:
            raise RuntimeError(
                "--materialize requires --confirm-external-processing because the bundle is for Vast.ai"
            )
        input_dir = bundle / "input"
        model_dir = bundle / "model"
        model_dir.mkdir(parents=True, exist_ok=True)
        for row in rows:
            source = absolute(row["sourcePath"])
            target = input_dir / f"{row['sessionId']}.mono16k.flac"
            materialize_audio(source, target, float(row["sourceDurationSec"]))
            derivative_bytes += target.stat().st_size
        bundled_model = model_dir / "community1-3533c8cf.tar.gz"
        if not bundled_model.exists():
            shutil.copy2(model_archive, bundled_model)
        if sha256_file(bundled_model) != model_sha256:
            raise RuntimeError("bundled model archive SHA-256 mismatch")
        manifest = make_manifest(rows, bundle, model_sha256)
        local_manifest = bundle / "batch-manifest.v1.json"
        write_json(local_manifest, manifest)
        manifest_path = str(local_manifest)
        status = "MATERIALIZED_READY_FOR_APPROVED_UPLOAD"

    plan = {
        "schemaVersion": "community1-vast-full-baseline-plan.v1",
        "generatedAt": utc_now(),
        "status": status,
        "purpose": "complete baseline evidence before any Community-1 tuning claim",
        "scope": {
            "sourceCount": len(rows),
            "sourceHours": round(sum(row["sourceDurationSec"] for row in rows) / 3600, 4),
            "sourceBytes": sum(row["sourceBytes"] for row in rows),
            "allSourceHashesVerified": True,
            "humanGoldHours": 0,
            "trainingAllowed": False,
        },
        "model": {
            "id": MODEL_ID,
            "revision": MODEL_REVISION,
            "archivePath": str(model_archive),
            "archiveSha256": model_sha256,
        },
        "vastContract": {
            "secureCloud": True,
            "onDemandForFirstRun": True,
            "minimumVramGiB": 24,
            "minimumSystemRamGiB": 32,
            "minimumDiskGiB": 50,
            "fullSessionCanary": "SESSION_PILOT_006",
            "canaryIsTenMinuteExcerpt": False,
            "repeatFullSessionCanary": 2,
            "requireExactCanonicalOutputsAcrossCanaryRepeats": True,
            "remainingSessionsContinueOnlyAfterValidCanaryArtifact": True,
            "sessionCheckpointAndResume": True,
            "destroyAfterResultsExportedAndVerified": True,
        },
        "bundle": {
            "path": str(bundle),
            "manifestPath": manifest_path,
            "temporaryDerivativeBytes": derivative_bytes,
            "containsOriginalVideo": False,
            "containsLosslessAudioDerivatives": bool(args.materialize),
            "countsAsGoldOrCollectedHours": False,
        },
        "sources": rows,
        "blockingGatesBeforeTraining": [
            "human-reviewed interval gold",
            "15-20 percent independent double review including all high-risk intervals",
            "rights approval for training",
            "leakage-safe train/dev/sealed split",
            "overlap-inclusive Community-1 DER/JER baseline",
            "Community-1 segmentation fine-tuning compatibility proof",
        ],
        "nextAction": (
            "upload the materialized bundle only after reviewing the Vast.ai offer and external-processing approval"
            if args.materialize
            else "materialize temporary lossless derivatives after a Vast.ai Secure Cloud offer and budget are approved"
        ),
    }
    write_json(plan_path, plan)
    print(json.dumps(plan, ensure_ascii=False))


if __name__ == "__main__":
    main()
