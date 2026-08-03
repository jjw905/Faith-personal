#!/usr/bin/env bash
# 로컬 Postgres(docker compose)를 기동하고 마이그레이션까지 맞춘다.
# Colima / Docker Desktop 중 사용 가능한 쪽을 쓴다.
set +e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 1

LOCAL_COMPOSE_FILE="${LOCAL_COMPOSE_FILE:-docker-compose.yml}"
if [[ "$LOCAL_COMPOSE_FILE" = /* ]]; then
  COMPOSE_PATH="$LOCAL_COMPOSE_FILE"
else
  COMPOSE_PATH="$ROOT/$LOCAL_COMPOSE_FILE"
fi

compose() {
  docker compose -f "$COMPOSE_PATH" "$@"
}

log() { echo "[db] $*"; }

ensure_docker() {
  if docker info >/dev/null 2>&1; then
    return 0
  fi

  if command -v colima >/dev/null 2>&1; then
    log "Docker 미기동 → Colima 시작"
    colima start
    # 소켓 준비 대기
    local i
    for i in $(seq 1 60); do
      if docker info >/dev/null 2>&1; then
        return 0
      fi
      sleep 1
    done
  fi

  if command -v open >/dev/null 2>&1 && [ -d "/Applications/Docker.app" ]; then
    log "Docker 미기동 → Docker Desktop 실행 시도"
    open -a Docker
    local i
    for i in $(seq 1 90); do
      if docker info >/dev/null 2>&1; then
        return 0
      fi
      sleep 1
    done
  fi

  log "Docker를 쓸 수 없습니다. Colima 또는 Docker Desktop을 설치/실행해 주세요."
  return 1
}

wait_postgres() {
  local i
  for i in $(seq 1 60); do
    if compose exec -T db pg_isready -U faith -d faith >/dev/null 2>&1; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

if ! command -v docker >/dev/null 2>&1; then
  log "docker CLI가 없습니다. 로컬 DB 기동을 건너뜁니다."
  exit 0
fi

if ! ensure_docker; then
  exit 1
fi

log "Postgres 컨테이너 기동: $LOCAL_COMPOSE_FILE"
compose up -d db
if [ $? -ne 0 ]; then
  log "docker compose up 실패"
  exit 1
fi

if ! wait_postgres; then
  log "Postgres 준비 시간 초과"
  exit 1
fi

log "마이그레이션 적용"
npx prisma migrate deploy
if [ $? -ne 0 ]; then
  log "migrate deploy 실패"
  exit 1
fi

log "관리자 계정 확인"
npx tsx "$ROOT/scripts/ensure-local-admin.ts"

log "준비 완료 (localhost:5432)"
exit 0
