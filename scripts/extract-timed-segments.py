#!/usr/bin/env python3
"""Extract timed STT segments for sync (faster-whisper)."""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).resolve().parents[1]
BENCH = ROOT / ".data" / "stt-bench"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--compute-type", default="int8")
    args = parser.parse_args()

    audio = Path(args.audio)
    if not audio.is_absolute():
        audio = ROOT / audio
    out = Path(args.out)
    if not out.is_absolute():
        out = ROOT / out

    model = WhisperModel(args.model, device="cpu", compute_type=args.compute_type)
    started = time.monotonic()
    generated, info = model.transcribe(
        str(audio),
        language="ko",
        beam_size=1,
        best_of=1,
        vad_filter=True,
        condition_on_previous_text=False,
        word_timestamps=False,
    )
    segments = [
        {
            "startSec": round(seg.start, 3),
            "endSec": round(seg.end, 3),
            "text": seg.text.strip(),
        }
        for seg in generated
        if seg.text and seg.text.strip()
    ]
    wall_ms = round((time.monotonic() - started) * 1000)
    payload = {
        "audio": str(audio.relative_to(ROOT)) if str(audio).startswith(str(ROOT)) else str(audio),
        "model": args.model,
        "durationSec": round(float(info.duration), 3),
        "wallMs": wall_ms,
        "segments": segments,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"ok": True, "out": str(out), "segments": len(segments), "durationSec": payload["durationSec"], "wallMs": wall_ms}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
