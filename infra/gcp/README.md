# Faith GCP 배포

기준 리전은 `asia-northeast1`(도쿄)이다. Cloud Run 요금제 Tier 1이라 서울(Tier 2)보다
저렴하고 한국에서의 지연도 실사용에 문제없는 수준이다. GitHub Actions는 검증 후
`gcloud builds submit --config cloudbuild.yaml`로 Dockerfile 이미지를 빌드해 Artifact
Registry에 저장하고, `gcloud run deploy --image`로 Cloud Run에 배포한다.
Cloud Run과 Worker Pool은 같은 버전의 Docker 이미지를 사용하며, 컨테이너 레지스트리
자격증명은 저장소에 넣지 않는다. Node.js 런타임은 Dockerfile과
`package.json`의 `engines`에 맞춰 22.x로 고정한다.

## 리소스 구성

- Cloud Run service: `faith-web-staging`, `faith-web-production`
- Cloud Run worker pool: `faith-analysis-staging`, `faith-analysis-production`
- Cloud Run migration job: `faith-migrate-staging`, `faith-migrate-production`
- Cloud Run verification job: `faith-verify-staging`, `faith-verify-production`
- Cloud SQL for PostgreSQL: 웹과 워커가 함께 사용하는 인스턴스
- Cloud Storage: 업로드 원본과 내보내기 파일
- Artifact Registry: Dockerfile로 빌드한 웹·마이그레이션·검증·워커 이미지
- Secret Manager: 앱 비밀값과 DB URL
- Cloud KMS: 팀 콘텐츠·감사 키
- Compute Engine: 선택형 LiveKit UDP/TURN 서버
- Cloud Scheduler: 팀 보존 작업 호출

기본 Worker Pool은 2 vCPU, 4 GiB 메모리의 인스턴스 1개에서
`ANALYSIS_WORKER_COUNT=2` 프로세스를 실행한다. 회의 길이·동시 분석량이 늘면
`CLOUD_RUN_WORKER_INSTANCES` 또는 메모리를 먼저 조정하고, DB 연결 수와
OpenAI/API 비용을 함께 확인한다.
Worker Pool은 Cloud Run service와 달리 `--add-cloudsql-instances` CLI
플래그가 없으므로, 배포 YAML의
`run.googleapis.com/cloudsql-instances` annotation으로 Cloud SQL Unix
socket을 연결한다. 저장소 workflow가 이 YAML을 생성해
`worker-pools replace`로 적용한다.

현재 KMS 연동은 기본 키 설정 확인과 팀별 키 프로비저닝까지 제공한다.
실제 회의 원문·감사 데이터의 envelope encryption을 완료했다고 간주하려면
저장·조회 경로에 KMS Encrypt/Decrypt 호출을 별도로 연결하고 키 회전·복구
절차를 검증해야 한다.

## GitHub 설정

GitHub Actions의 `Deploy Faith to Google Cloud` workflow를 수동 실행한다.
`staging`과 `production`은 GitHub Environment로 분리한다.
`production` Environment에는 required reviewers와 `main` 브랜치 배포
제한을 걸어 수동 승인 없는 운영 전환을 막는다.

### Repository/Environment variables

- `GCP_PROJECT_ID`
- `CLOUD_SQL_INSTANCE_CONNECTION_NAME`
- `GCP_WEB_RUNTIME_SERVICE_ACCOUNT`
- `GCP_WORKER_RUNTIME_SERVICE_ACCOUNT`
- `GCS_BUCKET`
- `FAITH_AUTH_URL`
- `AUTH_EMAIL_FROM`
- `LIVEKIT_ENABLED` (default `0`; set `1` only after the LiveKit VM and
  environment secrets are ready)
