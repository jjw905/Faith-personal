#!/usr/bin/env bash
# Run one command with local secrets loaded from outside the repository.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck source=/dev/null
source "$ROOT/scripts/load-local-secrets.sh"

if [[ $# -gt 0 && "$1" == "--" ]]; then
  shift
fi
if [[ $# -eq 0 ]]; then
  echo "Usage: $0 -- command [args...]" >&2
  exit 1
fi

exec "$@"
