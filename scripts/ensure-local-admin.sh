#!/usr/bin/env bash
# 로컬 플랫폼 관리자 + 제품기획팀(대표=어드민)을 보장한다.
# 1) ADMIN_EMAILS + ADMIN_SEED_PASSWORD 가 있으면 해당 계정
# 2) 없으면 faith-admin@faith.local / faith-dev-local (비프로덕션)
# 3) 비프로덕션에서 제품기획팀 멤버(팀장·팀원)까지 시드
set +e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT" || exit 0

npx tsx scripts/ensure-local-admin.ts
exit 0
