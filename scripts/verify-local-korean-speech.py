#!/usr/bin/env python3
"""Record local Korean-ASR evidence for an intake audio file.

This is a quality-control gate only.  The recognizer output is neither a gold
transcript nor a label for model training; it merely records whether an offline
Korean ASR model found lexical speech in the supplied audio.  No audio is sent
to an external API.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from vosk import KaldiRecognizer, Model, SetLogLevel


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_tree(path: Path) -> str:
    digest = hashlib.sha256()
    for child in sorted(item for item in path.rglob("*") if item.is_file()):
        digest.update(child.relative_to(path).as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(sha256_file(child).encode("ascii"))
        digest.update(b"\n")
    return digest.hexdigest()


def ffprobe(path: Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_name,codec_type,sample_rate,channels,bits_per_raw_sample",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def recognize(audio_path: Path, model_path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    SetLogLevel(-1)
    model = Model(str(model_path))
    recognizer = KaldiRecognizer(model, 16000)
    recognizer.SetWords(True)
    process = subprocess.Popen(
        [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(audio_path),
            "-map",
            "0:a:0",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "s16le",
            "-",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    assert process.stdout is not None
    segments: list[dict[str, Any]] = []
    while chunk := process.stdout.read(8000):
        if recognizer.AcceptWaveform(chunk):
            result = json.loads(recognizer.Result())
            if result.get("text") or result.get("result"):
                segments.append(result)
    final = json.loads(recognizer.FinalResult())
    if final.get("text") or final.get("result"):
        segments.append(final)
    stderr = process.stderr.read().decode("utf-8", "replace") if process.stderr else ""
    if process.wait() != 0:
        raise RuntimeError(f"ffmpeg decode failed: {stderr[-1200:]}")
    return segments, final


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--model-source-url", default=None)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not args.audio.is_file():
        raise SystemExit(f"audio file missing: {args.audio}")
    if not args.model.is_dir():
        raise SystemExit(f"Vosk model directory missing: {args.model}")

    segments, _ = recognize(args.audio, args.model)
    word_rows = [word for segment in segments for word in segment.get("result", [])]
    texts = [segment["text"] for segment in segments if segment.get("text")]
    output = {
        "qcVersion": "local-korean-speech-vosk-v0.1",
        "assessedAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "offline speech-presence QC only; not a gold transcript",
        "audioSentExternally": False,
        "recognizer": {
            "engine": "vosk",
            "modelPath": str(args.model),
            "modelTreeSha256": sha256_tree(args.model),
            "modelSourceUrl": args.model_source_url,
            "expectedInput": "16kHz mono signed 16-bit PCM",
        },
        "input": {
            "path": str(args.audio),
            "sha256": sha256_file(args.audio),
            "probe": ffprobe(args.audio),
        },
        "recognition": {
            "segmentCount": len(segments),
            "wordCount": len(word_rows),
            "text": " ".join(texts).strip(),
            "wordTiming": word_rows,
        },
        "verdict": (
            "speech_evidence_detected_pending_human_listening_qc"
            if word_rows or texts
            else "no_lexical_speech_evidence_detected"
        ),
        "limitations": [
            "Offline recognizer output may contain errors and must not be used as a reference transcript.",
            "Lexical detection does not establish speaker count, overlap, recording quality, or training eligibility.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"completed: {output['recognition']['wordCount']} words, "
        f"verdict={output['verdict']}, output={args.output}"
    )


if __name__ == "__main__":
    main()
