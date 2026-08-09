#!/usr/bin/env python3
"""Evaluate SenseVoiceSmall Korean ASR on a rented CPU job."""

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


def prepare_audio(source: Path, target: Path) -> tuple[np.ndarray, int, float]:
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
    return (
        samples.astype(np.float32) / 32768.0,
        sample_rate,
        frame_count / sample_rate,
    )


def find_model_root(root: Path) -> Path:
    matches = list(root.rglob("model.int8.onnx"))
    if len(matches) != 1:
        raise RuntimeError(f"expected one SenseVoice model, found {len(matches)}")
    model_root = matches[0].parent
    if not (model_root / "tokens.txt").is_file():
        raise RuntimeError("SenseVoice tokens.txt not found")
    return model_root


def main() -> None:
    client = storage.Client()
    started = time.monotonic()
    audio_uri = required("INPUT_AUDIO_URI")
    model_uri = required("MODEL_ARCHIVE_URI")
    output_uri = required("OUTPUT_URI")
    run_id = required("RUN_ID")
    fixture_id = required("FIXTURE_ID")
    threads = int(os.getenv("THREADS", "4"))
    chunk_sec = float(os.getenv("CHUNK_SEC", "28"))
    hourly_usd = float(os.getenv("HOURLY_USD", "0.7488"))

    with tempfile.TemporaryDirectory(prefix="faith-sensevoice-") as tmp:
        work = Path(tmp)
        source = work / "input.mp3"
        decoded = work / "input.wav"
        archive = work / "model.tar.bz2"
        models = work / "models"
        download(client, audio_uri, source)
        download(client, model_uri, archive)
        models.mkdir()
        with tarfile.open(archive, "r:bz2") as package:
            package.extractall(models, filter="data")
        model_root = find_model_root(models)
        samples, sample_rate, duration_sec = prepare_audio(source, decoded)
        setup_ms = round((time.monotonic() - started) * 1000)

        recognizer = sherpa_onnx.OfflineRecognizer.from_sense_voice(
            model=str(model_root / "model.int8.onnx"),
            tokens=str(model_root / "tokens.txt"),
            num_threads=threads,
            language="ko",
            use_itn=True,
            debug=False,
        )
        chunk_samples = max(1, round(chunk_sec * sample_rate))
        parts: list[str] = []
        chunk_rows: list[dict] = []
        inference_started = time.monotonic()
        for index, offset in enumerate(range(0, len(samples), chunk_samples)):
            chunk = samples[offset : offset + chunk_samples]
            stream = recognizer.create_stream()
            stream.accept_waveform(sample_rate, chunk)
            recognizer.decode_stream(stream)
            text = stream.result.text.strip()
            if text:
                parts.append(text)
            chunk_rows.append(
                {
                    "index": index,
                    "startSec": round(offset / sample_rate, 3),
                    "endSec": round((offset + len(chunk)) / sample_rate, 3),
                    "text": text,
                }
            )
        inference_ms = round((time.monotonic() - inference_started) * 1000)

    total_ms = round((time.monotonic() - started) * 1000)
    manifest = {
        "schemaVersion": 1,
        "id": run_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "task": "asr",
        "model": "SenseVoiceSmall-int8",
        "modelVersion": "2024-07-17+sherpa-onnx-1.13.4",
        "fixtureId": fixture_id,
        "status": "completed",
        "runtime": {
            "device": "cpu",
            "provider": "gcp-cloud-run-job",
            "region": os.getenv("CLOUD_RUN_REGION", "asia-southeast1"),
            "machineType": os.getenv("MACHINE_TYPE", "8-vcpu-32GiB"),
            "wallMs": inference_ms,
            "setupMs": setup_ms,
            "totalMs": total_ms,
            "threads": threads,
            "python": platform.python_version(),
        },
        "cost": {
            "estimatedUsd": round(total_ms / 1000 / 3600 * hourly_usd, 6),
            "paidApi": False,
        },
        "privacy": {
            "execution": "rented-cloud-offline",
            "audioSentExternally": True,
        },
        "license": "open-source-model-research",
        "artifacts": {
            "transcriptPath": f".data/stt-bench/model-lab/runs/{run_id}.json",
            "cloudOutputUri": output_uri,
        },
        "notes": [
            f"fixed {chunk_sec:g}s chunks; no overlap",
            "Korean language forced; inverse text normalization enabled",
        ],
        "durationSec": round(duration_sec, 3),
        "text": " ".join(parts),
        "chunks": chunk_rows,
    }
    upload_json(client, output_uri, manifest)
    print(
        json.dumps(
            {
                "status": "completed",
                "id": run_id,
                "totalMs": total_ms,
                "inferenceMs": inference_ms,
                "chars": len(manifest["text"]),
                "chunks": len(chunk_rows),
            }
        )
    )


if __name__ == "__main__":
    main()
