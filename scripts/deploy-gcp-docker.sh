#!/usr/bin/env bash
# Faith GCP 배포 — 로컬 Docker 경로 (GitHub Actions 불필요).
#
# GitHub는 백업용. 서버 배포는 이 스크립트로만 한다.
#
# 사용:
#   cp deploy.gcp.staging.example deploy.gcp.staging.local   # 값 채우기
#   ./scripts/deploy-gcp-docker.sh staging
#   ./scripts/deploy-gcp-docker.sh staging --skip-validate
#   ./scripts/deploy-gcp-docker.sh staging --no-worker
#   ./scripts/deploy-gcp-docker.sh production
#
# 전제:
#   - gcloud 로그인 (배포 권한 있는 계정)
#   - 비밀값은 Secret Manager에 이미 있음 (이 파일에 넣지 않음)
#   - 공개 설정은 deploy.gcp.<env>.local

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_NAME="${1:-}"
shift || true

SKIP_VALIDATE=0
DEPLOY_WORKER=1
VALIDATE_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-validate) SKIP_VALIDATE=1 ;;
    --no-worker) DEPLOY_WORKER=0 ;;
    --validate-only) VALIDATE_ONLY=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [[ "$ENV_NAME" != "staging" && "$ENV_NAME" != "production" ]]; then
  echo "Usage: $0 staging|production [--skip-validate] [--no-worker] [--validate-only]" >&2
  exit 1
fi

CONFIG_FILE="${DEPLOY_ENV_FILE:-$ROOT/deploy.gcp.${ENV_NAME}.local}"
if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing config: $CONFIG_FILE" >&2
  echo "Copy deploy.gcp.${ENV_NAME}.example → deploy.gcp.${ENV_NAME}.local and fill values." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
source "$CONFIG_FILE"
set +a

REGION="${REGION:-asia-northeast1}"
# 워커는 torch 때문에 E2_HIGHCPU가 필요한데 도쿄 쿼터가 막히는 경우가 있어
# 빌드만 us-central1에서 돌리고 이미지는 도쿄 Artifact Registry에 푸시한다.
WORKER_BUILD_REGION="${WORKER_BUILD_REGION:-us-central1}"
ARTIFACT_REPOSITORY="${ARTIFACT_REPOSITORY:-faith}"
NODE_ENV="${NODE_ENV:-production}"
WEB_SERVICE="${WEB_SERVICE:-faith-web-${ENV_NAME}}"
WORKER_POOL="${WORKER_POOL:-faith-analysis-${ENV_NAME}}"
MIGRATION_JOB="${MIGRATION_JOB:-faith-migrate-${ENV_NAME}}"
VERIFY_JOB="${VERIFY_JOB:-faith-verify-${ENV_NAME}}"
SECRET_PREFIX="${SECRET_PREFIX:-faith-${ENV_NAME}-}"

