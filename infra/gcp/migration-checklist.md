# GCP 전환 검증 체크리스트

## 스테이징

- [ ] 별도 Cloud SQL 데이터베이스와 GCS 버킷을 만들었다.
- [ ] `prisma migrate deploy`가 `user_meeting_records`, `ai_usage_events`,
  `pipeline_attempts`까지 적용됐다.
- [ ] 기존 로컬 JSON/JSONL을 원본 보존 상태로 두고
  `npm run migrate:local-durable-state`로 복사했다.
- [ ] `npm run test:gcp-runtime`이 통과했다.
- [ ] Cloud Run 웹 서비스의 `STORAGE_BACKEND=gcs`,
  `DURABLE_STATE_BACKEND=database`를 확인했다.
- [ ] signed upload 중단으로 남은 GCS 고아 객체 정리 결과와 grace period를
  확인했다.
- [ ] 로그인, 파일 업로드/다운로드, 업로드 분석 대기열, Worker 완료,
  회의 상세/대화기록, 회의 내보내기를 확인했다.
- [ ] 팀 멤버·관리자·마스킹 권한과 보존 작업을 확인했다.
- [ ] GCE LiveKit TLS, WebRTC UDP, TURN/TLS 연결을 확인했다.

## 데이터 비교

- [ ] 사용자별 회의 수를 원본과 Cloud SQL에서 비교했다.
- [ ] 회의 ID, 단계, 제목, 전사/타임라인 JSON의 필드 누락을 비교했다.
- [ ] GCS 객체 수와 DB `vault_files` 수를 비교했다.
- [ ] 샘플 파일의 바이트 수와 SHA-256을 원본/스테이징에서 비교했다.
- [ ] AI 사용량과 파이프라인 시도 건수를 기간별로 비교했다.
- [ ] 불일치가 있으면 원본을 수정하지 않고 import 로그와 실패 레코드만 조사했다.

## 운영 전환

- [ ] production GitHub Environment의 WIF, 변수, Secret Manager 참조를 확인했다.
- [ ] production용 Cloud SQL, GCS, KMS, LiveKit을 staging과 분리했다.
- [ ] Cloud Scheduler 팀 보존 작업을 dry-run으로 한 번 실행했다.
- [ ] 새 Cloud Run revision은 migration·runtime 검증·Worker 배포 후에만
  traffic으로 승격됐다.
- [ ] 새 Cloud Run revision을 확인하고 이전 revision을 롤백 대상으로 남겼다.
- [ ] 사용자 도메인에서 Server Actions, OAuth callback, 파일 CORS를 확인했다.
- [ ] 전환 후 첫 보존 작업과 첫 분석 Worker 작업의 로그를 확인했다.

## 롤백 기준

- 로그인/업로드/분석/열람 중 하나라도 실패하면 production 트래픽을 이전
  revision으로 되돌린다.
- 데이터 불일치가 있으면 새 import를 중단하고 원본과 Cloud SQL을 보존한다.
- Worker만 문제가 있으면 새 Worker Pool을 중지하고 분석 작업을 재시도 가능한
  상태로 둔다.
- GCS 고아 정리가 실패하면 삭제 작업만 중단하고 DB `vault_files`와
  원본 객체를 보존한 채 다음 실행에서 재시도한다.
