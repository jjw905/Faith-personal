#!/usr/bin/env python3
"""Sweep Sherpa speaker-clustering thresholds on a rented CPU job."""

from __future__ import annotations

import json
import os
import platform
import subprocess
import tarfile
import tempfile
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import sherpa_onnx
from google.cloud import storage


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"missing required environment variable: {name}")
    return value


def split_gs(uri: str) -> tuple[str, str]:
    if not uri.startswith("gs://"):
        raise ValueError(f"expected gs:// URI: {uri}")
    bucket, _, blob = uri[5:].partition("/")
    if not bucket or not blob:
        raise ValueError(f"expected bucket and object: {uri}")
    return bucket, blob


def download(client: storage.Client, uri: str, target: Path) -> None:
    bucket, blob = split_gs(uri)
    target.parent.mkdir(parents=True, exist_ok=True)
    client.bucket(bucket).blob(blob).download_to_filename(target)


def upload_json(client: storage.Client, uri: str, value: dict) -> None:
    bucket, blob = split_gs(uri)
    client.bucket(bucket).blob(blob).upload_from_string(
        json.dumps(value, ensure_ascii=False, indent=2),
        content_type="application/json",
    )


def prepare_audio(source: Path, target: Path) -> tuple[np.ndarray, float]:
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source),
            "-ac",
            "1",
            "-ar",
            "16000",
            str(target),
        ],
        check=True,
    )
    with wave.open(str(target), "rb") as wav:
        frame_count = wav.getnframes()
        sample_rate = wav.getframerate()
        samples = np.frombuffer(wav.readframes(frame_count), dtype=np.int16)
    return samples.astype(np.float32) / 32768.0, frame_count / sample_rate


def diarize(
    samples: np.ndarray,
    segmentation: Path,
    embedding: Path,
    threshold: float,
    threads: int,
) -> list[dict[str, float | str]]:
    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(segmentation)
            ),
            num_threads=threads,
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=str(embedding),
            num_threads=threads,
        ),
        clustering=sherpa_onnx.FastClusteringConfig(
            num_clusters=-1,
            threshold=threshold,
        ),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    if not config.validate():
        raise RuntimeError("invalid Sherpa diarization configuration")
    output = sherpa_onnx.OfflineSpeakerDiarization(config).process(samples)
    return [
        {
            "startSec": round(float(item.start), 3),
            "endSec": round(float(item.end), 3),
            "speaker": f"SPEAKER_{int(item.speaker):02d}",
        }
        for item in output.sort_by_start_time()
    ]


def main() -> None:
    client = storage.Client()
    execution_started = time.monotonic()
    audio_uri = required("INPUT_AUDIO_URI")
    model_uri = required("MODEL_ARCHIVE_URI")
    output_prefix = required("OUTPUT_PREFIX_URI").rstrip("/")
    run_prefix = required("RUN_PREFIX")
    fixture_id = os.getenv("FIXTURE_ID", "ktv-briefing-20251231").strip()
    if not fixture_id:
        raise RuntimeError("FIXTURE_ID must not be empty")
    segmentation_rel = os.getenv(
        "SEGMENTATION_MODEL",
        "sherpa-onnx-pyannote-segmentation-3-0/model.onnx",
    ).strip()
    embedding_rel = os.getenv(
        "EMBEDDING_MODEL",
        "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx",
    ).strip()
    model_label = os.getenv(
        "MODEL_LABEL",
        "sherpa-pyannote-segmentation-3.0+3D-Speaker",
    ).strip()
    thresholds = [
        float(item)
        for item in os.getenv("THRESHOLDS", "0.80;0.825;0.85;0.875;0.90").split(";")
    ]
    threads = int(os.getenv("THREADS", "8"))
    hourly_usd = float(os.getenv("HOURLY_USD", "0.7488"))

    with tempfile.TemporaryDirectory(prefix="faith-sherpa-") as tmp:
        root = Path(tmp)
        audio = root / "input.mp3"
        decoded = root / "input.wav"
        archive = root / "models.tar.gz"
        models = root / "models"
        download(client, audio_uri, audio)
        download(client, model_uri, archive)
        models.mkdir()
        with tarfile.open(archive, "r:gz") as package:
            package.extractall(models, filter="data")
        samples, duration_sec = prepare_audio(audio, decoded)
        segmentation = models / segmentation_rel
        embedding = models / embedding_rel
        if not segmentation.is_file():
            raise RuntimeError(f"segmentation model not found: {segmentation_rel}")
        if not embedding.is_file():
            raise RuntimeError(f"embedding model not found: {embedding_rel}")
        setup_ms = round((time.monotonic() - execution_started) * 1000)

        rows: list[dict] = []
        for threshold in thresholds:
            started = time.monotonic()
            segments = diarize(
                samples,
                segmentation,
                embedding,
                threshold,
                threads,
            )
            wall_ms = round((time.monotonic() - started) * 1000)
            suffix = f"t{round(threshold * 1000):03d}"
            run_id = f"{run_prefix}-sherpa-{suffix}"
            rows.append(
                {
                    "schemaVersion": 1,
                    "id": run_id,
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                    "task": "diarization",
                    "model": model_label,
                    "modelVersion": "sherpa-onnx-1.13.4",
                    "fixtureId": fixture_id,
                    "status": "completed",
                    "diarizationStage": "raw-model",
                    "runtime": {
                        "device": "cpu",
                        "provider": "gcp-cloud-run-job",
                        "region": os.getenv("CLOUD_RUN_REGION", "asia-southeast1"),
                        "machineType": os.getenv("MACHINE_TYPE", "8-vcpu-32GiB"),
                        "wallMs": wall_ms,
                        "setupMs": setup_ms,
                        "threads": threads,
                        "python": platform.python_version(),
                    },
                    "cost": {"estimatedUsd": 0, "paidApi": False},
                    "privacy": {
                        "execution": "rented-cloud-offline",
                        "audioSentExternally": True,
                    },
                    "license": "mixed-open-models",
                    "artifacts": {
                        "diarizationPath": (
                            ".data/stt-bench/model-lab/runs/" + run_id + ".json"
                        ),
                        "cloudOutputUri": output_prefix + "/" + run_id + ".json",
                    },
                    "notes": [
                        f"speaker threshold {threshold:.3f}",
                        f"segmentation model {segmentation_rel}",
                        f"embedding model {embedding_rel}",
                    ],
                    "durationSec": round(duration_sec, 3),
                    "speakerCount": len(
                        set(str(item["speaker"]) for item in segments)
                    ),
                    "segments": segments,
                }
            )

    total_ms = round((time.monotonic() - execution_started) * 1000)
    cost_per_run = total_ms / 1000 / 3600 * hourly_usd / len(rows)
    for row in rows:
        row["cost"]["estimatedUsd"] = round(cost_per_run, 6)
        row["notes"].append(
            f"total sweep {total_ms}ms across {len(rows)} thresholds"
        )
        upload_json(client, row["artifacts"]["cloudOutputUri"], row)
    print(
        json.dumps(
            {
                "status": "completed",
                "totalMs": total_ms,
                "runs": [
                    {
                        "id": row["id"],
                        "wallMs": row["runtime"]["wallMs"],
                        "speakerCount": row["speakerCount"],
                    }
                    for row in rows
                ],
            }
        )
    )


if __name__ == "__main__":
    main()