GCP_PROJECT_ID="${GCP_PROJECT_ID:?GCP_PROJECT_ID required}"
CLOUD_SQL_INSTANCE="${CLOUD_SQL_INSTANCE_CONNECTION_NAME:?CLOUD_SQL_INSTANCE_CONNECTION_NAME required}"
WEB_SERVICE_ACCOUNT="${GCP_WEB_RUNTIME_SERVICE_ACCOUNT:?GCP_WEB_RUNTIME_SERVICE_ACCOUNT required}"
WORKER_SERVICE_ACCOUNT="${GCP_WORKER_RUNTIME_SERVICE_ACCOUNT:?GCP_WORKER_RUNTIME_SERVICE_ACCOUNT required}"
VERIFY_SERVICE_ACCOUNT="${GCP_VERIFY_RUNTIME_SERVICE_ACCOUNT:-faith-verify-runtime@${GCP_PROJECT_ID}.iam.gserviceaccount.com}"
GCS_BUCKET="${GCS_BUCKET:?GCS_BUCKET required}"
AUTH_URL="${FAITH_AUTH_URL:?FAITH_AUTH_URL required}"
AUTH_EMAIL_FROM="${AUTH_EMAIL_FROM:-Faith <onboarding@resend.dev>}"
LIVEKIT_URL="${LIVEKIT_URL:-}"
LIVEKIT_ENABLED="${LIVEKIT_ENABLED:-0}"
MAINTENANCE_CRON_AUDIENCE="${MAINTENANCE_CRON_AUDIENCE:?MAINTENANCE_CRON_AUDIENCE required}"
MAINTENANCE_CRON_SERVICE_ACCOUNT="${MAINTENANCE_CRON_SERVICE_ACCOUNT:?MAINTENANCE_CRON_SERVICE_ACCOUNT required}"
AUTH_GOOGLE_ID="${AUTH_GOOGLE_ID:-}"
AUTH_NAVER_ID="${AUTH_NAVER_ID:-}"
AUTH_TWITTER_ID="${AUTH_TWITTER_ID:-}"
NEXT_SERVER_ACTION_ALLOWED_ORIGINS="${NEXT_SERVER_ACTION_ALLOWED_ORIGINS:?NEXT_SERVER_ACTION_ALLOWED_ORIGINS required}"
NEXT_PUBLIC_TEAM_FEATURE_ENABLED="${NEXT_PUBLIC_TEAM_FEATURE_ENABLED:-true}"
NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY="${NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY:-true}"
NEXT_PUBLIC_REALTIME_FEATURE_ENABLED="${NEXT_PUBLIC_REALTIME_FEATURE_ENABLED:-false}"
NEXT_PUBLIC_RECAPTCHA_SITE_KEY="${NEXT_PUBLIC_RECAPTCHA_SITE_KEY:?NEXT_PUBLIC_RECAPTCHA_SITE_KEY required}"
WEB_CPU="${CLOUD_RUN_WEB_CPU:-1}"
WEB_MEMORY="${CLOUD_RUN_WEB_MEMORY:-1Gi}"
WEB_MAX_INSTANCES="${CLOUD_RUN_WEB_MAX_INSTANCES:-10}"
WORKER_CPU="${CLOUD_RUN_WORKER_CPU:-2}"
WORKER_MEMORY="${CLOUD_RUN_WORKER_MEMORY:-8Gi}"
WORKER_INSTANCES="${CLOUD_RUN_WORKER_INSTANCES:-1}"
ANALYSIS_WORKER_COUNT="${ANALYSIS_WORKER_COUNT:-1}"
GCP_KMS_ENABLED="${GCP_KMS_ENABLED:-0}"
GCP_KMS_KEY_RING="${GCP_KMS_KEY_RING:-faith-${ENV_NAME}}"
GCP_KMS_CONTENT_KEY="${GCP_KMS_CONTENT_KEY:-faith-${ENV_NAME}-content}"
GCP_KMS_AUDIT_KEY="${GCP_KMS_AUDIT_KEY:-faith-${ENV_NAME}-audit}"
GCP_KMS_TEAM_KEY_RING="${GCP_KMS_TEAM_KEY_RING:-faith-${ENV_NAME}-teams}"
GCP_KMS_RUNTIME_ENV="$ENV_NAME"

IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse HEAD)}"
IMAGE="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPOSITORY}/faith:${IMAGE_TAG}"

echo "==> Faith Docker deploy"
echo "    env=$ENV_NAME region=$REGION image_tag=$IMAGE_TAG"
echo "    worker=$([[ "$DEPLOY_WORKER" == 1 ]] && echo yes || echo no) validate=$([[ "$SKIP_VALIDATE" == 1 ]] && echo skip || echo yes)"

require_bin() {
  command -v "$1" >/dev/null || { echo "Need $1 on PATH" >&2; exit 1; }
}
require_bin gcloud
require_bin curl
require_bin git
require_bin npm

case "$AUTH_URL" in
  https://*) ;;
  *) echo "FAITH_AUTH_URL must use https://" >&2; exit 1 ;;
esac
case "$LIVEKIT_ENABLED" in
  0) ;;
  1)
    test -n "$LIVEKIT_URL"
    case "$LIVEKIT_URL" in
      wss://*) ;;
      *) echo "LIVEKIT_URL must use wss:// when LiveKit is enabled" >&2; exit 1 ;;
    esac
    ;;
  *) echo "LIVEKIT_ENABLED must be 0 or 1" >&2; exit 1 ;;
