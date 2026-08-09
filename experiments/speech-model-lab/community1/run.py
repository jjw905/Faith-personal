#!/usr/bin/env python3
"""Run Community-1 on rented compute and persist one immutable result artifact."""

from __future__ import annotations

import json
import hashlib
import math
import os
import platform
import random
import shutil
import subprocess
import tarfile
import tempfile
import time
import wave
from datetime import datetime, timezone
from importlib.metadata import version as package_version
from pathlib import Path

import numpy as np
import torch
from google.cloud import storage
from pyannote.audio import Pipeline


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


def local_path(uri: str) -> Path:
    return Path(uri[7:] if uri.startswith("file://") else uri).expanduser().resolve()


def download(client: storage.Client | None, uri: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if uri.startswith("gs://"):
        if client is None:
            raise RuntimeError("GCS client is unavailable")
        bucket, blob = split_gs(uri)
        client.bucket(bucket).blob(blob).download_to_filename(target)
        return
    source = local_path(uri)
    if not source.is_file():
        raise FileNotFoundError(source)
    shutil.copy2(source, target)


def upload_json(client: storage.Client | None, uri: str, value: dict) -> None:
    body = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if uri.startswith("gs://"):
        if client is None:
            raise RuntimeError("GCS client is unavailable")
        bucket, blob = split_gs(uri)
        client.bucket(bucket).blob(blob).upload_from_string(
            body,
            content_type="application/json",
        )
        return
    target = local_path(uri)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_text(body, encoding="utf-8")
    temporary.replace(target)


def parse_nonnegative_float(name: str, default: str = "0") -> float:
    raw = os.getenv(name, default).strip()
    try:
        value = float(raw)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be a number: {raw}") from exc
    if not math.isfinite(value) or value < 0:
        raise RuntimeError(f"{name} must be a finite non-negative number: {raw}")
    return value


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_sha256(name: str) -> str:
    value = required(name).lower()
    if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
        raise RuntimeError(f"{name} must be a lowercase SHA-256 hex digest")
    return value


def optional_sha256(name: str) -> str | None:
    value = os.getenv(name, "").strip().lower()
    if not value:
        return None
    if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
        raise RuntimeError(f"{name} must be a lowercase SHA-256 hex digest")
    return value


def seed_runtime(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    if hasattr(torch.backends, "cudnn"):
        torch.backends.cudnn.benchmark = False
        torch.backends.cudnn.deterministic = True


def serialize_annotation(
    annotation: object, source_offset_sec: float = 0.0
) -> list[dict[str, float | str]]:
    return [
        {
            "startSec": round(float(turn.start) + source_offset_sec, 3),
            "endSec": round(float(turn.end) + source_offset_sec, 3),
            "speaker": str(speaker),
        }
        for turn, _, speaker in annotation.itertracks(yield_label=True)
    ]


def serialize_outputs(
    output: object, source_offset_sec: float = 0.0
) -> tuple[list[dict[str, float | str]], list[dict[str, float | str]]]:
    """Preserve overlap-inclusive and exclusive outputs independently.

    Community-1 exposes both outputs.  The regular diarization is the only
    valid main DER/JER input because it can retain simultaneous speakers.  The
    exclusive output is useful for word alignment but must never silently
    replace the regular output in an evaluation artifact.
    """

    regular = getattr(output, "speaker_diarization", None)
    if regular is None and hasattr(output, "itertracks"):
        regular = output
    if regular is None:
        raise RuntimeError("Community-1 output has no speaker_diarization")

    exclusive = getattr(output, "exclusive_speaker_diarization", None)
    if exclusive is None:
        raise RuntimeError("Community-1 output has no exclusive_speaker_diarization")
    regular_segments = serialize_annotation(regular, source_offset_sec)
    exclusive_segments = serialize_annotation(exclusive, source_offset_sec)
    return regular_segments, exclusive_segments


def decode_waveform(source: Path, target: Path) -> tuple[torch.Tensor, int, float]:
    """Decode without torchcodec so CPU and GPU images share identical input."""
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
        sample_rate = wav.getframerate()
        frame_count = wav.getnframes()
        samples = np.frombuffer(wav.readframes(frame_count), dtype=np.int16)
    waveform = torch.from_numpy(samples.astype(np.float32) / 32768.0).unsqueeze(0)
    return waveform, sample_rate, frame_count / sample_rate


def main() -> None:
    requested_device = os.getenv("DEVICE", "cuda").strip().lower()
    if requested_device not in {"cpu", "cuda"}:
        raise RuntimeError(f"unsupported DEVICE: {requested_device}")
    if requested_device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("CUDA GPU is required; refusing implicit CPU fallback")
    device = torch.device(requested_device)

    audio_uri = required("INPUT_AUDIO_URI")
    model_uri = required("MODEL_ARCHIVE_URI")
    output_uri = required("OUTPUT_JSON_URI")
    session_id = required("SESSION_ID")
    source_sha256 = require_sha256("SOURCE_SHA256")
    source_offset_sec = parse_nonnegative_float("SOURCE_OFFSET_SEC")
    source_duration_sec = parse_nonnegative_float("SOURCE_DURATION_SEC")
    expected_input_sha256 = os.getenv("INPUT_AUDIO_SHA256", "").strip().lower()
    if expected_input_sha256 and (
        len(expected_input_sha256) != 64
        or any(character not in "0123456789abcdef" for character in expected_input_sha256)
    ):
        raise RuntimeError("INPUT_AUDIO_SHA256 must be a lowercase SHA-256 hex digest")
    fixture_id = os.getenv("FIXTURE_ID", "ktv-briefing-20251231").strip()
    if not fixture_id:
        raise RuntimeError("FIXTURE_ID must not be empty")
    min_speakers = int(os.getenv("MIN_SPEAKERS", "1"))
    max_speakers = int(os.getenv("MAX_SPEAKERS", "20"))
    if min_speakers < 1 or max_speakers < min_speakers:
        raise RuntimeError("speaker bounds must satisfy 1 <= MIN_SPEAKERS <= MAX_SPEAKERS")
    seed = int(os.getenv("RANDOM_SEED", "1337"))
    seed_runtime(seed)
    model_archive_sha256_expected = optional_sha256("MODEL_ARCHIVE_SHA256")
    needs_gcs = any(uri.startswith("gs://") for uri in (audio_uri, model_uri, output_uri))
    client = storage.Client() if needs_gcs else None
    started = time.monotonic()

    with tempfile.TemporaryDirectory(prefix="faith-community1-") as tmp:
        root = Path(tmp)
        audio = root / "input.mp3"
        decoded = root / "input.wav"
        archive = root / "community1.tar.gz"
        model = root / "model"
        download(client, audio_uri, audio)
        input_audio_sha256 = sha256_file(audio)
        if expected_input_sha256 and input_audio_sha256 != expected_input_sha256:
            raise RuntimeError(
                "downloaded input audio SHA-256 does not match INPUT_AUDIO_SHA256"
            )
        waveform, sample_rate, duration_sec = decode_waveform(audio, decoded)
        download(client, model_uri, archive)
        model_archive_sha256 = sha256_file(archive)
        if (
            model_archive_sha256_expected
            and model_archive_sha256 != model_archive_sha256_expected
        ):
            raise RuntimeError(
                "downloaded model archive SHA-256 does not match MODEL_ARCHIVE_SHA256"
            )
        model.mkdir()
        with tarfile.open(archive, "r:gz") as package:
            package.extractall(model, filter="data")

        pipeline = Pipeline.from_pretrained(model)
        if pipeline is None:
            raise RuntimeError("failed to load Community-1 from offline archive")
        pipeline.to(device)
        if device.type == "cuda":
            torch.cuda.reset_peak_memory_stats()
        inference_started = time.monotonic()
        output = pipeline(
            {"waveform": waveform, "sample_rate": sample_rate},
            min_speakers=min_speakers,
            max_speakers=max_speakers,
        )
        if device.type == "cuda":
            torch.cuda.synchronize()
        inference_ms = round((time.monotonic() - inference_started) * 1000)
        regular_segments, exclusive_segments = serialize_outputs(output, source_offset_sec)
        speakers = list(dict.fromkeys(str(item["speaker"]) for item in regular_segments))
        exclusive_speakers = list(
            dict.fromkeys(str(item["speaker"]) for item in exclusive_segments)
        )

    result = {
        "schemaVersion": 2,
        "id": required("RUN_ID"),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "task": "diarization",
        "model": "pyannote/speaker-diarization-community-1",
        "modelVersion": "3533c8cf8e369892e6b79ff1bf80f7b0286a54ee",
        "sessionId": session_id,
        "fixtureId": fixture_id,
        "status": "completed",
        "diarizationStage": "raw-model",
        "runtime": {
            "device": (
                torch.cuda.get_device_name(0) if device.type == "cuda" else "cpu"
            ),
            "provider": os.getenv("COMPUTE_PROVIDER", "generic-rented-gpu"),
            "region": os.getenv("COMPUTE_REGION", os.getenv("CLOUD_RUN_REGION", "unknown")),
            "machineType": os.getenv("MACHINE_TYPE", "unknown"),
            "wallMs": round((time.monotonic() - started) * 1000),
            "inferenceMs": inference_ms,
            "peakVramMb": (
                round(torch.cuda.max_memory_allocated() / 1024 / 1024)
                if device.type == "cuda"
                else 0
            ),
            "python": platform.python_version(),
            "torch": torch.__version__,
            "pyannoteAudio": package_version("pyannote.audio"),
            "cuda": torch.version.cuda,
            "seed": seed,
            "deterministicRequested": True,
        },
        "cost": {
            "estimatedUsd": round(
                (time.monotonic() - started)
                * float(os.getenv("HOURLY_USD", "1.0369"))
                / 3600,
                6,
            ),
            "paidApi": False,
        },
        "privacy": {
            "execution": "rented-cloud-offline",
            "audioSentExternally": True,
        },
        "license": "CC-BY-4.0",
        "artifacts": {
            "diarizationPath": (
                ".data/stt-bench/model-lab/runs/" + required("RUN_ID") + ".json"
            ),
            "cloudOutputUri": output_uri,
        },
        "source": {
            "sourceSha256": source_sha256,
            "inputAudioSha256": input_audio_sha256,
            "inputAudioUri": audio_uri,
            "sourceWindow": {
                "offsetSec": round(source_offset_sec, 3),
                "durationSec": round(duration_sec, 3),
                "sourceDurationSec": round(source_duration_sec, 3),
                "timestampsUseOriginalTimeline": True,
            },
        },
        "modelArtifact": {
            "archiveUri": model_uri,
            "archiveSha256": model_archive_sha256,
        },
        "durationSec": round(duration_sec, 3),
        "speakerCount": len(speakers),
        "exclusiveSpeakerCount": len(exclusive_speakers),
        "outputContract": {
            "mainEvaluationOutput": "speaker_diarization",
            "derivedAlignmentOutput": "exclusive_speaker_diarization",
            "overlapInclusiveMain": True,
        },
        "outputs": {
            "regular": {
                "outputType": "speaker_diarization",
                "segments": regular_segments,
            },
            "exclusive": {
                "outputType": "exclusive_speaker_diarization",
                "segments": exclusive_segments,
            },
        },
        # Compatibility alias for consumers that still read top-level segments.
        # From schema v2 onward this always means overlap-inclusive regular output.
        "segments": regular_segments,
        "regularSegments": regular_segments,
        "exclusiveSegments": exclusive_segments,
    }
    upload_json(client, output_uri, result)
    print(json.dumps({key: result[key] for key in ("id", "status", "runtime", "speakerCount")}))


if __name__ == "__main__":
    main()
