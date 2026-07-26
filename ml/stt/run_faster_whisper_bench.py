#!/usr/bin/env python3
"""Run one faster-whisper model on the fixed multi-speaker fixture."""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
from pathlib import Path

from faster_whisper import WhisperModel


ROOT = Path(__file__).resolve().parents[2]
FIXTURE_DIR = ROOT / ".data" / "stt-bench" / "fixtures"
MANIFEST_PATH = FIXTURE_DIR / "assembly3-dense-180.json"
OUTPUT_DIR = ROOT / ".data" / "stt-bench" / "multi-speaker-run-20260727"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--label", required=True)
    parser.add_argument("--compute-type", default="int8")
    return parser.parse_args()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    args = parse_args()
    manifest = json.loads(MANIFEST_PATH.read_text())
    clip = FIXTURE_DIR / manifest["clip"]["file"]
    actual_hash = sha256(clip)
    expected_hash = manifest["clip"]["sha256"]
    if actual_hash != expected_hash:
        raise RuntimeError(
            f"clip hash mismatch: expected {expected_hash}, got {actual_hash}"
        )

    load_started = time.monotonic()
    model = WhisperModel(
        args.model,
        device="cpu",
        compute_type=args.compute_type,
    )
    load_ms = round((time.monotonic() - load_started) * 1000)

    transcribe_started = time.monotonic()
    generated, info = model.transcribe(
        str(clip),
        language="ko",
        beam_size=5,
        best_of=5,
        condition_on_previous_text=True,
        vad_filter=False,
        word_timestamps=False,
    )
    segments = [
        {
            "startSec": round(segment.start, 3),
            "endSec": round(segment.end, 3),
            "text": segment.text.strip(),
            "avgLogProb": segment.avg_logprob,
            "noSpeechProb": segment.no_speech_prob,
        }
        for segment in generated
    ]
    wall_ms = round((time.monotonic() - transcribe_started) * 1000)
    text = "\n".join(
        segment["text"] for segment in segments if segment["text"]
    ).strip()

    result = {
        "path": "upload-oss",
        "status": "ok",
        "model": args.model,
        "label": args.label,
        "input": {
            "fixtureId": manifest["fixtureId"],
            "clipFile": manifest["clip"]["file"],
            "clipSha256": actual_hash,
            "segmentSec": [
                manifest["selection"]["selected"]["startSec"],
                manifest["selection"]["selected"]["endSec"],
            ],
            "durationSec": manifest["selection"]["selected"]["durationSec"],
        },
        "runtime": {
            "device": "cpu",
            "computeType": args.compute_type,
            "machine": platform.machine(),
            "python": platform.python_version(),
        },
        "detectedLanguage": info.language,
        "languageProbability": info.language_probability,
        "durationSec": info.duration,
        "loadMs": load_ms,
        "wallMs": wall_ms,
        "chars": len(text),
        "segmentCount": len(segments),
        "text": text,
        "segments": segments,
    }
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    stem = f"upload__{args.label}"
    (OUTPUT_DIR / f"{stem}.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    )
    (OUTPUT_DIR / f"{stem}.txt").write_text(text + "\n")
    print(json.dumps({key: value for key, value in result.items() if key not in {
        "text", "segments"
    }}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