esac

gcloud config set project "$GCP_PROJECT_ID" >/dev/null

if [[ "$SKIP_VALIDATE" != 1 ]]; then
  echo "==> Local validate"
  npm run security:secrets
  npm run typecheck
  npm run lint
  npm run test:kms-policy
  npm run test:team
  npm run test:meeting-export
  npm run test:process-progress
  AUTH_SECRET=ci-only-placeholder-change-me \
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=ci-only-placeholder-change-me \
  DATABASE_URL='postgresql://faith:faith@127.0.0.1:5432/faith?schema=public' \
  STORAGE_BACKEND=local \
  DURABLE_STATE_BACKEND=local \
  AUTH_URL="${AUTH_URL}" \
  NEXT_SERVER_ACTION_ALLOWED_ORIGINS="${NEXT_SERVER_ACTION_ALLOWED_ORIGINS}" \
  NEXT_PUBLIC_TEAM_FEATURE_ENABLED="${NEXT_PUBLIC_TEAM_FEATURE_ENABLED}" \
  NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY="${NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY}" \
  NEXT_PUBLIC_REALTIME_FEATURE_ENABLED="${NEXT_PUBLIC_REALTIME_FEATURE_ENABLED}" \
  NEXT_PUBLIC_RECAPTCHA_SITE_KEY="${NEXT_PUBLIC_RECAPTCHA_SITE_KEY}" \
    npm run build
fi

if [[ "$VALIDATE_ONLY" == 1 ]]; then
  echo "==> Validate only — done"
  exit 0
fi

echo "==> Build & push web image (Cloud Build + Dockerfile)"
gcloud builds submit . \
  --project="$GCP_PROJECT_ID" \
  --region="$REGION" \
  --config=cloudbuild.yaml \
  --substitutions="^@^_IMAGE=${IMAGE}@_SERVER_ACTIONS_SECRET=${SECRET_PREFIX}server-actions-key@_NEXT_SERVER_ACTION_ALLOWED_ORIGINS=${NEXT_SERVER_ACTION_ALLOWED_ORIGINS}@_NEXT_PUBLIC_TEAM_FEATURE_ENABLED=${NEXT_PUBLIC_TEAM_FEATURE_ENABLED}@_NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY=${NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY}@_NEXT_PUBLIC_REALTIME_FEATURE_ENABLED=${NEXT_PUBLIC_REALTIME_FEATURE_ENABLED}@_NEXT_PUBLIC_RECAPTCHA_SITE_KEY=${NEXT_PUBLIC_RECAPTCHA_SITE_KEY}"

if [[ "$DEPLOY_WORKER" != 1 ]]; then
  echo "==> Checking existing worker pool"
  gcloud run worker-pools describe "$WORKER_POOL" \
    --project="$GCP_PROJECT_ID" \
    --region="$REGION" >/dev/null
fi

RUNTIME_SECRETS="AUTH_SECRET=${SECRET_PREFIX}auth-secret:latest,SETUP_SECRET=${SECRET_PREFIX}setup-secret:latest,ADMIN_SEED_PASSWORD=${SECRET_PREFIX}admin-seed-password:latest,ADMIN_EMAILS=${SECRET_PREFIX}admin-emails:latest,NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${SECRET_PREFIX}server-actions-key:latest,DATABASE_URL=${SECRET_PREFIX}database-url:latest,OPENAI_API_KEY=${SECRET_PREFIX}openai-api-key:latest,NOTIFICATION_ENC_KEY=${SECRET_PREFIX}notification-key:latest,AUTH_RESEND_KEY=${SECRET_PREFIX}resend-key:latest,RECAPTCHA_SECRET_KEY=${SECRET_PREFIX}recaptcha-secret:latest"
if [[ "$LIVEKIT_ENABLED" == "1" ]]; then
  RUNTIME_SECRETS+=",LIVEKIT_API_KEY=${SECRET_PREFIX}livekit-api-key:latest,LIVEKIT_API_SECRET=${SECRET_PREFIX}livekit-api-secret:latest"
fi
if [[ -n "$AUTH_GOOGLE_ID" ]]; then
  RUNTIME_SECRETS+=",AUTH_GOOGLE_SECRET=${SECRET_PREFIX}google-client-secret:latest"