- `LIVEKIT_URL`
- `MAINTENANCE_CRON_AUDIENCE`
- `MAINTENANCE_CRON_SERVICE_ACCOUNT`
- `AUTH_GOOGLE_ID`
- `AUTH_NAVER_ID`
- `AUTH_TWITTER_ID`
- `NEXT_SERVER_ACTION_ALLOWED_ORIGINS`
- `NEXT_PUBLIC_TEAM_FEATURE_ENABLED`
- `NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY`
- `NEXT_PUBLIC_REALTIME_FEATURE_ENABLED`
- `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`
- `CLOUD_RUN_WEB_CPU` (default `1`)
- `CLOUD_RUN_WEB_MEMORY` (default `1Gi`)
- `CLOUD_RUN_WEB_MAX_INSTANCES` (default `10`)
- `CLOUD_RUN_WORKER_CPU` (default `2`)
- `CLOUD_RUN_WORKER_MEMORY` (default `4Gi`)
- `CLOUD_RUN_WORKER_INSTANCES` (default `1`)
- `ANALYSIS_WORKER_COUNT` (default `2`)
- `GCP_KMS_ENABLED` (production only; set `1` after KMS IAM verification,
  keep staging `0` until a separate non-production KMS policy is approved)
- `GCP_KMS_LOCATION` (default `asia-northeast1`)
- `GCP_KMS_KEY_RING` (default `faith-<environment>`)
- `GCP_KMS_CONTENT_KEY` (default `faith-<environment>-content`)
- `GCP_KMS_AUDIT_KEY` (default `faith-<environment>-audit`)
- `GCP_KMS_TEAM_KEY_RING` (default `faith-<environment>-teams`)

`NEXT_SERVER_ACTION_ALLOWED_ORIGINS`는 `host[:port]`를 콤마로 나눈 값이다.
`LIVEKIT_URL`과 `faith-<environment>-livekit-*` Secret은
`LIVEKIT_ENABLED=1`일 때만 필요하다. 기본값 `0`에서는 LiveKit 코드와
인프라 문서를 저장해 두되 Cloud Run 배포가 LiveKit 자격증명을 요구하지
않는다.
실제 서비스 도메인과 스테이징 도메인만 넣고, Cloud Run 기본 URL을 사용할 때는 최초
배포 후 생성된 호스트도 추가해 다시 배포한다.
`NEXT_PUBLIC_*` 값은 브라우저 번들에 빌드 시 포함되므로 GitHub Environment 변수에
넣고 workflow를 다시 실행해야 반영된다.
production 로그인·가입은 reCAPTCHA site key/secret이 모두 필요하므로,
staging과 production 도메인을 reCAPTCHA 콘솔에 각각 등록한다.

OAuth를 사용할 경우 staging과 production의 `AUTH_URL`을 각각 provider 콘솔에
등록한다. 콜백 경로는 `/api/auth/callback/google`,
`/api/auth/callback/naver`, `/api/auth/callback/twitter`이며, 테스트용
Cloud Run 기본 URL과 최종 사용자 도메인을 혼동하지 않는다.

최종 도메인은 Cloud Run domain mapping 또는 조직의 HTTPS Load Balancer/
Cloudflare 앞단에 연결하고, DNS·TLS가 확인된 뒤 `FAITH_AUTH_URL`,
`NEXT_SERVER_ACTION_ALLOWED_ORIGINS`, GCS CORS origin을 같은 환경의
도메인으로 맞춘다. `TRUST_PROXY=1`은 신뢰할 수 있는 프록시가 실제 오리진
앞에 있을 때만 사용한다.

### Repository/Environment secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`

장기 보관 JSON 서비스 계정 키를 GitHub에 업로드하지 않는다. GitHub Actions는
Workload Identity Federation으로 짧은 수명의 Google 자격만 발급받는다. 앱
비밀값은 GitHub에 저장하지 않고 Secret Manager에 둔다.
`cloudbuild.yaml`이 빌드 시 `faith-<environment>-server-actions-key`를
Secret Manager에서 일회성 secret mount로 읽고, Cloud Run은 같은 Secret
Manager 값을 런타임에 주입한다.

WIF provider를 만들 때 GitHub repository와 branch를 attribute condition으로
제한한다. 예시는 실제 저장소 값으로 바꿔 실행한다.

