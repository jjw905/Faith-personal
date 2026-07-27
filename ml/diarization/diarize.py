#!/usr/bin/env python3
"""Run local speaker diarization and emit model-produced speaker segments."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path

import numpy as np


DEFAULT_MODEL = "pyannote/speaker-diarization-community-1"
DEFAULT_MODEL_DIR = Path(".data/models/diarization")
DEFAULT_SEGMENTATION_MODEL = (
    DEFAULT_MODEL_DIR / "sherpa-onnx-pyannote-segmentation-3-0" / "model.onnx"
)
DEFAULT_EMBEDDING_MODEL = (
    DEFAULT_MODEL_DIR
    / "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--max-seconds", type=float)
    parser.add_argument("--min-speakers", type=int)
    parser.add_argument("--max-speakers", type=int)
    return parser.parse_args()


def prepare_audio(source: Path, target: Path, max_seconds: float | None) -> float:
    command = [
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
    ]
    if max_seconds is not None and max_seconds > 0:
        command.extend(["-t", str(max_seconds)])
    command.append(str(target))
    subprocess.run(command, check=True)

    with wave.open(str(target), "rb") as audio:
        return audio.getnframes() / audio.getframerate()


def run_community(
    prepared: Path,
    min_speakers: int | None,
    max_speakers: int | None,
) -> tuple[list[dict[str, float | str]], str, str]:
    import torch
    from pyannote.audio import Pipeline

    local_path = os.getenv("PYANNOTE_MODEL_PATH", "").strip()
    token = os.getenv("HF_TOKEN", "").strip()
    model = local_path or DEFAULT_MODEL

    pipeline = Pipeline.from_pretrained(model, token=token or None)
    if pipeline is None:
        raise RuntimeError(
            "pyannote 모델을 불러오지 못했습니다. Community-1 사용 조건과 "
            "HF_TOKEN 권한을 확인하세요."
        )

    requested = os.getenv("PYANNOTE_DEVICE", "cpu").strip().lower()
    if requested == "cuda" and torch.cuda.is_available():
        device = torch.device("cuda")
    elif requested == "mps" and torch.backends.mps.is_available():
        device = torch.device("mps")
    else:
        device = torch.device("cpu")
    pipeline.to(device)

    kwargs: dict[str, int] = {}
    if min_speakers is not None:
        kwargs["min_speakers"] = min_speakers
    if max_speakers is not None:
        kwargs["max_speakers"] = max_speakers
    output = pipeline(str(prepared), **kwargs)
    return serialize_segments(output), model, str(device)


def serialize_segments(output: object) -> list[dict[str, float | str]]:
    annotation = getattr(output, "exclusive_speaker_diarization", None)
    if annotation is None:
        annotation = getattr(output, "speaker_diarization", output)

    segments: list[dict[str, float | str]] = []
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        segments.append(
            {
                "startSec": round(float(turn.start), 3),
                "endSec": round(float(turn.end), 3),
                "speaker": str(speaker),
            }
        )
    return segments


def read_wave(prepared: Path) -> np.ndarray:
    with wave.open(str(prepared), "rb") as audio:
        if audio.getframerate() != 16000 or audio.getnchannels() != 1:
            raise RuntimeError("화자분리 입력은 16kHz mono여야 합니다.")
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype=np.int16)
    return samples.astype(np.float32) / 32768.0


def run_sherpa(
    prepared: Path,
    min_speakers: int | None,
    max_speakers: int | None,
) -> tuple[list[dict[str, float | str]], str, str]:
    import sherpa_onnx

    segmentation_path = Path(
        os.getenv("SHERPA_SEGMENTATION_MODEL", str(DEFAULT_SEGMENTATION_MODEL))
    )
    embedding_path = Path(
        os.getenv("SHERPA_EMBEDDING_MODEL", str(DEFAULT_EMBEDDING_MODEL))
    )
    if not segmentation_path.is_file() or not embedding_path.is_file():
        raise RuntimeError(
            "공개 화자분리 모델이 없습니다. npm run diarization:setup을 실행하세요."
        )

    num_speakers = (
        min_speakers
        if min_speakers is not None
        and max_speakers is not None
        and min_speakers == max_speakers
        else -1
    )
    threshold = float(os.getenv("PYANNOTE_CLUSTER_THRESHOLD", "0.9"))
    # 기본값이 1스레드라 18분짜리에 8분이 걸린다. 코어를 쓰되 전사 프로세스
    # 몫은 남긴다.
    num_threads = int(
        os.getenv("DIARIZATION_THREADS", "0")
    ) or max(1, min(6, (os.cpu_count() or 2) - 2))
    config = sherpa_onnx.OfflineSpeakerDiarizationConfig(
        segmentation=sherpa_onnx.OfflineSpeakerSegmentationModelConfig(
            pyannote=sherpa_onnx.OfflineSpeakerSegmentationPyannoteModelConfig(
                model=str(segmentation_path)
            ),
            num_threads=num_threads,
        ),
        embedding=sherpa_onnx.SpeakerEmbeddingExtractorConfig(
            model=str(embedding_path),
            num_threads=num_threads,
        ),
        clustering=sherpa_onnx.FastClusteringConfig(
            num_clusters=num_speakers,
            threshold=threshold,
        ),
        min_duration_on=0.3,
        min_duration_off=0.5,
    )
    if not config.validate():
        raise RuntimeError("sherpa-onnx 화자분리 설정이 올바르지 않습니다.")

    diarizer = sherpa_onnx.OfflineSpeakerDiarization(config)
    result = diarizer.process(read_wave(prepared)).sort_by_start_time()
    segments = [
        {
            "startSec": round(float(item.start), 3),
            "endSec": round(float(item.end), 3),
            "speaker": f"SPEAKER_{int(item.speaker):02d}",
        }
        for item in result
    ]
    model = "pyannote-segmentation-3.0+3D-Speaker(sherpa-onnx)"
    return segments, model, "cpu"


def main() -> int:
    args = parse_args()
    if not args.audio.is_file():
        raise FileNotFoundError(f"오디오 파일이 없습니다: {args.audio}")

    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="faith-diarize-") as tmp:
        prepared = Path(tmp) / "audio.wav"
        duration_sec = prepare_audio(args.audio, prepared, args.max_seconds)
        use_community = bool(
            os.getenv("PYANNOTE_MODEL_PATH", "").strip()
            or os.getenv("HF_TOKEN", "").strip()
        )
        if use_community:
            segments, model, device = run_community(
                prepared,
                args.min_speakers,
                args.max_speakers,
            )
        else:
            segments, model, device = run_sherpa(
                prepared,
                args.min_speakers,
                args.max_speakers,
            )
    speakers = list(dict.fromkeys(str(item["speaker"]) for item in segments))
    json.dump(
        {
            "model": model,
            "device": device,
            "durationSec": round(duration_sec, 3),
            "wallMs": round((time.monotonic() - started) * 1000),
            "speakerCount": len(speakers),
            "segments": segments,
        },
        sys.stdout,
        ensure_ascii=False,
    )
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"diarization failed: {error}", file=sys.stderr)
        raise SystemExit(1)