fi
if [[ -n "$AUTH_TWITTER_ID" ]]; then
  RUNTIME_SECRETS+=",AUTH_TWITTER_SECRET=${SECRET_PREFIX}twitter-client-secret:latest"
fi

echo "==> Deploy web (no traffic yet)"
gcloud run deploy "$WEB_SERVICE" \
  --project="$GCP_PROJECT_ID" \
  --region="$REGION" \
  --image="$IMAGE" \
  --cpu="$WEB_CPU" \
  --memory="$WEB_MEMORY" \
  --timeout=300 \
  --concurrency=40 \
  --min-instances=0 \
  --max-instances="$WEB_MAX_INSTANCES" \
  --no-traffic \
  --allow-unauthenticated \
  --service-account="$WEB_SERVICE_ACCOUNT" \
  --add-cloudsql-instances="$CLOUD_SQL_INSTANCE" \
  --set-env-vars="^|^NODE_ENV=${NODE_ENV}|AUTH_URL=${AUTH_URL}|NEXT_PUBLIC_APP_URL=${AUTH_URL}|AUTH_EMAIL_FROM=${AUTH_EMAIL_FROM}|AUTH_GOOGLE_ID=${AUTH_GOOGLE_ID}|AUTH_NAVER_ID=${AUTH_NAVER_ID}|AUTH_TWITTER_ID=${AUTH_TWITTER_ID}|LIVEKIT_ENABLED=${LIVEKIT_ENABLED}|LIVEKIT_URL=${LIVEKIT_URL}|MAINTENANCE_CRON_AUDIENCE=${MAINTENANCE_CRON_AUDIENCE}|MAINTENANCE_CRON_SERVICE_ACCOUNT=${MAINTENANCE_CRON_SERVICE_ACCOUNT}|NEXT_PUBLIC_TEAM_FEATURE_ENABLED=${NEXT_PUBLIC_TEAM_FEATURE_ENABLED}|NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY=${NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY}|NEXT_PUBLIC_REALTIME_FEATURE_ENABLED=${NEXT_PUBLIC_REALTIME_FEATURE_ENABLED}|NEXT_PUBLIC_RECAPTCHA_SITE_KEY=${NEXT_PUBLIC_RECAPTCHA_SITE_KEY}|STORAGE_BACKEND=gcs|DURABLE_STATE_BACKEND=database|GCP_PROJECT_ID=${GCP_PROJECT_ID}|GCS_BUCKET=${GCS_BUCKET}|GCS_SIGNED_URL_TTL_SECONDS=600|ANALYSIS_EXECUTION_MODE=queue|ANALYSIS_WORKER_COUNT=${ANALYSIS_WORKER_COUNT}|GCP_KMS_ENABLED=${GCP_KMS_ENABLED}|GCP_KMS_LOCATION=${REGION}|GCP_KMS_RUNTIME_ENV=${GCP_KMS_RUNTIME_ENV}|GCP_KMS_KEY_RING=${GCP_KMS_KEY_RING}|GCP_KMS_CONTENT_KEY=${GCP_KMS_CONTENT_KEY}|GCP_KMS_AUDIT_KEY=${GCP_KMS_AUDIT_KEY}|GCP_KMS_TEAM_KEY_RING=${GCP_KMS_TEAM_KEY_RING}|NEXT_SERVER_ACTION_ALLOWED_ORIGINS=${NEXT_SERVER_ACTION_ALLOWED_ORIGINS}|TRUST_PROXY=1" \
  --set-secrets="$RUNTIME_SECRETS"

SERVICE_IMAGE="$(gcloud run services describe "$WEB_SERVICE" \
  --project="$GCP_PROJECT_ID" \
  --region="$REGION" \
  --format='value(spec.template.spec.containers[0].image)')"
test -n "$SERVICE_IMAGE"