```bash
export PROJECT_ID="<gcp-project-id>"
export GITHUB_REPO="<github-owner>/<github-repo>"
export DEPLOY_SA="faith-github-deploy@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud iam workload-identity-pools create github \
  --project="${PROJECT_ID}" \
  --location=global \
  --display-name="Faith GitHub Actions"
gcloud iam workload-identity-pools providers create-oidc github \
  --project="${PROJECT_ID}" \
  --location=global \
  --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
  --attribute-condition="assertion.repository == '${GITHUB_REPO}' && assertion.ref == 'refs/heads/main'"
gcloud iam service-accounts add-iam-policy-binding "${DEPLOY_SA}" \
  --project="${PROJECT_ID}" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/<project-number>/locations/global/workloadIdentityPools/github/attribute.repository/${GITHUB_REPO}"
```

## 최초 GCP 준비

아래 명령은 사용자가 선택한 GCP 프로젝트에서 직접 실행한다. `<...>` 값은 실제
프로젝트·계정·도메인 값으로 바꾸며, 비밀값은 명령행에 쓰지 않는다.

```bash
export PROJECT_ID="<gcp-project-id>"
export REGION="asia-northeast1"
export REPOSITORY="faith"
export WEB_SERVICE_ACCOUNT="faith-web-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export WORKER_SERVICE_ACCOUNT="faith-worker-runtime@${PROJECT_ID}.iam.gserviceaccount.com"
export DEPLOY_SA="faith-github-deploy@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "${PROJECT_ID}"
gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  compute.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  cloudkms.googleapis.com \
  cloudscheduler.googleapis.com \
  iamcredentials.googleapis.com \
  dns.googleapis.com

gcloud artifacts repositories create "${REPOSITORY}" \
  --location="${REGION}" \
  --repository-format=docker \
  --description="Faith Docker images"

gcloud iam service-accounts create faith-web-runtime \
  --display-name="Faith web runtime"
gcloud iam service-accounts create faith-worker-runtime \
  --display-name="Faith analysis worker runtime"
gcloud iam service-accounts create faith-github-deploy \
  --display-name="Faith GitHub deploy"

for ENVIRONMENT in staging production; do
  KEY_RING="faith-${ENVIRONMENT}"
  TEAM_KEY_RING="faith-${ENVIRONMENT}-teams"
  gcloud kms keyrings create "${KEY_RING}" \
    --location="${REGION}"
  gcloud kms keys create "faith-${ENVIRONMENT}-content" \
    --location="${REGION}" \
    --keyring="${KEY_RING}" \
    --purpose=encryption
  gcloud kms keys create "faith-${ENVIRONMENT}-audit" \
    --location="${REGION}" \
    --keyring="${KEY_RING}" \
    --purpose=encryption
  gcloud kms keyrings create "${TEAM_KEY_RING}" \
    --location="${REGION}"
done
```

Cloud SQL, Cloud Storage bucket, service account IAM binding, KMS key ring, and
Workload Identity Federation provider are environment resources. Create them with
the organization's approved Terraform or GCP administration process. Do not put
their credentials in this repository.

For each environment, configure a separate bucket with uniform bucket-level access
and apply the checked-in CORS policy after adding that environment's web origin:

```bash
gcloud storage buckets update "gs://<bucket-name>" \
  --uniform-bucket-level-access \
  --public-access-prevention
gcloud storage buckets update "gs://<bucket-name>" \
  --cors-file=infra/gcp/storage-cors.json
```

If an organization requires CMEK for object storage, configure a bucket
default encryption key separately and grant the Cloud Storage service agent
`roles/cloudkms.cryptoKeyEncrypterDecrypter`. The application KMS variables
alone do not enable GCS/Cloud SQL CMEK.

### 기존 데이터 복사

DB와 객체 원본은 먼저 staging으로 복사하고, 원본을 쓰기 중지한 뒤 마지막
증분 복사를 수행한다. DB 사용자는 기존 계정과 동일하게 준비해야
`user_meeting_records.user_id` 외래키가 유지된다.

