#!/usr/bin/env bash
# 운영 DB, Spaces, LiveKit, KMS와 분리된 로컬 실행 프로필.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Real local secrets are kept outside the Codex workspace.
# shellcheck source=/dev/null
source "$ROOT/scripts/load-local-secrets.sh"

export NODE_ENV=development
export PORT="${PORT:-3001}"
export LOCAL_COMPOSE_FILE="${LOCAL_COMPOSE_FILE:-docker-compose.local.yml}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-faith-web-local}"
export DATABASE_URL="${LOCAL_DATABASE_URL:-postgresql://faith:faith@127.0.0.1:55432/faith?schema=public}"
export AUTH_URL="${LOCAL_AUTH_URL:-http://localhost:${PORT}}"
export FAITH_DATA_DIR="${LOCAL_DATA_DIR:-$ROOT/.data}"
export STORAGE_BACKEND=local
export DURABLE_STATE_BACKEND=local
# 기본은 Web + Worker 2개를 함께 실행한다. inline이 필요하면
# LOCAL_ANALYSIS_EXECUTION_MODE=inline npm run dev:local 으로 덮어쓴다.
export ANALYSIS_EXECUTION_MODE="${LOCAL_ANALYSIS_EXECUTION_MODE:-queue}"

# 로컬 실행이 운영 리소스를 건드리지 않도록 기본 연결을 끊는다.
export DO_SPACES_ENDPOINT=""
export DO_SPACES_REGION=""
export DO_SPACES_BUCKET=""
export DO_SPACES_KEY=""
export DO_SPACES_SECRET=""
export LIVEKIT_URL=""
export LIVEKIT_API_KEY=""
export LIVEKIT_API_SECRET=""
export AWS_KMS_ENABLED=0
export AWS_KMS_RUNTIME_ENV=local
export GCP_KMS_ENABLED=0
export GCP_KMS_RUNTIME_ENV=local
export AWS_ACCESS_KEY_ID=""
export AWS_SECRET_ACCESS_KEY=""
export AWS_KMS_CONTENT_KEY_ARN=""
export AWS_KMS_AUDIT_KEY_ARN=""
export TRUST_PROXY=""

# 기능 플래그는 로컬에서 명시적으로 조정할 수 있지만 안전한 기본값을 쓴다.
export NEXT_PUBLIC_TEAM_FEATURE_ENABLED="${LOCAL_TEAM_FEATURE_ENABLED:-true}"
export NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY="${LOCAL_TEAM_ADMIN_ONLY:-true}"
export NEXT_PUBLIC_REALTIME_FEATURE_ENABLED="${LOCAL_REALTIME_ENABLED:-false}"

worker_pid=""

cleanup() {
  if [[ -n "$worker_pid" ]] && kill -0 "$worker_pid" 2>/dev/null; then
    kill "$worker_pid" 2>/dev/null || true
    wait "$worker_pid" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

# DB·SWC 준비가 끝난 뒤 Worker를 띄워 첫 실행 race를 피한다.
npm run dev:stop
npm run db:up
npm run dev:prepare

if [[ "$ANALYSIS_EXECUTION_MODE" = "queue" ]]; then
  npm run analysis:workers &
  worker_pid="$!"
  echo "[dev-local] Web + analysis workers 실행"
else
  echo "[dev-local] inline 분석 모드"
fi

next dev --hostname 0.0.0.0 --port "$PORT" "$@"
