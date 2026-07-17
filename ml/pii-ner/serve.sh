#!/usr/bin/env bash
# NER 추론 서버 (기본 CPU, 8765). Desktop I/O 회피 시 /tmp 복사본 권장.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
# shellcheck disable=SC1091
source .venv/bin/activate
export FAITH_NER_DEVICE="${FAITH_NER_DEVICE:-cpu}"
export FAITH_NER_HOST="${FAITH_NER_HOST:-127.0.0.1}"
export FAITH_NER_PORT="${FAITH_NER_PORT:-8765}"
exec python serve.py