```bash
# 비밀값은 셸 명령행에 직접 쓰지 말고 별도 보안 입력/자격으로 제공한다.
# SOURCE_DATABASE_URL은 보안 환경변수 또는 입력 프롬프트로만 제공한다.
pg_dump --format=plain --no-owner --no-acl \
  --file=/secure/faith-staging.sql --dbname="${SOURCE_DATABASE_URL}"
gcloud storage cp /secure/faith-staging.sql \
  "gs://<migration-bucket>/faith-staging.sql"
gcloud sql import sql "<cloud-sql-instance>" \
  "gs://<migration-bucket>/faith-staging.sql" \
  --database=faith --project="${PROJECT_ID}"
```

Import bucket에는 Cloud SQL service agent의 `Storage Object Viewer` 권한이
필요하다. import가 끝난 뒤 dump 객체와 임시 migration bucket은 조직의
보존·삭제 정책에 따라 정리한다.

DigitalOcean Spaces 객체는 GCS에서 기존 `vault_files.key`와 같은 객체 키를
사용해야 하므로, `sync`로 삭제를 전파하지 않는 `rclone copy`를 사용한다.
`rclone.conf`와 양쪽 자격은 저장소 밖의 보안 경로에 둔다.

```bash
rclone copy "spaces:<spaces-bucket>" "faith-gcs:<gcs-bucket>" \
  --checkers=8 --transfers=4 --progress
rclone check "spaces:<spaces-bucket>" "faith-gcs:<gcs-bucket>" \
  --one-way --download
```

복사 후 객체 수, DB `vault_files` 수, 샘플 파일의 SHA-256을 비교하고,
staging에서 signed upload/download와 STT Worker 읽기를 확인한다. 검증이
끝날 때까지 기존 Spaces를 삭제하거나 쓰기 가능한 상태로 두지 않는다.

로컬 `.data`에만 남아 있는 회의 JSON과 AI 운영 로그는 전체 DB dump와
별도로 다음처럼 가져온다. 대상 DB의 users가 먼저 복원되어 있어야 하며,
명령행에 실제 비밀값을 직접 적지 않는다.

```bash
FAITH_DATA_DIR="/secure/faith-data" \
DURABLE_STATE_BACKEND=database \
DATABASE_URL="${TARGET_DATABASE_URL}" \
npm run migrate:local-durable-state
```

이 스크립트는 `user-meetings`, `ai-usage`, `pipeline-stats`를 idempotent
upsert한다. 보관함 원본은 위의 `rclone copy`로 별도 복사하고,
`vault_files.key`와 객체 키가 일치하는지 확인한다.

## Secret Manager 등록 항목

The workflow expects these Secret Manager names. Add a new version through the GCP
console or `gcloud secrets versions add` using an interactive or protected input:

```text
faith-<environment>-auth-secret
faith-<environment>-setup-secret
faith-<environment>-admin-seed-password
faith-<environment>-admin-emails
faith-<environment>-server-actions-key
faith-<environment>-database-url
faith-<environment>-openai-api-key
faith-<environment>-notification-key
faith-<environment>-resend-key
faith-<environment>-recaptcha-secret
faith-<environment>-livekit-api-key
faith-<environment>-livekit-api-secret
```

If `AUTH_GOOGLE_ID` or `AUTH_TWITTER_ID` is configured, also create the
matching `google-client-secret` or `twitter-client-secret`; the workflow adds
those mappings conditionally. Naver login is disabled in the application, so
its secret is not referenced. OAuth IDs are empty by default to disable a
provider. Korean dictionary credentials and any enabled KMS configuration
must be added before enabling those features.
The actual values are never copied into `.env.example`, this document, GitHub,
or chat.

Keep `faith-<environment>-auth-secret` stable. It signs the Auth.js JWT and is
also the fallback encryption key for MFA/sealed values; rotating it without a
planned re-enrollment and session invalidation can make existing MFA secrets
unreadable. `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` must likewise remain stable
across a rolling revision.

`ADMIN_EMAILS` is a comma-separated list stored in
`faith-<environment>-admin-emails`; it is injected into Cloud Run by the
workflow and is not required as a GitHub Environment variable.

