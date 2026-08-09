# L4 온디맨드 실행 기록

확인일: 2026-08-04

## 원하는 운영 형태

- Cloud Run Job 정의와 컨테이너 이미지는 평소 그대로 둔다.
- `tasks=1`, `parallelism=1`, L4 1개로 시작한다.
- 실행 요청이 있을 때만 인스턴스가 생기고, 프로세스 종료 뒤 인스턴스도 종료된다.
- 결과 manifest를 GCS에 먼저 쓴 뒤 정상 종료한다.
- 실행 실패 시 CPU로 조용히 fallback하지 않는다.

Job 정의를 유지하는 것은 L4를 계속 켜 두는 것이 아니다. GPU 비용은 Job 실행
인스턴스의 수명 동안만 발생한다. 반대로 Job 정의를 유지해도 특정 zone의 물리 L4를
예약하는 것은 아니므로, 실행 시점의 가용 용량 부족 가능성은 남는다. 쿼터는 사용할 수
있는 상한이고 물리 용량 예약이 아니다.

## 현재 프로젝트 확인 결과

프로젝트: `project-e80b5533-27b9-4476-9a4`

- Cloud Run 비존 중복 L4 Job을 `asia-southeast1`, `europe-west1`,
  `europe-west4`, `us-east4`, `us-central1`에서 정의하려 했으나 모두 배포 전에
  같은 quota 오류로 거절됐다. 실행 인스턴스가 만들어지지 않았으므로 GPU 비용은 없다.
- Cloud Quotas의
  `NvidiaL4GpuAllocNoZonalRedundancyPerProjectRegion`은 현재
  `NOT_ENOUGH_USAGE_HISTORY`로 증액 부적격 상태다.
- Compute Engine도 `GPUS_ALL_REGIONS=0`, 확인한 모든 리전의
  `NVIDIA_L4_GPUS=0`이다. 따라서 Compute Engine G2로 우회할 수도 없다.
- Cloud Run 문서는 첫 배포 시 비존 중복 L4 3개 자동 부여를 설명하지만, 실제
  프로젝트에는 자동 부여가 적용되지 않았다. 문서상 가능 여부보다 현재 quota API와
  배포 결과를 실행 근거로 삼는다.

## 쿼터 승인 뒤 생성할 Job

- 우선 리전: 데이터와 이미지가 있는 `asia-southeast1`
- GPU: `nvidia-l4` 1개
- 최소 자원: 4 vCPU, 16 GiB
- `--no-gpu-zonal-redundancy`
- `tasks=1`, `parallelism=1`, `max-retries=0`
- 서비스 계정: `faith-speech-model-lab` 최소 권한 계정
- idle 인스턴스/서비스 최소 인스턴스: 0

쿼터가 승인되면 먼저 4분 43초 1인 fixture로 CUDA·드라이버·모델 호환성과 실제
RTF를 확인한다. 이 smoke run이 1명 판정을 유지해야만 18~20분 hard-set으로 넓힌다.

