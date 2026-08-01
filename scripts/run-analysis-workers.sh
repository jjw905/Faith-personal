#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COUNT="${ANALYSIS_WORKER_COUNT:-2}"
if ! [[ "$COUNT" =~ ^[1-9][0-9]*$ ]]; then
  echo "[analysis-workers] ANALYSIS_WORKER_COUNT는 양의 정수여야 합니다." >&2
  exit 1
fi

pids=()

cleanup() {
  trap - INT TERM EXIT
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  for pid in "${pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}

trap cleanup INT TERM EXIT

for ((index = 1; index <= COUNT; index += 1)); do
  ANALYSIS_WORKER_ID="analysis-worker-${index}" \
    npx tsx --tsconfig tsconfig.json scripts/analysis-worker.ts &
  pids+=("$!")
done

echo "[analysis-workers] ${COUNT}개 Worker 실행"

while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" || true
      echo "[analysis-workers] Worker가 종료되어 전체 프로세스를 종료합니다." >&2
      exit 1
    fi
  done
  sleep 2
done