`faith-<environment>-database-url` should use the Cloud SQL Unix socket mounted by the deploy
workflow, for example:

```text
postgresql://<db-user>:<db-password>@/faith?host=/cloudsql/<project>:<region>:<instance>&schema=public&connection_limit=5&pool_timeout=20
```

`connection_limit` is per Node.js process, not per Cloud Run service. Size it
with the web maximum instances plus both worker processes and migration/verify
jobs under the Cloud SQL connection limit; do not copy the example blindly
when the SQL tier or instance count changes.

Grant the web and worker runtime accounts only the roles needed for their path:

- Cloud SQL Client
- Storage Object User for reads, signed object operations, and the scheduled
  orphan scan (`storage.objects.list`)
- Storage Object Creator/Deleter only where the application path requires it
- Cloud KMS CryptoKey Encrypter/Decrypter on the configured key resources
- Secret Manager Secret Accessor on the named secrets
- Service Account Token Creator on the runtime service account for GCS V4
  signed URLs

The account that provisions per-team keys also needs `roles/cloudkms.admin` on
the `faith-teams` key ring. If keys are pre-provisioned by an operations job,
remove that role from the web runtime account.

The deploy account additionally needs Cloud Run deployment, Cloud Build submission,
and Service Account User permissions. The Cloud Build identity needs permission to
build and push the Docker image and to read the build-only Server Actions secret.
These identities are separate from both runtime accounts.

```bash
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" \
  --format='value(projectNumber)')"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

for ROLE in roles/run.admin \
  roles/serviceusage.serviceUsageConsumer roles/cloudbuild.builds.editor; do
  gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOY_SA}" --role="${ROLE}"
done

for BUILD_IDENTITY in "${BUILD_SA}" "${CLOUD_BUILD_SA}"; do
  for ROLE in roles/cloudbuild.builds.builder roles/logging.logWriter; do
    gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${BUILD_IDENTITY}" --role="${ROLE}"
  done
  gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
    --location="${REGION}" --project="${PROJECT_ID}" \
    --member="serviceAccount:${BUILD_IDENTITY}" \
    --role=roles/artifactregistry.writer
done
gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --location="${REGION}" --project="${PROJECT_ID}" \
  --member="serviceAccount:${DEPLOY_SA}" \
  --role=roles/artifactregistry.reader

RUN_SERVICE_AGENT="service-${PROJECT_NUMBER}@serverless-robot-prod.iam.gserviceaccount.com"
gcloud artifacts repositories add-iam-policy-binding "${REPOSITORY}" \
  --location="${REGION}" --project="${PROJECT_ID}" \
  --member="serviceAccount:${RUN_SERVICE_AGENT}" \
  --role=roles/artifactregistry.reader

for RUNTIME_SA in "${WEB_SERVICE_ACCOUNT}" "${WORKER_SERVICE_ACCOUNT}"; do
  gcloud iam service-accounts add-iam-policy-binding "${RUNTIME_SA}" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${DEPLOY_SA}" \
    --role=roles/iam.serviceAccountUser
done

# Run once for every environment whose build image is enabled. The build
# service account reads this one secret through Cloud Build secretEnv; the
# value is never written to the Docker image.
for ENVIRONMENT in staging production; do
  gcloud secrets add-iam-policy-binding \
    "faith-${ENVIRONMENT}-server-actions-key" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${BUILD_SA}" \
    --role=roles/secretmanager.secretAccessor
  gcloud secrets add-iam-policy-binding \
    "faith-${ENVIRONMENT}-server-actions-key" \
    --project="${PROJECT_ID}" \
    --member="serviceAccount:${CLOUD_BUILD_SA}" \
    --role=roles/secretmanager.secretAccessor
done
```

`WEB_SERVICE_ACCOUNT`에는 GCS Signed URL 발급을 위해 자기 자신에 대한
`roles/iam.serviceAccountTokenCreator`도 부여한다. 웹·워커 런타임 계정에는
Cloud SQL Client, 필요한 버킷의 Storage Object User, 사용 시 KMS
CryptoKey Encrypter/Decrypter와 Secret Manager Secret Accessor만 부여한다.

