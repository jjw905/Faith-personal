#!/usr/bin/env bash
# Run on the LiveKit Droplet as root.
# Usage: DOMAIN=livekit.example.com bash setup-on-droplet.sh
set -euo pipefail

DOMAIN="${DOMAIN:-}"
if [[ -z "${DOMAIN}" ]]; then
  echo "Set DOMAIN first, e.g. DOMAIN=livekit.example.com bash setup-on-droplet.sh"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl git ufw

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

systemctl enable --now docker

mkdir -p /opt/livekit
cd /opt/livekit

docker pull livekit/generate

# Non-interactive generate writes into /output/<domain>/
docker run --rm -v /opt/livekit:/output livekit/generate "${DOMAIN}"

cd "/opt/livekit/${DOMAIN}"
docker compose up -d

echo
echo "Started. Check:"
echo "  cd /opt/livekit/${DOMAIN} && docker compose ps"
echo "  docker compose logs -f --tail=80"
echo
echo "Save API key/secret from livekit.yaml keys: section into DO App Platform env."
echo "LIVEKIT_URL=wss://${DOMAIN}"
