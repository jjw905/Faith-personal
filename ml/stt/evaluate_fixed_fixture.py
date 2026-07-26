#!/usr/bin/env python3
"""Compare fixed-fixture transcripts with its official minutes excerpt."""

from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
RUN_DIR = ROOT / ".data" / "stt-bench" / "multi-speaker-run-20260727"
REFERENCE = (
    ROOT
    / ".data"
    / "stt-bench"
    / "fixtures"
    / "assembly3-dense-180.reference.txt"
)
OUTPUT = RUN_DIR / "upload-stt-comparison.json"

TRANSCRIPTS = {
    "gpt-realtime-whisper": RUN_DIR / "realtime.txt",
    "gpt-4o-mini-transcribe": RUN_DIR
    / "upload__gpt-4o-mini-transcribe.txt",
    "gpt-4o-transcribe": RUN_DIR / "upload__gpt-4o-transcribe.txt",
    "gpt-4o-transcribe-diarize": RUN_DIR
    / "upload__gpt-4o-transcribe-diarize.txt",
    "faster-whisper-large-v3": RUN_DIR
    / "upload__faster-whisper-large-v3-recommended.txt",
    "faster-whisper-large-v3-turbo-korean": RUN_DIR
    / "upload__faster-whisper-large-v3-turbo-korean-recommended.txt",
}


def normalize(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", text).lower()
    return re.sub(r"[^0-9a-z가-힣]+", "", normalized)


def edit_distance(left: str, right: str) -> int:
    previous = list(range(len(right) + 1))
    for row, left_char in enumerate(left, start=1):
        current = [row]
        for column, right_char in enumerate(right, start=1):
            current.append(
                min(
                    current[-1] + 1,
                    previous[column] + 1,
                    previous[column - 1] + (left_char != right_char),
                )
            )
        previous = current
    return previous[-1]


def repeated_line_ratio(text: str) -> float:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return 0.0
    duplicate_count = len(lines) - len(set(lines))
    return duplicate_count / len(lines)


def main() -> int:
    reference_text = REFERENCE.read_text()
    reference = normalize(reference_text)
    results = []
    for model, path in TRANSCRIPTS.items():
        text = path.read_text()
        hypothesis = normalize(text)
        distance = edit_distance(reference, hypothesis)
        results.append(
            {
                "model": model,
                "file": path.name,
                "referenceChars": len(reference),
                "hypothesisChars": len(hypothesis),
                "lengthRatio": round(len(hypothesis) / len(reference), 4),
                "editDistance": distance,
                "cer": round(distance / len(reference), 4),
                "repeatedLineRatio": round(repeated_line_ratio(text), 4),
            }
        )
    results.sort(key=lambda item: (item["cer"], item["repeatedLineRatio"]))
    report = {
        "fixtureId": "assembly3-dense-180",
        "referenceFile": REFERENCE.name,
        "normalization": "NFKC, lowercase, letters/numbers only",
        "warning": (
            "공식 회의록은 발화 정리본이며 클립 끝의 비공식 잡음 대화는 "
            "포함하지 않으므로 절대 품질이 아닌 동일 입력 상대 비교용"
        ),
        "results": results,
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
