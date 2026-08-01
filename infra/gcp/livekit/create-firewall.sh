#!/usr/bin/env bash
# Run from a workstation with gcloud authenticated.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-}"
NETWORK="${NETWORK:-default}"
TARGET_TAG="${TARGET_TAG:-faith-livekit}"
RULE_NAME="${RULE_NAME:-faith-livekit-ingress}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "Set PROJECT_ID first." >&2
  exit 1
fi

RULE_ARGS=(
  --project="${PROJECT_ID}" \
  --network="${NETWORK}" \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:80,tcp:443,tcp:7881,udp:443,udp:3478,udp:50000-60000 \
  --source-ranges=0.0.0.0/0 \
  --target-tags="${TARGET_TAG}" \
  --description="Faith LiveKit signaling, TLS/TURN, and WebRTC media"
)

if gcloud compute firewall-rules describe "${RULE_NAME}" \
  --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud compute firewall-rules update "${RULE_NAME}" "${RULE_ARGS[@]}"
else
  gcloud compute firewall-rules create "${RULE_NAME}" "${RULE_ARGS[@]}"
fi
