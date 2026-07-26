#!/usr/bin/env bash
# STT 벤치 mock 시드: 실측 타임스탬프 없으면 추출 후 주입.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PYTHON="${STT_PYTHON:-.venv-stt/bin/python}"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="python3"
fi

ensure_timed() {
  local audio="$1"
  local out="$2"
  if [[ -f "$out" ]]; then
    echo "ok timed exists: $out"
    return 0
  fi
  if [[ ! -f "$audio" ]]; then
    echo "missing audio: $audio" >&2
    exit 1
  fi
  echo "extract timed: $audio -> $out"
  "$PYTHON" scripts/extract-timed-segments.py \
    --audio "$audio" \
    --out "$out" \
    --model "${STT_TIMED_MODEL:-small}"
}

ensure_timed \
  .data/stt-bench/assembly-envlabor-20250425.mp3 \
  .data/stt-bench/assembly__timed-segments.json

ensure_timed \
  .data/stt-bench/ktv-briefing-20251231.mp3 \
  .data/stt-bench/ktv__timed-segments.json

npx tsx --tsconfig tsconfig.json scripts/seed-stt-bench-meetings.ts
