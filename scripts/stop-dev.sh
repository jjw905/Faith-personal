#!/usr/bin/env bash
# 기존 Next.js dev 서버를 "정상 종료"시켜 Turbopack 영속 캐시(.next)가
# 안전하게 flush 되도록 한다. 강제 종료(kill -9)는 최후 수단으로만 쓰고,
# 강제 종료가 발생하면 캐시가 손상됐을 수 있으므로 .next 를 비운다.
# (캐시 손상 → 재시작 시 turbopack 패닉 + CPU 폭주의 근본 원인)
set +e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FORCED=0

stop_port() {
  local port="$1"
  command -v lsof >/dev/null 2>&1 || return 0

  local pids
  pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null)
  [ -z "$pids" ] && return 0

  # 1) 정상 종료 요청: Turbopack 이 캐시를 flush 할 시간을 준다.
  kill -TERM $pids 2>/dev/null

  # 2) 최대 ~8초 대기하며 깨끗이 빠졌는지 폴링.
  local i
  for i in $(seq 1 40); do
    pids=$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null)
    [ -z "$pids" ] && return 0
    sleep 0.2
  done

  # 3) 그래도 살아있으면 강제 종료 + 캐시 손상 가능 표시.
  kill -9 $pids 2>/dev/null
  FORCED=1
}

for port in 3000 3001; do
  stop_port "$port"
done

# 강제 종료했다면 .next 캐시가 손상됐을 수 있어 비운다(다음 start 가 자동 복구).
if [ "$FORCED" = "1" ]; then
  rm -rf "$ROOT/.next"
fi

exit 0
