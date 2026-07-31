#!/usr/bin/env python3
"""Align an existing Korean transcript to audio without changing its text."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import whisperx


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("transcript_json")
    parser.add_argument("output_json")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--model-dir", default=".data/models/alignment")
    args = parser.parse_args()

    source = json.loads(Path(args.transcript_json).read_text(encoding="utf-8"))
    text = str(source["text"])
    duration = float(source["durationSec"])
    parts = [part.strip() for part in text.splitlines() if part.strip()]
    if not parts:
        raise RuntimeError("정렬할 전사문이 없습니다.")

    supplied_ranges = source.get("partRanges")
    segments = []
    for index, part in enumerate(parts):
        if isinstance(supplied_ranges, list) and index < len(supplied_ranges):
            item = supplied_ranges[index]
            start = max(0.0, float(item["startSec"]) - 3.0)
            end = min(duration, float(item["endSec"]) + 3.0)
        else:
            # 이전 벤치 캐시는 범위를 저장하지 않았다. 5분 경계 주변을 넓게
            # 열어 무음 기준으로 이동한 실제 청크도 포함한다.
            start = max(0.0, index * 300.0 - 30.0)
            end = min(duration, (index + 1) * 300.0 + 30.0)
        segments.append(
            {
                "start": start,
                "end": end,
                "text": part,
            }
        )

    Path(args.model_dir).mkdir(parents=True, exist_ok=True)
    model, metadata = whisperx.load_align_model(
        language_code="ko",
        device=args.device,
        model_dir=args.model_dir,
    )
    aligned = whisperx.align(
        segments,
        model,
        metadata,
        args.audio,
        args.device,
        return_char_alignments=False,
        print_progress=True,
    )
    words = [
        {
            "text": str(word.get("word", "")).strip(),
            "startSec": float(word["start"]),
            "endSec": float(word["end"]),
            "score": float(word.get("score", 0.0)),
        }
        for word in aligned["word_segments"]
        if str(word.get("word", "")).strip()
        and word.get("start") is not None
        and word.get("end") is not None
    ]
    Path(args.output_json).write_text(
        json.dumps(
            {
                "model": "whisperx:kresnik/wav2vec2-large-xlsr-korean",
                "durationSec": duration,
                "words": words,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps({"words": len(words)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