## 운영 데이터 보호 기본값

- production Cloud SQL은 자동 백업, point-in-time recovery, 삭제 방지,
  유지보수 창을 켜고 가능하면 regional high availability를 사용한다.
- staging과 production은 Cloud SQL 인스턴스, 데이터베이스, GCS 버킷,
  KMS key ring, LiveKit 고정 IP를 공유하지 않는다.
- GCS 버킷은 uniform bucket-level access와 public access prevention을 켜고,
  객체 버전 관리·보존 기간·비용 알림을 조직 정책에 맞춰 설정한다.
- Secret Manager 새 버전 발급 후에는 Cloud Run revision을 재배포해
  `:latest` 참조가 새 인스턴스에 반영됐는지 확인한다. Server Actions 키는
  Cloud Build와 Cloud Run이 같은 Secret Manager 값을 사용한다.
- Artifact Registry에는 오래된 worker 이미지 정리 정책을 두되, 현재
  revision과 롤백 대상 이미지는 보존한다.
- Cloud Run, Cloud SQL, GCS, LiveKit VM에 오류율·CPU·메모리·디스크·DB
  연결 수·분석 대기열 지연 알림을 만든다. OpenAI와 GCP 비용 예산 알림도
  별도로 설정한다.

## Cloud Scheduler 보존 작업

The web service is public for the normal application path, but the maintenance
route validates a Google OIDC ID token from a dedicated Scheduler service
account. The same job purges expired team records, audit logs, and GCS objects
left behind by an unfinished signed upload (24-hour grace period, maximum 500
objects per run). Set these GitHub Environment variables for each environment:

- `MAINTENANCE_CRON_AUDIENCE`: the exact maintenance route URL
- `MAINTENANCE_CRON_SERVICE_ACCOUNT`: the dedicated Scheduler service account
  email

```bash
ENVIRONMENT="staging"
SCHEDULER_SA="faith-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
AUDIENCE="https://<web-host>/api/internal/maintenance/team-retention"
JOB_NAME="faith-${ENVIRONMENT}-team-retention"

gcloud scheduler jobs create http "${JOB_NAME}" \
  --location="${REGION}" \
  --schedule="15 3 * * *" \
  --time-zone="Asia/Seoul" \
  --uri="${AUDIENCE}" \
  --http-method=POST \
  --oidc-service-account-email="${SCHEDULER_SA}" \
  --oidc-token-audience="${AUDIENCE}"
```

Grant the Cloud Scheduler service agent permission to mint tokens for this
dedicated account, and do not reuse the deploy or web runtime account:

```bash
PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding "${SCHEDULER_SA}" \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

`MAINTENANCE_CRON_SECRET` remains an optional break-glass/local fallback. Do
not put that value in the repository or GitHub variables.

## Local and staging order

1. Keep local development on `STORAGE_BACKEND=local`, local PostgreSQL, and
   `GCP_KMS_ENABLED=0`.
2. Run the workflow for `staging` with a separate Cloud SQL database and bucket.
3. The workflow creates the web revision with no traffic, runs the one-task
   `faith-migrate-<environment>` Cloud Run Job, runs
   `faith-verify-<environment>` against the same DB, deploys the analysis Worker
   Pool, and only then promotes the web revision. The jobs use the same image as
   the web revision and the Cloud SQL Unix socket.
   If `deploy_worker=false` is selected for a web-only rollout, an already
   deployed and active Worker Pool is still required because the web service
   remains in queue execution mode.
4. Run the critical-path checks from the 8월 1일 operations document.
5. Copy existing database and object data into staging, compare counts and hashes,
   and keep the source untouched.
6. Deploy `production` only after login, upload, queued analysis, team access,
   downloads/exports, retention, and LiveKit checks pass.

## Rollback

Cloud Run revisions remain available after deployment. Keep the previous revision
until the new web and worker paths have passed the smoke tests. If a cutover fails,
use `gcloud run services update-traffic` to return web traffic to the previous
revision, set the new Worker Pool instance count to zero, and investigate data
differences before retrying.
