#!/usr/bin/env python3
"""Dependency-free contract test for the Vast.ai Community-1 batch wrapper."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BATCH_RUNNER = REPO_ROOT / "experiments/speech-model-lab/community1/vast_batch.py"
COLLECTOR = REPO_ROOT / "scripts/collect-community1-vast-results.py"


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value), encoding="utf-8")


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="faith-vast-contract-") as temporary:
        root = Path(temporary)
        model = root / "model.tar.gz"
        model.write_bytes(b"model-fixture")
        sessions = []
        for index in (1, 2):
            audio = root / f"input-{index}.flac"
            audio.write_bytes(f"audio-{index}".encode())
            sessions.append(
                {
                    "taskId": f"PILOT-{index:03d}",
                    "sessionId": f"SESSION_PILOT_{index:03d}",
                    "fixtureId": f"pilot-{index:03d}",
                    "runId": f"test-run-{index}",
                    "inputAudioPath": str(audio),
                    "inputAudioSha256": sha256_file(audio),
                    "sourceSha256": hashlib.sha256(f"source-{index}".encode()).hexdigest(),
                    "sourceOffsetSec": 0,
                    "sourceDurationSec": 60,
                    "minSpeakers": 1,
                    "maxSpeakers": 2,
                    "randomSeed": 1337,
                }
            )
        manifest = {
            "schemaVersion": "community1-vast-batch.v1",
            "model": {
                "id": "pyannote/speaker-diarization-community-1",
                "revision": "3533c8cf8e369892e6b79ff1bf80f7b0286a54ee",
                "archivePath": str(model),
                "archiveSha256": sha256_file(model),
            },
            "executionContract": {
                "fullSessionCanary": sessions[0]["sessionId"],
            },
            "sessions": sessions,
        }
        manifest_path = root / "manifest.json"
        write_json(manifest_path, manifest)

        fake_runner = root / "fake_runner.py"
        fake_runner.write_text(
            "import json, os\n"
            "from pathlib import Path\n"
            "segments=[{'startSec':0.0,'endSec':1.0,'speaker':'SPEAKER_00'}]\n"
            "result={'schemaVersion':2,'id':os.environ['RUN_ID'],'status':'completed',"
            "'model':'pyannote/speaker-diarization-community-1',"
            "'modelVersion':'3533c8cf8e369892e6b79ff1bf80f7b0286a54ee',"
            "'sessionId':os.environ['SESSION_ID'],"
            "'source':{'sourceSha256':os.environ['SOURCE_SHA256'],"
            "'inputAudioSha256':os.environ['INPUT_AUDIO_SHA256']},"
            "'modelArtifact':{'archiveSha256':os.environ['MODEL_ARCHIVE_SHA256']},"
            "'outputContract':{'mainEvaluationOutput':'speaker_diarization',"
            "'overlapInclusiveMain':True},"
            "'outputs':{'regular':{'outputType':'speaker_diarization','segments':segments},"
            "'exclusive':{'outputType':'exclusive_speaker_diarization','segments':segments}}}\n"
            "path=Path(os.environ['OUTPUT_JSON_URI']); path.parent.mkdir(parents=True,exist_ok=True)\n"
            "path.write_text(json.dumps(result))\n",
            encoding="utf-8",
        )
        output_dir = root / "output"
        completed = subprocess.run(
            [
                sys.executable,
                str(BATCH_RUNNER),
                "--manifest",
                str(manifest_path),
                "--runner",
                str(fake_runner),
                "--output-dir",
                str(output_dir),
                "--hourly-usd",
                "1.0",
                "--session-timeout-sec",
                "300",
                "--heartbeat-sec",
                "5",
            ],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        summary = json.loads(completed.stdout)
        if summary.get("status") != "PASS" or summary.get("successfulSessions") != 2:
            raise AssertionError(summary)
        repeat_a = output_dir / "canary-repeat/a/SESSION_PILOT_001.json"
        repeat_b = output_dir / "canary-repeat/b/SESSION_PILOT_001.json"
        if not repeat_a.is_file() or not repeat_b.is_file():
            raise AssertionError("full-session canary was not repeated")
        if json.loads(repeat_a.read_text())["outputs"] != json.loads(
            repeat_b.read_text()
        )["outputs"]:
            raise AssertionError("canary outputs differ")
        collected = subprocess.run(
            [
                sys.executable,
                str(COLLECTOR),
                "--manifest",
                str(manifest_path),
                "--results-dir",
                str(output_dir),
            ],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        if json.loads(collected.stdout).get("status") != "PASS":
            raise AssertionError(collected.stdout)

        unstable_runner = root / "unstable_runner.py"
        counter = root / "unstable-counter.txt"
        unstable_runner.write_text(
            fake_runner.read_text(encoding="utf-8").replace(
                "segments=[{'startSec':0.0,'endSec':1.0,'speaker':'SPEAKER_00'}]",
                "counter=Path(" + repr(str(counter)) + "); "
                "attempt=int(counter.read_text())+1 if counter.exists() else 1; "
                "counter.write_text(str(attempt)); "
                "segments=[{'startSec':0.0,'endSec':1.0,'speaker':f'SPEAKER_{attempt:02d}'}]",
            ),
            encoding="utf-8",
        )
        unstable = subprocess.run(
            [
                sys.executable,
                str(BATCH_RUNNER),
                "--manifest",
                str(manifest_path),
                "--runner",
                str(unstable_runner),
                "--output-dir",
                str(root / "unstable-output"),
                "--hourly-usd",
                "1.0",
                "--session-timeout-sec",
                "300",
                "--heartbeat-sec",
                "5",
            ],
            cwd=REPO_ROOT,
            text=True,
            capture_output=True,
        )
        if unstable.returncode != 1:
            raise AssertionError("unstable canary unexpectedly passed")
        if json.loads(unstable.stdout).get("status") != "FAILED_CANARY_REPRODUCIBILITY":
            raise AssertionError(unstable.stdout)
        print("community1 Vast.ai contract: PASS")


if __name__ == "__main__":
    main()