echo "==> Migrate"
gcloud run jobs deploy "$MIGRATION_JOB" \
  --project="$GCP_PROJECT_ID" \
  --region="$REGION" \
  --image="$SERVICE_IMAGE" \
  --service-account="$WORKER_SERVICE_ACCOUNT" \
  --set-cloudsql-instances="$CLOUD_SQL_INSTANCE" \
  --cpu=1 \
  --memory=512Mi \
  --tasks=1 \
  --max-retries=0 \
  --task-timeout=10m \
  --command="npm" \
  --args="run,db:migrate" \
  --set-env-vars="NODE_ENV=production" \
  --set-secrets="DATABASE_URL=${SECRET_PREFIX}database-url:latest" \
  --execute-now \
  --wait

VERIFY_SECRETS="DATABASE_URL=${SECRET_PREFIX}database-url:latest,AUTH_SECRET=${SECRET_PREFIX}auth-secret:latest,SETUP_SECRET=${SECRET_PREFIX}setup-secret:latest,ADMIN_EMAILS=${SECRET_PREFIX}admin-emails:latest,NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${SECRET_PREFIX}server-actions-key:latest,OPENAI_API_KEY=${SECRET_PREFIX}openai-api-key:latest,AUTH_RESEND_KEY=${SECRET_PREFIX}resend-key:latest,RECAPTCHA_SECRET_KEY=${SECRET_PREFIX}recaptcha-secret:latest,NOTIFICATION_ENC_KEY=${SECRET_PREFIX}notification-key:latest"
if [[ "$LIVEKIT_ENABLED" == "1" ]]; then
  VERIFY_SECRETS+=",LIVEKIT_API_KEY=${SECRET_PREFIX}livekit-api-key:latest,LIVEKIT_API_SECRET=${SECRET_PREFIX}livekit-api-secret:latest"
fi

echo "==> Verify runtime"
gcloud run jobs deploy "$VERIFY_JOB" \
  --project="$GCP_PROJECT_ID" \
  --region="$REGION" \
  --image="$SERVICE_IMAGE" \
  --service-account="$VERIFY_SERVICE_ACCOUNT" \
  --set-cloudsql-instances="$CLOUD_SQL_INSTANCE" \
  --cpu=1 \
  --memory=512Mi \
  --tasks=1 \
  --max-retries=0 \
  --task-timeout=10m \
  --command="npm" \
  --args="run,test:gcp-runtime" \
  --set-env-vars="^|^NODE_ENV=production|AUTH_URL=${AUTH_URL}|LIVEKIT_ENABLED=${LIVEKIT_ENABLED}|LIVEKIT_URL=${LIVEKIT_URL}|MAINTENANCE_CRON_AUDIENCE=${MAINTENANCE_CRON_AUDIENCE}|MAINTENANCE_CRON_SERVICE_ACCOUNT=${MAINTENANCE_CRON_SERVICE_ACCOUNT}|NEXT_SERVER_ACTION_ALLOWED_ORIGINS=${NEXT_SERVER_ACTION_ALLOWED_ORIGINS}|NEXT_PUBLIC_RECAPTCHA_SITE_KEY=${NEXT_PUBLIC_RECAPTCHA_SITE_KEY}|NEXT_PUBLIC_REALTIME_FEATURE_ENABLED=${NEXT_PUBLIC_REALTIME_FEATURE_ENABLED}|STORAGE_BACKEND=gcs|DURABLE_STATE_BACKEND=database|ANALYSIS_EXECUTION_MODE=queue|GCP_PROJECT_ID=${GCP_PROJECT_ID}|GCS_BUCKET=${GCS_BUCKET}|GCP_KMS_ENABLED=${GCP_KMS_ENABLED}|GCP_KMS_RUNTIME_ENV=${GCP_KMS_RUNTIME_ENV}|GCP_KMS_LOCATION=${REGION}|GCP_KMS_KEY_RING=${GCP_KMS_KEY_RING}|GCP_KMS_CONTENT_KEY=${GCP_KMS_CONTENT_KEY}|GCP_KMS_AUDIT_KEY=${GCP_KMS_AUDIT_KEY}|GCP_KMS_TEAM_KEY_RING=${GCP_KMS_TEAM_KEY_RING}" \
  --set-secrets="$VERIFY_SECRETS" \
  --execute-now \
  --wait

