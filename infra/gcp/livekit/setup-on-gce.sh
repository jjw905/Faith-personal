#!/usr/bin/env bash
# Run on an Ubuntu GCE VM as root.
# Usage: DOMAIN=rtc.example.com bash setup-on-gce.sh
set -euo pipefail

DOMAIN="${DOMAIN:-}"
LIVEKIT_VERSION="${LIVEKIT_VERSION:-v1.13.4}"
LIVEKIT_GENERATOR_IMAGE="${LIVEKIT_GENERATOR_IMAGE:-livekit/generate}"
if [[ -z "${DOMAIN}" ]]; then
  echo "Set DOMAIN first, e.g. DOMAIN=rtc.example.com bash setup-on-gce.sh" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker

mkdir -p /opt/livekit
cd /opt/livekit

LIVEKIT_DIR="/opt/livekit/${DOMAIN}"
if [[ ! -f "${LIVEKIT_DIR}/livekit.yaml" ]]; then
  docker pull "${LIVEKIT_GENERATOR_IMAGE}"
  docker run --rm -v /opt/livekit:/output "${LIVEKIT_GENERATOR_IMAGE}" "${DOMAIN}"
else
  echo "Existing ${LIVEKIT_DIR}/livekit.yaml found; keeping generated credentials."
fi

cd "${LIVEKIT_DIR}"
# 생성기는 최신 compose를 만들 수 있으므로 운영 서버 이미지는 기준 버전에
# 고정한다. 업그레이드는 LIVEKIT_VERSION을 명시해 별도 검증 후 수행한다.
COMPOSE_FILE="docker-compose.yaml"
if [[ ! -f "${COMPOSE_FILE}" && -f docker-compose.yml ]]; then
  COMPOSE_FILE="docker-compose.yml"
fi
if [[ -f "${COMPOSE_FILE}" ]]; then
  sed -i -E \
    "s#livekit/livekit-server:[^[:space:]\"']+#livekit/livekit-server:${LIVEKIT_VERSION}#g" \
    "${COMPOSE_FILE}"
fi
docker compose up -d

echo
echo "LiveKit is running."
echo "  cd /opt/livekit/${DOMAIN} && docker compose ps"
echo "  cd /opt/livekit/${DOMAIN} && docker compose logs -f --tail=80"
echo
echo "Set these application variables after DNS/TLS verification:"
echo "LIVEKIT_URL=wss://${DOMAIN}"
echo "LIVEKIT_VERSION=${LIVEKIT_VERSION}"
echo "LIVEKIT_GENERATOR_IMAGE=${LIVEKIT_GENERATOR_IMAGE}"
echo "Use the API key/secret from the generated livekit.yaml keys section."
