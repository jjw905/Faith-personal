#!/usr/bin/env python3
"""Run an offline Whisper.cpp/VAD cross-check for speech-presence QC.

The generated transcript is diagnostic evidence only.  It must not be promoted
to a gold transcript, reference text, speaker label, or training target.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio", type=Path)
    parser.add_argument("--binary", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--vad-model", type=Path, required=True)
    parser.add_argument("--model-source-url", required=True)
    parser.add_argument("--vad-model-source-url", required=True)
    parser.add_argument("--output-prefix", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    for path in (args.audio, args.binary, args.model, args.vad_model):
        if not path.is_file():
            raise SystemExit(f"missing required file: {path}")
    if args.threads <= 0:
        raise SystemExit("threads must be positive")

    args.output_prefix.parent.mkdir(parents=True, exist_ok=True)
    command = [
        str(args.binary),
        "--threads",
        str(args.threads),
        "--language",
        "ko",
        "--model",
        str(args.model),
        "--file",
        str(args.audio),
        "--vad",
        "--vad-model",
        str(args.vad_model),
        "--output-txt",
        "--output-json-full",
        "--output-file",
        str(args.output_prefix),
        "--no-prints",
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(f"Whisper.cpp failed ({result.returncode}): {(result.stderr or result.stdout)[-1600:]}")
    text_path = args.output_prefix.with_suffix(".txt")
    json_path = args.output_prefix.with_suffix(".json")
    transcript = text_path.read_text(encoding="utf-8") if text_path.exists() else ""
    hangul_count = len(re.findall(r"[가-힣]", transcript))
    output: dict[str, Any] = {
        "qcVersion": "local-whispercpp-vad-korean-speech-v0.1",
        "assessedAt": datetime.now(timezone.utc).isoformat(),
        "purpose": "offline speech-presence and intelligibility QC only; not a gold transcript",
        "audioSentExternally": False,
        "input": {
            "path": str(args.audio),
            "sha256": sha256_file(args.audio),
        },
        "runtime": {
            "binary": str(args.binary),
            "binarySha256": sha256_file(args.binary),
            "model": str(args.model),
            "modelSha256": sha256_file(args.model),
            "modelSourceUrl": args.model_source_url,
            "vadModel": str(args.vad_model),
            "vadModelSha256": sha256_file(args.vad_model),
            "vadModelSourceUrl": args.vad_model_source_url,
            "language": "ko",
            "threads": args.threads,
            "vadEnabled": True,
            "command": command,
        },
        "output": {
            "textPath": str(text_path) if text_path.exists() else None,
            "textSha256": sha256_file(text_path) if text_path.exists() else None,
            "jsonPath": str(json_path) if json_path.exists() else None,
            "jsonSha256": sha256_file(json_path) if json_path.exists() else None,
            "transcript": transcript.strip(),
            "hangulCharacterCount": hangul_count,
        },
        "verdict": (
            "whisper_vad_korean_text_detected_pending_human_listening_qc"
            if hangul_count >= 5
            else "no_reliable_korean_speech_text_detected"
        ),
        "limitations": [
            "The diagnostic transcript can contain recognition errors and is not a reference transcript.",
            "A nonempty result does not establish speaker count, overlap, speech coverage, or training eligibility.",
        ],
    }
    qc_path = args.output_prefix.with_suffix(".qc.json")
    qc_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        f"completed: hangul={hangul_count}, verdict={output['verdict']}, "
        f"qc={qc_path}"
    )


if __name__ == "__main__":
    main()
