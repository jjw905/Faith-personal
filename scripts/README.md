# 개발·운영 스크립트

모든 명령은 저장소 루트에서 실행한다. 일상적으로 쓰는 명령은 `package.json`의 `npm run` 별칭을 우선한다.

## 진입점

| 목적 | 명령 |
|---|---|
| 로컬 개발 환경 | `npm run dev`, `npm run dev:local`, `npm run dev:stop` |
| 로컬 DB·관리자 준비 | `npm run db:up`, `npm run db:admin` |
| 타입·정적 검사 | `npm run typecheck`, `npm run lint`, `npm run security:secrets` |
| 배포 | `npm run deploy:gcp:staging`, `npm run deploy:gcp:production` |
| 분석 워커 | `npm run analysis:worker`, `npm run analysis:workers` |
| 팀·권한·마스킹 회귀 검사 | `npm run test:team`, `npm run test:team:launch`, `npm run test:masking` |

## GCP 빠른 선택 배포

기본 배포는 웹 이미지·마이그레이션·런타임 검증·분석 워커를 모두 실행한다. 필요한 구성만 `--only`로 고르면 불필요한 Cloud Build와 Cloud Run 단계를 건너뛴다.

```bash
# 웹만 (코드 검증까지 포함)
bash scripts/deploy-gcp-docker.sh staging --only=web

# 웹만 빠르게 (이미 검증한 커밋을 재배포할 때)
bash scripts/deploy-gcp-docker.sh staging --only=web --skip-validate

# 워커 이미지만 교체
bash scripts/deploy-gcp-docker.sh staging --only=worker --skip-validate

# 기존 웹 이미지로 마이그레이션과 런타임 검증만 실행
bash scripts/deploy-gcp-docker.sh staging --only=migrate,verify --skip-validate
```

웹과 워커는 각각 환경별 Artifact Registry 캐시 태그(`staging-cache`, `production-cache`)를 사용하고, 웹 업로드에서는 `ml/`, 워커 업로드에서는 애플리케이션 전체를 제외한다. 첫 빌드는 캐시가 없어도 정상적으로 진행되며 이후 같은 계열의 빌드가 빨라진다.

로컬 비밀값은 저장소 밖의 `FAITH_LOCAL_SECRETS_DIR`(기본: `/Users/905jjw/Library/Application Support/Faith-web`)에 둔다. `npm run dev`, `npm run dev:local`, 관리자 시드는 외부 파일을 자동으로 주입하며, 임의의 명령은 `scripts/with-local-secrets.sh -- ...`를 통해 실행한다.

## 파일 역할

- `ensure-*`, `setup-*`, `run-*`, `deploy-*`, `stop-*`: 로컬 환경·운영 진입점이다. 호출 순서와 실행 위치를 바꾸지 않는다.
- `migrate-*`, `seed-*`, `rebuild-*`: 데이터 변경 가능성이 있는 유지보수 도구다. 입력과 대상 범위를 먼저 확인한다. `rebuild-meeting-structure.ts`는 `MEETING_ID`와 명시적 `--write`가 필요하다.
- `test-*`, `verify-*`, `smoke-*`: 재현 가능한 회귀 검사다. 새 기능의 핵심 동작은 여기 또는 패키지 명령으로 연결한다.
- `eval-*`, `check-*`, `diagnose-*`, `compare-*`, `benchmark-*`, `stt-*`: 실험·품질 측정 도구다. API 호출, `.data/` 입력, 실행 비용을 각 파일의 머리말에서 확인한 뒤 수동 실행한다.
- `lib/`: 여러 스크립트가 공유하는 판정·CER 유틸리티다. 단일 실험의 결과물을 이곳에 넣지 않는다.
- Python 문서 생성 도구는 `Faith-office/05_제출_보고서/` 산출물을 만들 때만 사용한다. 산출물 자체는 버전 관리 대상이 아니다.

## 정리 규칙

- 기계별 경로, 특정 회의 ID, 일회성 로그에만 의존하는 코드는 추적된 `scripts/`에 남기지 않는다. 재사용할 필요가 있으면 입력을 인수·환경변수로 일반화하고 사용법을 기록한다.
- 보존할 필요가 없는 개인 실험은 `.local-wip/`에 둔다. 이 폴더는 Git 백업에 포함되지 않으므로, 보존할 코드는 먼저 별도 브랜치나 커밋으로 남긴다.
- 실행 결과·캐시·원시 회의 데이터는 `.data/`에 두고 소스와 함께 커밋하지 않는다.
- 새 스크립트가 반복 실행될 예정이면 `npm run` 별칭 또는 이 문서의 진입점 표에 추가한다.
