# GCE LiveKit

LiveKit은 WebRTC UDP/TURN 포트가 필요하므로 Cloud Run에 넣지 않고 별도
Compute Engine VM에서 실행한다. VM에는 고정 외부 IP를 붙이고 `rtc.<domain>`과
`turn.<domain>`을 모두 해당 IP로 지정한다.

## 네트워크

`create-firewall.sh`는 다음 공개 포트를 VM 태그 `faith-livekit`에 연다.

- TCP `80`, `443`: Caddy TLS 발급과 HTTPS/TURN-TLS
- TCP `7881`: WebRTC TCP fallback
- UDP `443`, `3478`: TURN/UDP 및 호환성 경로
- UDP `50000-60000`: LiveKit WebRTC 미디어

SSH는 공개 방화벽 규칙에 넣지 않고 IAP 또는 조직의 관리망을 사용한다.

## 설치

1. 도쿄 리전(`asia-northeast1`) 고정 IP와 Ubuntu GCE VM(기준 4 vCPU, 8 GiB)을 만든다.
   Cloud Run/SQL/GCS와 같은 리전에 둬야 리전 간 트래픽 비용이 없다.
   예시는 조직의 프로젝트·서브넷 정책에 맞춰 조정한다.

```bash
export PROJECT_ID="<gcp-project-id>"
gcloud compute addresses create faith-livekit-ip \
  --region=asia-northeast1 --project="${PROJECT_ID}"
gcloud compute instances create faith-livekit \
  --zone=asia-northeast1-a \
  --machine-type=e2-custom-4-8192 \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --address=faith-livekit-ip \
  --tags=faith-livekit \
  --project="${PROJECT_ID}"
```

2. 로컬에서 `create-firewall.sh`를 실행한다.
3. DNS에서 `rtc.<domain>`과 `turn.<domain>`을 VM 고정 IP로 연결한다.
4. VM에서 기준 버전을 고정해 실행한다. 처음 설치할 때 생성한
   `livekit.yaml`이 있으면 스크립트가 다시 생성하지 않아 API 자격이
   덮어써지지 않는다. 공급망을 더 엄격히 고정할 때는 generator 이미지
   digest를 함께 지정한다.

```bash
LIVEKIT_VERSION=v1.13.4 \
LIVEKIT_GENERATOR_IMAGE=livekit/generate@sha256:<digest> \
DOMAIN=rtc.<domain> bash setup-on-gce.sh
```

5. Caddy 인증서 발급과 `docker compose ps` 상태를 확인한다.
6. 생성된 `livekit.yaml`의 API key/secret을 각 환경의
   `faith-<environment>-livekit-api-key`,
   `faith-<environment>-livekit-api-secret` Secret Manager에 넣고,
   웹 서비스에 `LIVEKIT_URL=wss://rtc.<domain>`로 연결한다.

API secret과 생성 파일은 GitHub나 이 저장소에 복사하지 않는다.
VM 디스크 스냅샷 또는 별도 보안 백업으로 `livekit.yaml`, Caddy 설정,
Redis 설정을 보관하고, Cloud Monitoring에 CPU·디스크·연결 실패 알림을
추가한다. 단일 VM은 장애 시 음성 회의가 중단되는 구조이므로, 운영 전
복구 절차와 재프로비저닝 시간을 확인한다.
