#!/usr/bin/env bash
# 일반 로컬 개발도 운영과 같은 durable queue 경로를 쓴다. Next.js after()에
# 10분대 분석을 맡기면 HMR/재시작 때 작업이 끊기고 상태 조회와 경합한다.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export ANALYSIS_EXECUTION_MODE=queue
export PORT="${PORT:-3000}"

reset_next=0
if [[ "${1:-}" == "--reset-next" ]]; then
  reset_next=1
  shift
fi

worker_pid=""
cleanup() {
  trap - INT TERM EXIT
  if [[ -n "$worker_pid" ]] && kill -0 "$worker_pid" 2>/dev/null; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

npm run dev:stop
if [[ "$reset_next" == 1 ]]; then
  # ROOT에서 확정한 정확한 build cache만 지운다. 사용자 데이터는 건드리지 않는다.
  rm -rf "$ROOT/.next"
fi
npm run db:up
npm run dev:prepare
npm run analysis:workers &
worker_pid="$!"

echo "[dev] Web + durable analysis queue workers 실행"
next dev --hostname 0.0.0.0 --port "$PORT" "$@"