if [[ "$DEPLOY_WORKER" == 1 ]]; then
  WORKER_IMAGE="${REGION}-docker.pkg.dev/${GCP_PROJECT_ID}/${ARTIFACT_REPOSITORY}/faith-worker:${IMAGE_TAG}"
  echo "==> Build & push worker image (build region ${WORKER_BUILD_REGION})"
  gcloud builds submit . \
    --project="$GCP_PROJECT_ID" \
    --region="$WORKER_BUILD_REGION" \
    --config=cloudbuild.worker.yaml \
    --substitutions="^@^_IMAGE=${WORKER_IMAGE}@_BASE_IMAGE=${SERVICE_IMAGE}"

  PROJECT_NUMBER="$(gcloud projects describe "$GCP_PROJECT_ID" --format='value(projectNumber)')"
  WORKER_YAML="$(mktemp)"
  cat > "$WORKER_YAML" <<EOF
apiVersion: run.googleapis.com/v1
kind: WorkerPool
metadata:
  name: ${WORKER_POOL}
  namespace: "${PROJECT_NUMBER}"
  labels:
    cloud.googleapis.com/location: ${REGION}
  annotations:
    run.googleapis.com/manualInstanceCount: "${WORKER_INSTANCES}"
    run.googleapis.com/scalingMode: manual
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/cloudsql-instances: "${CLOUD_SQL_INSTANCE}"
    spec:
      serviceAccountName: ${WORKER_SERVICE_ACCOUNT}
      containers:
      - name: analysis-worker
        image: ${WORKER_IMAGE}
        command:
        - npm
        args:
        - run
        - analysis:workers
        env:
        - name: NODE_ENV
          value: "${NODE_ENV}"
        - name: STORAGE_BACKEND
          value: gcs
        - name: DURABLE_STATE_BACKEND
          value: database
        - name: GCP_PROJECT_ID
          value: "${GCP_PROJECT_ID}"
        - name: GCS_BUCKET
          value: "${GCS_BUCKET}"
        - name: ANALYSIS_EXECUTION_MODE
          value: queue
        - name: ANALYSIS_WORKER_COUNT
          value: "${ANALYSIS_WORKER_COUNT}"
        - name: ANALYSIS_WORKER_POLL_MS
          value: "1000"
        - name: GCP_KMS_ENABLED
          value: "${GCP_KMS_ENABLED}"
        - name: GCP_KMS_LOCATION
          value: "${REGION}"
        - name: GCP_KMS_RUNTIME_ENV
          value: "${GCP_KMS_RUNTIME_ENV}"
        - name: GCP_KMS_KEY_RING
          value: "${GCP_KMS_KEY_RING}"
        - name: GCP_KMS_CONTENT_KEY
          value: "${GCP_KMS_CONTENT_KEY}"
        - name: GCP_KMS_AUDIT_KEY
          value: "${GCP_KMS_AUDIT_KEY}"
        - name: GCP_KMS_TEAM_KEY_RING
          value: "${GCP_KMS_TEAM_KEY_RING}"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: ${SECRET_PREFIX}database-url
              key: latest
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: ${SECRET_PREFIX}openai-api-key
              key: latest
        - name: NOTIFICATION_ENC_KEY
          valueFrom:
            secretKeyRef:
              name: ${SECRET_PREFIX}notification-key
              key: latest
        resources:
          limits:
            cpu: "${WORKER_CPU}"
            memory: "${WORKER_MEMORY}"
EOF
  echo "==> Deploy worker pool"
  gcloud run worker-pools replace "$WORKER_YAML" --project="$GCP_PROJECT_ID"
  rm -f "$WORKER_YAML"
fi

echo "==> Promote traffic"
gcloud run services update-traffic "$WEB_SERVICE" \
  --project="$GCP_PROJECT_ID" \
  --region="$REGION" \
  --to-latest

SERVICE_URL="$(gcloud run services describe "$WEB_SERVICE" \
  --project="$GCP_PROJECT_ID" \
  --region="$REGION" \
  --format='value(status.url)')"

echo "==> Smoke ${SERVICE_URL}/api/health/auth"
curl --fail --silent --show-error --retry 5 --retry-delay 3 \
  "${SERVICE_URL}/api/health/auth"
echo
echo "==> Done. ${SERVICE_URL}"
