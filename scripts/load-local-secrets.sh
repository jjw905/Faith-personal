#!/usr/bin/env bash
# Source-only helper. It loads local secrets from outside the repository.
# Usage: source scripts/load-local-secrets.sh

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  echo "This file must be sourced, not executed." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_DIR="${FAITH_LOCAL_SECRETS_DIR:-/Users/905jjw/Library/Application Support/Faith-web}"

# .env는 shell script가 아니다. 예를 들어 `NAME=Faith <mail@example.com>`은
# dotenv에서는 값이지만 source하면 `<`를 리다이렉션으로 실행하려 든다.
# 값 안의 $(), 백틱 같은 문자열도 실행하지 않도록 첫 `=`에서만 나눠 데이터로
# export한다. 이 프로젝트의 비밀 파일은 한 줄짜리 KEY=VALUE 형식만 쓴다.
load_dotenv_file() {
  local dotenv_path="$1"
  local line key value first last

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue

    key="${line%%=*}"
    value="${line#*=}"
    key="${key#${key%%[![:space:]]*}}"
    key="${key%${key##*[![:space:]]}}"
    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ || "$line" != *=* ]]; then
      echo "Invalid dotenv entry in $dotenv_path (key only: $key)" >&2
      return 1
    fi

    # 바깥 따옴표만 벗긴다. 내부 문자열은 확장하거나 실행하지 않는다.
    if (( ${#value} >= 2 )); then
      first="${value:0:1}"
      last="${value: -1}"
      if [[ ( "$first" == '"' && "$last" == '"' ) ||
            ( "$first" == "'" && "$last" == "'" ) ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    export "$key=$value"
  done < "$dotenv_path"
}

case "$SECRETS_DIR" in
  "$ROOT"|"$ROOT"/*)
    echo "FAITH_LOCAL_SECRETS_DIR must be outside the repository." >&2
    return 1
    ;;
esac

for secret_file in base.env local.env; do
  secret_path="$SECRETS_DIR/$secret_file"
  if [[ -f "$secret_path" ]]; then
    load_dotenv_file "$secret_path"
  fi
done
