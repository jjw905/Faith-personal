# 화자분리·표면 전사 실험 사건 원장 — 역사적 근거 보존본

> 운영 기준은 [Faith Community-1 화자분리 튜닝 파일럿](faith-stt-diarization-pilot.md)이다. 이 파일은 과거 실행 수치·재현 근거만 보존하며, 새 파일럿의 gold·평가 기준을 정의하지 않는다.

> 이 문서는 [회의 분석 안정화 및 배포 기록](archive/meeting-analysis-remediation-2026-08-03.md)의 보충 원장이다. 기존 문서가 문제와 조치의 흐름을 남긴다면, 이 문서는 **무엇을 어떤 값으로 돌렸는지, 결과가 어느 단계의 결과인지, 아직 실행하지 않은 계획은 무엇인지**를 보존한다. 원본 음성·전문·비밀값은 이 문서에 복제하지 않는다.

## 읽는 법과 증거 등급

| 표기 | 뜻 | 이 문서에서 허용하는 결론 |
|---|---|---|
| `RUN` | 불변 실행 manifest 또는 저장 산출물로 확인 | 해당 fixture와 해당 설정에서만 결과를 말할 수 있음 |
| `CACHE` | API/모델을 새로 돌리지 않은 캐시 재평가 | 비용 없는 회귀 판단은 가능하나 새 실행 성능 주장은 불가 |
| `CODE` | 현재 소스와 로컬 회귀 테스트로 확인 | 구현 규칙은 확인했으나 실제 재분석/배포 효과는 별도 증거 필요 |
| `DIAGNOSIS` | 채팅에서 제기한 가설을 코드·산출물로 분해한 결과 | 원인 후보와 다음 실험을 말할 수 있으나 해결 완료로 표기하지 않음 |
| `PLAN` | 합의된 수집·튜닝 방향 | 아직 데이터·GPU·학습 결과가 아님 |

### 보존 원칙

1. 실행의 진실원천은 `.data/stt-bench/model-lab/runs/<run-id>.json`의 불변 manifest다. 생성 보고서와 Markdown은 다시 만들 수 있는 파생물이다.
2. 한 결과에 반드시 `raw-model`과 `product-postprocessed`를 구분한다. 화자 수가 같아도 서로 다른 단계의 값일 수 있다.
3. `외부 모델 API 사용 여부`, `임대 클라우드에서의 처리 여부`, `audioSentExternally`는 서로 다른 필드로 기록한다. 하나로 "로컬" 또는 "오픈소스"라고 뭉뚱그리지 않는다.
4. 모델·revision·임계값·입력 fixture·정답 버전·허용 오차·후처리·실행 사양·비용·판정을 한 묶음으로 보존한다. 값 하나를 바꾸면 같은 run을 덮어쓰지 않고 새 manifest를 만든다.
5. 채팅에서 나온 방향은 실제 실행과 구분했다. 아래의 `PLAN`은 유용한 결정 기록이지만, 성능 결과나 배포 상태가 아니다.

## 채팅 대조 결과 요약

| 사건 | 대조한 질문/우려 | 확인된 결론 | 현재 상태 |
|---|---|---|---|
| `EVT-01` | KTV에서 이름·직함·싱크·01:55 화자 소유가 반복해서 흔들림 | 한 모델 실패가 아니라 PRIMARY STT, 이름 소유권, 경계, word timing의 복합 실패 | `RUN` + `DIAGNOSIS` |
| `EVT-02` | Community-1과 다른 오픈 모델을 비교해 화자분리를 높일 수 있는가 | KTV 한 편에서는 임계값마다 trade-off가 있고, 단일 임계값 채택은 금지 | `RUN` |
| `EVT-03` | Community-1을 더 모르는 영상에서도 확정할 수 있는가 | 2개 미지 fixture 중 1개 실패. 단독 확정 보류 | `CACHE` + `RUN` |
| `EVT-04` | 한 명인데 사람과 `발화`가 두 명으로 보임 | 확정 1인에서는 `발화`가 별도 사람이 아니라 표시 fallback. 모델 과분리와 분리해 고침 | `RUN` + `CODE` |
| `EVT-05` | 겹침 발화는 어떻게 대응할 것인가 | 현재 정렬용 출력이 배타적 화자 구간을 우선해 겹침 정답을 보존하지 못함 | `CODE` + `DIAGNOSIS` |
| `EVT-06` | 표면 오류를 줄이고 Whisper/OpenAI API를 낭비 없이 쓸 수 있는가 | PRIMARY 원문을 고정하고 의심 구간만 별도 근거로 재검증해야 함 | `CACHE` + `DIAGNOSIS` |
| `EVT-07` | L4를 필요할 때만 쓸 수 있는가 | 현재 quota 0으로 GPU 실행은 한 번도 시작되지 않음. 온디맨드 정의만 계획됨 | `RUN` + `PLAN` |
| `EVT-08` | L4를 필요할 때만 쓸 수 있는가 | 현재 quota 0으로 GPU 실행은 한 번도 시작되지 않음. 온디맨드 정의만 계획됨 | `RUN` + `PLAN` |
| `EVT-09` | 100시간 튜닝 데이터는 어떤 조합으로 모아야 하는가 | 자연 복합·집중 진단·깨끗한 기준을 함께 모으는 방향. 아직 수집/학습 미실행 | `PLAN` |
| `EVT-10` | 72%에서 멈추고 실패한 분석이 실제로 죽은 것인가 | status GET의 stale 판정이 실행 중 작업을 error로 바꾼 가짜 실패. heartbeat·queue·진행률 계약을 분리 | `RUN` + `CODE` |
| `EVT-11` | 1배 자동 화자분리 정책을 어떤 entitlement·차감값으로 적용했는가 | Pro 이상은 precision 자동 적용, 실제 오디오 1분을 1분 차감. DB 사용량 검증과 단위경제성은 별도 미완료 | `CODE` + `RUN` |
| `EVT-12` | M4A/MP4를 모두 FLAC으로 바꾸면 품질이 좋아지는가 | 원본 보존과 분석·재생 파생본을 분리해야 함. MP3→M4A는 seek 개선만 확인했고 STT 향상은 확인하지 못함 | `RUN` + `DIAGNOSIS` + `PLAN` |
| `EVT-13` | 배포가 성공해도 어떤 소스와 polling 설정으로 실행됐는가 | 1초 polling은 Cloud Build 429를 만들었고 dirty source는 HEAD tag와 불일치할 수 있음 | `RUN` + `CODE` |
| `EVT-14` | 팀원이 공유 음성을 재생하지 못하고 Range가 대용량에서 비싼 사건 | 회의 접근권한 endpoint와 1MiB AES-GCM v2를 적용했지만 KMS/GCS 실계정 검증은 남음 | `RUN` + `CODE` |
| `EVT-15` | Worker·secret loader가 로컬에서 서로 다른 이유로 시작하지 않은 사건 | top-level await/CommonJS, `server-only` 조건, shell식 `.env` 파싱을 각각 수정하고 로컬 smoke를 통과 | `RUN` + `CODE` |
| `EVT-16` | 2026-08-05 파일럿 intake에서 어떤 값으로 무엇을 모았는가 | 공식 19건·5.57시간의 16kHz mono FLAC 파생본만 확보. 원본 보존·권리·골드 승격 전이라 별도 수집 세션으로 handoff | `RUN` + `PLAN` |

## 공통 실험 계약

### KTV 기준 fixture

| 항목 | 고정값 |
|---|---|
| fixture | `ktv-briefing-20251231` |
| 기준 길이 | 704.34초 (11분 44초) |
| 정답 | Clova 절대 화자 전환 17 turns / 16 boundaries / 8명 |
| 경계 판정 | 시작 시각 ±2초, 1:1 매칭, precision·recall·F1 모두 기록 |
| 핵심 구간 | 01:55 호명→자기소개, 03:13·04:55·08:13 짧은 경계 |
| 금지 | 이름·언론사·특정 기자를 하드코딩해 모델 점수를 올리는 것 |

KTV는 재현에는 매우 좋지만 모델 선택의 유일한 정답이 될 수 없다. 한 fixture에서 화자 수와 F1이 좋아도, 장거리 재등장·겹침·새로운 장소·다른 마이크를 보장하지 않는다.

### 서버 실행의 공통 기록값

2026-08-04의 서버 모델 실험은 로컬 음성 추론이 아니라 GCP Cloud Run Job에서 수행했다. 확인된 CPU 실행은 `asia-southeast1`, `8 vCPU / 32 GiB`, task 1·parallelism 1·max-retries 0으로 시작했고, 새 음성 입력은 임대 서버에서 처리했다. 모델 실행은 유료 모델 API를 호출하지 않았지만, 아래 **개인정보/provenance 주의**처럼 cloud 처리 여부는 manifest마다 다시 확인해야 한다.

## EVT-01 — KTV 반복 실행에서 표면 오류·화자 소유·싱크가 함께 흔들린 사건

**상태:** `RUN` + `DIAGNOSIS` · **대상 실행:** `mtg-up-8f702480` · **분석 모드:** `gpt-transcribe/precision`

### 관찰값

- PRIMARY 원문 단계부터 `2기 홍보수통 수석`, `유시스 운영록`, `그러세요`가 나타났고 `김영록`은 생성되지 않았다. 이 항목은 요약/화면 오류가 아니라 PRIMARY STT 실패로 분류한다.
- `유시스 → 뉴시스`만 확정 언론사 목록에 의한 제한 후처리로 바뀌었다. 이것은 이 fixture에서의 **고정 철자 보정 결과**이며, 다른 낱말을 학습해 일반화한 결과가 아니다. 인명은 오교정 위험 때문에 같은 방식으로 자동 치환하지 않았다.
- 01:55에서 진행자의 "이성택 기자님" 호출 줄에는 `이성택 기자`가 붙고, 바로 뒤 기자 자기소개 줄은 `화자 C`로 남았다. 즉, 호명한 진행자에게 상대방 이름이 붙고 실제 자기소개 화자는 무명으로 남는 **이름 소유권 실패**가 발생했다.
- word timing은 38개 줄 중 37개에 있고 역전은 0건이었다. 전역적인 시간 지연 증거는 없었고, 체감 싱크는 word timing이 없는 한 줄과 인식 단어 불일치로 생긴 국소 공백으로 분류했다.

### 보존할 설정과 결과

| 필드 | 값 |
|---|---|
| PRIMARY 모델 / 모드 | `gpt-transcribe` / `precision` |
| 비교 모수 | 같은 원본의 `gpt-transcribe/precision` 7회 |
| 정답 기준 | 8명, 16 boundaries, 허용 오차 2초 |
| 최신 실행 최종 화자 수 | 9명 |
| 최신 실행 경계 | predicted 17 / matched 13 / gold 16, precision 0.765, recall 0.813, F1 0.788 |
| 최신 실행 단어 시간 | 37/38, coverage 0.974, reversed 0 |
| 7회 평균 | first handoff 0.714, mean boundary F1 0.681, word timing coverage 0.979 |
| 7회 PRIMARY 표기 정답률 | 홍보소통 직함 0, 뉴시스 0, 김영록 0 |
| 7회 최종 `뉴시스` 정답률 | 0.286 — 제한 후처리 효과만 포함 |

### 원인 분리와 후속 결정

| 단계 | 현재 판정 | 다음 조치 |
|---|---|---|
| PRIMARY STT | 직함·기관·인명·말끝 오류가 이미 원문에 존재 | 전체 파일 재전사 대신, 저신뢰/고유명사 의심 8~10초 구간만 독립 재전사 |
| 이름 매핑 | 호명자와 자기소개자의 이름 소유권이 뒤바뀜 | 호명은 진행자 턴으로 고정하고, 언론사+자기소개 바로 뒤 발화에만 이름을 결합하는 결정 검증 |
| 화자 경계 | 짧은 호명/자기소개가 음향·문맥 단계에서 흔들림 | 모델 A/B와 별도로 해당 전환을 독립 gate로 유지 |
| 시간 결합 | 빈 word 배열이 줄 시작 시각만 남김 | word 없음 또는 앵커 불일치 줄만 국소 재정렬 |

**아직 하지 않은 것:** 특정 인명 사전 하드코딩, 전체 파일 WhisperX 강제정렬 재도입, 어떤 한 번의 KTV 재실행만으로 해결 선언.

## EVT-02 — CPU 화자분리 모델·임계값 스윕: 빠른 Sherpa와 정밀 Community-1의 trade-off

**상태:** `RUN` · **입력:** KTV 704.34초 · **평가:** raw와 제품 후처리 결과를 모두 보존

### Community-1 기준 실행

| 필드 | 값 |
|---|---|
| run id | `20260804T0358-community1-cpu-r2` |
| 모델 / revision | `pyannote/speaker-diarization-community-1` / `3533c8cf8e369892e6b79ff1bf80f7b0286a54ee` |
| 장치·런타임 | CPU, Python 3.11.13, Torch 2.8.0+cu126 |
| 서버 | Cloud Run Job, `asia-southeast1`, 8 vCPU / 32 GiB |
| 원시/제품 화자 수 | 8 / 8 |
| KTV 경계 F1 | 0.769 |
| wall / inference / RTF | 691.366초 / 687.447초 / 0.982 |
| 추정 실행비 | USD 0.143804, paid API `false` |
| 라이선스 기록 | CC-BY-4.0 |

이 실행은 KTV의 세 핵심 전환을 통과한 비교 기준이었으나, CPU에서 거의 실시간 길이만큼 걸린다. 따라서 **CPU 생산 기본값으로 승격하지 않았고**, GPU 재비교와 미지 fixture 평가 전의 정확도 기준선으로만 남긴다.

### ERes2Net + pyannote segmentation 3.0 스윕

| threshold | 원시 화자 수 | 제품 후처리 화자 수 | 경계 F1 | wall | RTF | 추정 비용 |
|---:|---:|---:|---:|---:|---:|---:|
| 0.800 | 14 | 10 | 0.743 | 86.861초 | 0.123 | USD 0.018014 |
| 0.825 | 13 | 9 | 0.813 | 85.564초 | 0.121 | USD 0.018014 |
| 0.850 | 11 | 8 | 0.813 | 86.152초 | 0.122 | USD 0.018014 |
| 0.875 | 11 | 8 | 0.813 | 85.948초 | 0.122 | USD 0.018014 |
| 0.900 | 11 | 8 | 0.813 | 86.125초 | 0.122 | USD 0.018014 |

공통 설정은 `sherpa-onnx 1.13.4`, CPU 8 threads, Python 3.11.15, 같은 Cloud Run CPU 사양이다. manifest의 개별 스윕 기록에는 총 433.019초가 남고, 기존 운영 문서의 447.7초는 준비·집계까지 포함한 end-to-end 관측치다. 범위가 다르므로 둘을 같은 비용 또는 같은 RTF로 합산하지 않는다.

**판정:** 0.85~0.90이 KTV에서 8명을 만들었다고 해서 최적 임계값이 아니다. 01:55 핵심 전환 실패가 남고, 설정마다 segmentation/embedding을 처음부터 반복한 구조라 임계값만의 비교 비용도 과대하다. 이후 스윕은 segmentation·embedding을 캐시하고 clustering threshold만 재적용해야 한다.

### CAM++가 보여 준 임계값의 한계

| 필드 | 값 |
|---|---|
| 모델 | `sherpa-pyannote-segmentation-3.0+3D-Speaker-CAM++` |
| version | `sherpa-onnx-1.13.4` |
| segmentation | `sherpa-onnx-pyannote-segmentation-3-0/model.onnx` |
| embedding | `3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx` |
| CPU 설정 | 8 threads, Cloud Run 8 vCPU / 32 GiB, Python 3.11.15 |
| 0.800 | raw 10, 제품 9, F1 0.737, 01:55 실패, wall 63.464초 |
| 0.850 | raw 8, 제품 7, F1 0.903, 핵심 전환 통과, wall 58.903초 |
| 총 스윕 | 0.750/0.800/0.850/0.900/0.950, 315.899초 |
| 미세 스윕 | 0.810/0.820/0.830/0.840/0.845, 340.491초 |

0.83~0.845는 KTV 화자 수 8에 닿았지만 01:55를 틀렸고, 0.85는 핵심 전환을 맞추는 대신 실제 기자 둘을 하나로 합쳐 제품 7명이 됐다. 따라서 **단일 threshold 패치는 금지**하며, CAM++는 Community-1과의 불일치 구간을 찾는 보조 신호로만 남긴다. raw 화자 수와 제품 화자 수가 다르므로 둘 중 하나만 보고 모델을 고르면 안 된다.

## EVT-03 — Community-1 미지 영상 일반화 평가에서 단독 확정을 보류한 사건

**상태:** `CACHE` + `RUN` · **생성 보고서:** `.data/stt-bench/model-lab/community1-generalization.md`

이 평가는 KTV 모델 선택에 쓰지 않은 Clova 절대 화자 시각 fixture만 사용하고, API·새 모델 추론 없이 기존 immutable manifest를 다시 채점한다. 통과 조건은 아래 다섯 가지를 **동시에** 만족하는 것이다.

| gate | 값 |
|---|---:|
| 화자 수 | 정답과 정확히 일치 |
| 경계 허용 오차 | 2초 |
| 경계 재현율 | 0.80 이상 |
| 경계 F1 | 0.75 이상 |
| 1:1 화자 정확도 | 0.90 이상 |
| 유료 API | 사용하지 않음 |

| fixture | 정답/예측 화자 | 경계 F1 / recall | 1:1 정확도 / cluster 순도 | wall / inference | 추정 비용 | 판정 |
|---|---:|---:|---:|---:|---:|---|
| `brief-startup` (900.003초) | 8 / 7 | 0.615 / 1.000 | 0.977 / 0.977 | 546.933초 / 540.268초 | USD 0.113762 | 실패 |
| `brief-mou` (272.256초) | 5 / 5 | 0.765 / 0.929 | 0.991 / 0.991 | 205.897초 / 197.958초 | USD 0.042827 | 통과 |

공통 모델은 Community-1 revision `3533c8cf8e369892e6b79ff1bf80f7b0286a54ee`, CPU Cloud Run 8 vCPU / 32 GiB, Python 3.11.13, Torch 2.8.0+cu126이다. 따라서 이 사건의 공식 결론은 **Community-1 단독 확정 보류**다. 1개 통과와 1개 실패는 평균으로 상쇄하지 않는다.

### provenance 결함 — 이 두 manifest를 새 기준선으로 곧바로 승격하지 않는 이유

두 generalization manifest의 `fixtureId`와 `durationSec`는 모두 과거 KTV 값(`ktv-briefing-20251231`, 704.34초)으로 잘못 저장돼 있다. 평가는 fixture별 기대 길이와 원시 segment span을 별도로 확인해 수행했으므로 결과표는 **조건부 캐시 평가**로 남긴다. 그러나 manifest 작성자가 고쳐져 새 입력 ID·길이·정답 버전을 기록한 run이 나오기 전까지는 이를 깨끗한 실험 provenance로 취급하지 않는다.

추가로 일부 과거 manifest와 생성된 ledger 사이에는 `privacy.audioSentExternally` 값이 서로 다른 경우가 있다. `paidApi: false`만 확인해 "외부 처리 없음"이라고 결론 내릴 수 없다. 다음 run부터는 오디오 업로드 경로, 임대 클라우드 처리 여부, 외부 API 호출 여부를 각각 기록하고 생성 보고서도 같은 값을 그대로 소비해야 한다.

## EVT-04 — 1인 음원이 `실제 화자 + 발화` 두 사람처럼 보인 사건

**상태:** `RUN` + `CODE` · **핵심:** 모델 과분리와 화면 fallback을 같은 문제로 다루지 않는다.

### 모델 단계 확인

`brief-rda-single-speaker`(283.584초)에서 ERes2Net, CAM++, Community-1은 모두 **원시 모델 단계부터 1명**이었다. Community-1 실행 `20260804T0650-brief-rda-community1`의 보존값은 다음과 같다.

| 필드 | 값 |
|---|---|
| 모델 / revision | Community-1 / `3533c8cf8e369892e6b79ff1bf80f7b0286a54ee` |
| stage | `raw-model` |
| 원시 화자 수 | 1 |
| CPU wall / inference | 272.728초 / 268.385초 |
| 서버 | Cloud Run CPU, `asia-southeast1`, 8 vCPU / 32 GiB |
| 비용 | USD 0.056727, paid API `false` |

그러므로 이 fixture에서 `화자 A`와 `발화`가 둘로 보였다면 먼저 모델을 다시 튜닝할 문제가 아니라 **표시·근거 라벨 단계의 회귀**로 다뤄야 한다.

### 표시 규칙

`src/lib/stt/to-meeting.ts`의 `발화`는 음향 cluster나 별도 사람이 아니라 화자 분리가 닿지 않은 구간의 generic fallback이다. 정확히 한 명의 구체 라벨만 확인됐을 때만 `발화`를 그 사람으로 흡수한다. 둘 이상의 구체 라벨이 있으면 정체를 추측해 합치지 않는다. 이 규칙은 새 분석뿐 아니라 저장된 회의록을 읽을 때도 파생 표시값에만 적용하며, 원문과 semantic을 변경하지 않는다.

`scripts/test-transcript-evidence.ts`는 다음을 로컬 회귀로 검증한다.

- 1인 회의의 `발화` 참가자·대화 줄·액션 담당자가 유일 실제 화자로 표시되는지
- 이미 저장된 1인 회의도 재분석 없이 같은 표시 규칙을 적용하는지
- 다인 회의에서는 generic label을 임의의 실제 사람으로 병합하지 않는지

### 별도 체계: 실시간 단일 마이크 화자 cluster 설정

아래 값은 Community-1 오프라인 화자분리의 튜닝 값이 아니라, 실시간 단일 마이크 세션에서 쓰는 별도 voiceprint 재연결 정책이다. 두 체계를 섞어 기록하면 잘못된 모델 결론이 나온다.

| 설정 | 값 |
|---|---:|
| `RETENTION_HOURS` | 24시간 |
| `MIN_AUDIO_SEC` | 1.2초 — 그보다 짧으면 cluster를 강제로 붙이지 않음 |
| `MAX_CLUSTERS` | 8 (`A`~`H`) |
| `DEFAULT_SIMILARITY` | cosine 0.68 (환경 변수로 0.4~0.95 범위 재정의 가능) |
| 원음 보존 | 영구 저장하지 않음; 임시 파일만 사용하고 암호화된 centroid만 보존 |

이 값은 운영 표본에서 재보정할 대상이며, `1인 fixture=정답 1명`이라는 오프라인 모델 검증과 같은 점수로 합산하지 않는다.

## EVT-05 — 겹침 발화가 배타적 화자 출력에서 사라지는 설계 제약

**상태:** `CODE` + `DIAGNOSIS` · **해결 완료 아님**

현재 `ml/diarization/diarize.py`와 `experiments/speech-model-lab/community1/run.py`는 Community-1 결과에서 `exclusive_speaker_diarization`을 먼저 직렬화하고, 없을 때만 일반 `speaker_diarization`으로 fallback한다. 제품의 실시간 utterance 결합도 한 utterance에 가장 많이 겹치는 **한 명**을 붙이는 배타적 정렬을 사용한다.

이는 전사 문장에 한 화자를 붙이는 데는 유용하지만, 같은 시각에 두 사람이 말한 정답을 보존할 수 없다. 따라서 현 저장 형식만으로는 겹침 구간의 speaker F1을 주장할 수 없다.

### 분리해서 보존할 출력

| 출력 | 용도 | 보존 원칙 |
|---|---|---|
| 일반 diarization (`speaker_diarization`) | 겹침 포함 음향 정답·학습·평가 | 같은 시간에 여러 화자 행을 허용하고 RTTM/UEM으로 보존 |
| exclusive diarization | 전사 timestamp에 대표 화자 결합 | 일반 diarization에서 파생된 1인 정렬 결과로만 사용 |
| 화면 발화 | 읽기·재생 UX | 겹침 여부/보조 화자 메타데이터를 별도로 보여 주되 원문 화자를 덮어쓰지 않음 |

다음 실험 전제는 실제 겹침 골드 5~8시간, overlap 구간의 다중 라벨, 화자별 시작·끝 시각이다. 이 필드가 없는 기존 클립에는 억지 overlap F1을 만들지 않는다.

2026-08-08부터 새 파일럿의 평가 계약은 이 제약을 반영해 `DER/JER` 주지표와 overlap·재등장·짧은 발화·1인 기준 slice 진단으로 전환한다. 이 문서에 남은 KTV/brief `boundary F1` 수치는 당시 실행의 역사적 진단값이며, [화자분리 파일럿](faith-stt-diarization-pilot.md)의 새 gold 성능으로 이관하지 않는다.

## EVT-06 — 표면 전사 정확도는 화자분리와 분리해, 제한 재검증으로 개선해야 하는 사건

**상태:** `CACHE` + `DIAGNOSIS`

KTV 캐시 비교에서 `gpt-transcribe` PRIMARY 원문은 CER 0.0536, 핵심 구절 재현 0.8이었다. PRIMARY를 다시 구조화한 제품 산출물은 CER 0.0566, 핵심 구절 재현 0.4로 악화되어 네 번째 기자/마무리 구절을 잃었다. 따라서 정답 개선의 첫 원칙은 **PRIMARY 텍스트를 불변 evidence로 고정하고**, word timing·화자·요약은 원문을 다시 쓰지 않는 파생 근거로 두는 것이다.

| 비교 대상 | CER | 핵심 구절 재현 | 비용 성격 | 해석 |
|---|---:|---:|---|---|
| `gpt-transcribe` PRIMARY 캐시 | 0.0536 | 0.8 | 과거 유료 API 캐시 | 현재 기준 원문 |
| `gpt-transcribe + forced-word-timings` | 0.0536 | 0.8 | 과거 유료 API 캐시 | 원문을 바꾸지 않는 단어 시각 근거 |
| 제품 재구성 캐시 | 0.0566 | 0.4 | 과거 유료 API 캐시 | 본문 재작성의 회귀 증거 |
| `whisper-1` 캐시 | 0.0893 | 0.2 | 과거 유료 API 캐시 | 독립 전사/시간 근거 후보이지 화자분리 모델이 아님 |
| SenseVoiceSmall INT8 CPU | 0.1586 | 0.4 | 서버 실행 | 본전사 후보 탈락; 저비용 초벌·검색 인덱스 후보 |

### 비용 상한을 가진 의심 구간 2차 통과 설정

`src/lib/stt/second-pass-review.ts`에 기록된 현재 설정은 다음과 같다. 이는 전체 파일을 다시 보내는 설정이 아니라, 신뢰도 하위 구간만 제한적으로 재검증하는 운영 비용 상한이다.

| 설정 | 값 |
|---|---:|
| 저신뢰 선택 비율 | 하위 12% |
| 최소 구간 길이 | 1.2초 |
| 클립 앞뒤 padding | 0.2초 |
| 최대 재검증 구간 수 | 60 |

고유명사는 PRIMARY와 독립 시간 전사가 함께 지지하고, 출처·참석자·조직 glossary 중 하나가 있을 때만 자동 적용한다. 인명은 두 전사가 같은 오답을 낼 수 있으므로 내부 다수결로 자동 변경하지 않는다. 확정되지 않은 후보는 추천으로만 남긴다.

### 05_영상자료 hard-set에서의 의미 검증 기록

| fixture | 의미 보존 / 흐름 | 고유명사 | 단어 시각 | STT 비용 추정 | 판정 범위 |
|---|---:|---:|---:|---:|---|
| 정보보호 브리핑 18:16 | 98% / 95% | 8/8 | 1,548개 | USD 0.2195 | 의미·흐름; 절대 화자 시각 골드는 없음 |
| 김민석 청문회 20:00 | 95% / 95% | 8/9 | 2,076개 | USD 0.2407 | 의미·흐름; 자동자막은 약한 정답 |

이 결과는 "의미가 반대가 아니고 이야기 흐름이 맞는가"의 검증에는 쓸 수 있지만, 엄밀 CER·화자 boundary F1으로 바꾸면 안 된다. `--fresh-stt`는 명시 예산과 함께만 허용하고, 기본 평가는 캐시 전용으로 유지한다.

## EVT-07 — brief-ailab가 정확해 보였지만 KTV 일반화 근거가 되지 못한 사건

**상태:** `CACHE` + `DIAGNOSIS`

`brief-ailab`의 21:12 실행 `mtg-up-d854ddc0`은 `gpt-transcribe/precision` 품질 gate를 통과했다. 그러나 실제 화자는 2명, 전환은 1회인 구조다. KTV는 8명, 16개 전환, 짧은 호명과 연속 자기소개가 반복된다. 따라서 brief-ailab 성공을 KTV의 화자분리·이름 매핑 성공으로 일반화하지 않는다.

별도로 빠른 결과 `mtg-up-1dfa679f`와 고급 결과 `mtg-up-edf45038`은 다음 서로 다른 실패를 보였다.

| 항목 | 빠른 | 고급 | 원인/고정 설정 |
|---|---:|---:|---|
| 대화 줄 수 | 101 | 2 | 고급의 acoustic block을 최종 말풍선으로 그대로 사용 |
| 최대 말풍선 글자 | 154 | 3,103 | 고급 말풍선 상한 280을 gate로 둠 |
| 근거 없는 참석자 | `화자 A`, `화자 B` | 없음 | 빠른 모드에서 요약 모델 speaker 추정을 참가자로 사용 |
| 짧은 경계 중복 | 있음 | 없음 | chunk 병합 때 suffix/prefix 중복 재발 |
| word time 역전 | 시간 없음 | 6건 | offset 순서 단조 시각 강제 필요 |
| 요약 원문 근거율 | 100% | 100% | 문장별 최소 72% 기준은 둘 다 통과 |

이 사건의 조치는 화자 수가 아니라 **출력 근거 체계**다. 참가자는 최종 evidence dialogue에 실제로 붙은 라벨만으로 만들고, 요약의 speakers/timeline/actions 추정만으로 사람을 생성하지 않는다. 고급 모드도 PRIMARY 문장 경계와 실측 시각으로 다시 나눠야 하며, 저장 산출물은 자동으로 덮어쓰지 않는다.

## EVT-08 — L4 온디맨드 실행을 시도했으나 quota에서 멈춘 사건

**상태:** `RUN` + `PLAN` · **GPU 모델 결과 없음**

| 항목 | 확인값 |
|---|---|
| Cloud Run L4 quota | `NvidiaL4GpuAllocNoZonalRedundancyPerProjectRegion` = `NOT_ENOUGH_USAGE_HISTORY` |
| Compute Engine GPU quota | `GPUS_ALL_REGIONS=0`, `NVIDIA_L4_GPUS=0` |
| 정의 시도 리전 | `asia-southeast1`, `europe-west1`, `europe-west4`, `us-east4`, `us-central1` |
| 실행 인스턴스 | 생성되지 않음 |
| GPU 비용 | 0 |

quota 승인 뒤에만 실행할 Job 설정은 다음과 같다. 이는 **계획값**이며 아직 GPU 성능·비용 결과가 아니다.

| 설정 | 계획값 |
|---|---|
| 우선 리전 | `asia-southeast1` |
| GPU | `nvidia-l4` 1개 |
| 최소 자원 | 4 vCPU / 16 GiB |
| 중복 | `--no-gpu-zonal-redundancy` |
| task / parallelism / retry | 1 / 1 / 0 |
| idle 인스턴스 | 0 |
| 첫 smoke | 4분 43초 1인 fixture: CUDA·드라이버·모델 호환성, RTF, 1명 판정 |
| 실패 정책 | CPU로 조용히 fallback하지 않음; manifest를 먼저 기록 |

Job 정의를 유지하는 것은 GPU를 계속 켜 두는 것이 아니며, 실행 요청 때만 인스턴스가 생긴다. 반대로 quota는 물리 GPU 예약이 아니므로 실행 시점 용량 부족 가능성은 별도로 남는다.

## EVT-09 — 100시간 수집·Community-1 튜닝 방향: 기록된 계획과 아직 없는 결과

**상태:** `PLAN` · **수집, 라벨링, fine-tuning, GPU 학습은 아직 실행하지 않음**

### 데이터 규모를 혼동하지 않는 최종 표현

채팅에는 두 분할안이 함께 있었다. 둘을 하나의 "100시간"이라고 쓰면 테스트셋이 사라지는 모순이 생긴다.

| 목적 | 권장 구성 | 의미 |
|---|---:|---|
| 최소 총량이 100시간뿐일 때 | train 70 / dev 15 / sealed test 15 | 학습은 70시간이므로 "100시간 학습"이라고 부르지 않음 |
| 100시간을 실제 학습에 쓰려 할 때 | train 100 / dev 12.5 / sealed test 12.5 = 사용 가능 125시간 | 원본 약 135시간을 수집해 검수 탈락을 흡수 |

이후 대규모 튜닝을 할 경우의 권장안은 후자다. **학습 core 100시간**을 자연 복합 65시간, 상황 집중 25시간, 깨끗한 기준 10시간으로 나눈다.

| 학습 core 구성 | 시간 | 목적 |
|---|---:|---|
| 자연 복합 데이터 | 65시간 | 실제 서비스처럼 여러 난도가 함께 있는 일반화 학습 |
| 상황 집중 데이터 | 25시간 | 특정 실패 원인과 보정 효과의 진단 |
| 깨끗한 기준 데이터 | 10시간 | 과분리·과병합 방지 기준선 |

### 상황 집중 25시간의 고정 목표

| 상황 | 시간 |
|---|---:|
| 1인 과분리 | 3시간 |
| 짧은 새 화자 | 3시간 |
| 비슷한 음색의 화자 | 3시간 |
| 긴 공백 뒤 동일 화자 재등장 | 3시간 |
| 실제 겹침 발화 | 5시간 |
| 원거리·저음량 화자 | 3시간 |
| 온라인·압축·채널 차이 | 3시간 |
| 웃음·박수·재생 음성과 실제 화자 혼합 | 2시간 |

각 영상에 라벨을 하나만 붙이지 않는다. 실제 학습 영상에는 여러 조건이 자연스럽게 공존해야 하며, 집중 세트는 특정 실패 요인이 **판별 가능할 정도로 우세**해야 한다. 예를 들어 짧은 새 화자 세트에 잡음이 있어도 되지만, 새 화자를 기존 화자에 합쳤는지 평가할 수 있어야 한다.

### 도메인·화자·라벨 최소 조건

| 항목 | 목표 |
|---|---|
| 도메인 | 공공 브리핑 20h, 일반 회의 20h, 청문회/토론 15h, 2인 인터뷰/상담/통화 15h, 온라인/하이브리드 10h, 현장/전화/원거리/소음 10h, 1인 발표/강의 10h |
| 화자/세션 | 서로 다른 화자 300명 이상(목표 500), 세션 250~400개 |
| 반드시 포함 | 1인 10h 이상, 실제 겹침 5~8h, 5명 이상 세션 20~30%, 짧은 맞장구, 늦게 등장하는 새 화자, 긴 공백 뒤 재등장 |
| 화자분리 골드 | 전체 100h: session 내부 익명 speaker ID, 시작/끝, 다중 겹침 행, 불확실 구간, 비음성 사건, 실제 화자 수, 환경/마이크 |
| 정밀 ASR | 30~40h: 축어 전사, 고유명사·기관명·숫자·영문 약어·조사·말끝 |
| 단어 시각/이중 검수 | 10~15h |
| 요약 골드 | 10~20h: 결정·할 일·담당·일정·보류·중요 입장. 전사/화자 점수와 분리 |

**분할 규칙:** 클립 무작위 분할이 아니라 세션·프로그램·화자·출처 단위로 train/dev/sealed test를 분리한다. 이미 여러 번 본 KTV, brief-startup, brief-mou, brief-ailab은 개발·회귀용으로만 유지하고 봉인 테스트에 넣지 않는다.

### 라벨링·개인정보 주의사항

- 모델 출력은 초벌 라벨일 뿐 정답이 아니다. 두 결과가 다른 구간, 겹침·짧은 발화·새 화자·재등장 구간을 사람 우선 검수한다.
- 전체의 15~20%는 두 사람이 독립 검수하고, 불일치에는 합의 정답을 만든다. 사람도 판단할 수 없는 구간은 억지로 단일 화자에 넣지 말고 `AMBIGUOUS`로 남긴다.
- 겹침은 같은 시간에 여러 화자 행으로 저장한다. 한 시점에 한 명만 남기는 현재 exclusive 정렬을 학습 정답으로 쓰지 않는다.
- 출처 권리·녹음 동의·2차 이용 가능 여부를 세션 단위로 기록한다. 개인 회의 원음/전문을 외부 벤치마크나 공개 데이터셋에 섞지 않는다.
- 원본, 검증 클립, 출처 URL, KTV의 분리는 유지하되, 실제 평가에는 파일 hash·clip 경계·정답 버전·라벨러·검수 상태를 함께 남긴다. 같은 영상의 다른 클립이 train과 sealed test에 흩어지면 안 된다.

### Community-1에 대한 튜닝 순서

이 순서는 실행 계획이며 현재 성능을 보장하지 않는다.

1. Community-1 본체는 우선 고정하고, 새 데이터에서 threshold·후처리 calibration을 측정한다. CPU만으로 가능하다.
2. 잔여 오류만 대상으로 `경계 유지/삭제`, `같은 사람/다른 사람`, `겹침 여부` 보정기를 학습한다. 모델이 기존 경계를 무조건 따라 하도록 만들지 않는다.
3. 일반화 개선이 확인될 때만 segmentation fine-tuning을 진행한다. 이 단계부터 L4 1개가 실용적인 최소 시작점이다.
4. embedding fine-tuning은 마지막이다. 비슷한 음색의 타인을 합치는 오류와 같은 사람 재등장 분리를 모두 분리해 측정한 뒤에만 시작한다.

먼저 5~10시간 파일럿으로 라벨 규칙·GPU 시간·epoch당 처리량·성능 곡선을 확인한다. 그 측정 전의 "24~48시간" 또는 "며칠" 같은 소요 시간은 계획 추정일 뿐 실측값으로 기록하지 않는다.

## 다음 사건부터 반드시 남길 run record

아래 필드는 단순 결과표가 아니라 재현 가능성의 최소 계약이다. `analysisDiagnostics` 또는 새 immutable manifest에 저장하되, 원문 전문이나 비밀값은 넣지 않는다.

| 분류 | 필수 필드 |
|---|---|
| 입력 | fixture ID, 콘텐츠 hash, clip 시작/끝, 길이, 출처/권리 등급, 정답 버전 |
| 모델 | 모델명, 정확한 revision/파일 checksum, license, 입력 포맷, min/max speaker, threshold, VAD/segmentation/embedding 설정 |
| 후처리 | raw/product stage, prune/glue 규칙 version, 이름 소유권 규칙 version, 고정 철자/용어 사전 version, word alignment 정책 |
| 실행 | provider, region, machine/GPU, task·parallelism·retry, runtime, image digest, Python/Torch/라이브러리 version |
| 개인정보·비용 | 임대 클라우드 처리, 외부 API 호출, audio 외부 전송, 보존 경로/기간, paid API 여부, 실제/추정 비용과 산정 범위 |
| 평가 | gold source/version, metric contract version, RTTM/UEM, collar·overlap 정책, DER/JER와 구성요소, 조건별 slice, 보조 boundary 진단, ASR CER/의미 점수, 실패 구간 |
| 판정 | 통과/실패 기준, 채택/보류/탈락, 다음 실험, 재실행 금지 사유 |

## 이번 정리의 경계

- 새 모델 추론, 유료 API 호출, GPU 실행, 개인정보 외부 전송, production 배포는 이 문서화 작업으로 수행하지 않았다.
- 아카이브의 `meeting-analysis-remediation-2026-08-03.md`는 덮어쓰지 않는다. 이 문서는 그 기록을 보완하는 실행 원장이다.
- 현재 수집·튜닝 계획은 의사결정 기록이며, 완료된 데이터셋·학습된 가중치·서비스 성능 향상으로 표기하지 않는다.

## EVT-10 — 72%에서 멈춘 뒤 실패로 보인 분석이 실제로는 실행 중이었던 사건

**상태:** `RUN` + `CODE` · **운영 검증:** 스테이징 장기 실행 재검증 필요

### 채팅에서 보존해야 할 시간축과 원인

2026-08-03 03:59 KST에 KTV 분석을 시작했다. 04:09 무렵 화면은 72%에 머물렀고,
04:14 UI는 실패를 표시했다. 저장 기록과 사용량 이벤트를 대조한 결과 작업은 약
14분 뒤 정상 완료됐고 두 번째 실행도 완료됐다. 따라서 이 사건은 GPU·모델 정지가
아니라 **status GET이 12분 지난 실행을 stale error로 잘못 변경한 가짜 실패**다.

### 당시 값과 수정값

| 항목 | 당시 관찰/문제 | 수정 후 계약 |
|---|---|---|
| 실행 소유자 | Next `after()` 장기 실행에 의존 | queue + 별도 analysis worker |
| 진행률 구간 | STT 1–72, 구조화 72–90, 정렬 95, 조립 98, 완료 100 | 실제 단계와 heartbeat를 별도 반환 |
| 시작값 | 내부 준비 fraction `0.08`을 3–72%로 선형 매핑해 `8.52% → 9%` 점프 | 업로드·status·재처리·fallback 모두 1%에서 시작 |
| heartbeat | status 조회와 생명주기가 섞임 | Worker 30초 주기 heartbeat |
| stale 판정 | 상태 GET이 회의 상태를 변경 | heartbeat 단절 3분인 작업만 queue 계층에서 복구 |
| 재시도 | 작업 상태와 재시도 기준이 불분명 | 최대 3회 지수 backoff 재시도 |
| 사용자 시간 표시 | “1분 남음”, “5분 남음” 추정 ETA | 경과시간 + 대기/활동/확인 중 상태 |

### 처리시간을 섞어 쓰지 않기 위한 보존값

15분 파일의 STT+단어 시각은 59.4초/68.9초, 4분 32초 파일은 18.9초,
KTV 11분 44초는 48.6초였다. 이 값은 전체 제품 pipeline이 아니라 STT+단어 시각
단계의 측정이다. 구조화·로컬 화자분리·저장 시간은 별도 필드로 남긴다. 이 사건의
해결 근거로 GPU 변경을 쓰지 않는다.

**아직 확인하지 않은 것:** 실제 스테이징에서 15분 이상 heartbeat, 재시도, 취소,
quota release가 모두 기록되는지와 동일한 false failure가 다시 발생하지 않는지.

## EVT-11 — Pro 이상 자동 화자분리의 1배 quota 정책을 확정한 사건

**상태:** `CODE` + `RUN` · **미완료:** DB 기반 reservation/finalize/멱등성 검증

채팅 중 사용자가 기존 “2배 quota” 해석을 명시적으로 정정했다. 확정한 정책은
기능 entitlement와 원가 회수를 quota 배수로 섞지 않는 것이다.

| 항목 | 고정값/결과 |
|---|---|
| 개인 Free | `standard`, 1배 |
| Pro/Admin/Team/팀 workspace | 서버가 `precision`으로 고정, 자동 화자분리 포함 |
| `PRECISION_USAGE_MULTIPLIER` | `1` |
| 실제 600초 오디오 차감 | `600초` |
| UI 안내 | `1분 → 1분` |
| 서버 판정 | `resolveAnalysisModeForEntitlement`가 클라이언트 요청보다 entitlement를 우선 |
| 정책 테스트 | free 개인→standard, free team workspace→precision, Pro→precision, admin free→precision, team catalog→precision 통과 |
| 사용량 테스트 | `DATABASE_URL`이 없어 Prisma 초기화 단계에서 실행 불가 |

정책 변경은 `src/lib/stt/analysis-mode.ts`, `src/lib/plans.ts`,
`scripts/test-analysis-policy.ts`, `scripts/test-analysis-usage.ts`에 함께 반영했다.
1배 정책의 잠정 고사용률 공헌이익은 Pro 월간 약 `-₩6,781`, Pro 연간 약
`-₩9,565`, Team 월간 약 `-₩30,390`, Team 연간 약 `-₩44,895`로 계산됐다.
이는 quota를 다시 2배로 되돌릴 근거가 아니라 가격·포함분·정밀 원가를 다시
결정해야 하는 FIN 게이트다.

**판정:** 정책 코드와 entitlement 테스트는 통과했지만, DB 사용량 원장과 실제
청구·Team 공유 풀을 확인하기 전에는 운영 완료로 부르지 않는다.

## EVT-12 — M4A·MP4 원본과 FLAC 파생본의 목적을 뒤섞은 사건

**상태:** `RUN` + `DIAGNOSIS` + `PLAN` · **수정 방향:** 원본 보존 정책을 데이터
수집 계약에 추가

### 이전 MP3→M4A 시험에서 실제로 확인한 것

KTV 11분 44초 MP3를 재생용 M4A로 변환했을 때 파일은 `3.45MB → 2.75MB`
(약 20% 감소), 변환 시간은 `2.1초`였다. `moov/stts/stsz`가 파일 앞에 있어
다운로드 직후 seek가 가능했다. 이 시험은 **브라우저 재생·seek 효과**를 보인 것이며
AAC 재인코딩이 STT 정확도를 올렸다는 증거가 아니다. AAC 압축에서 사라진 정보는
나중에 FLAC으로 바꿔도 복원되지 않는다.

### 이제 고정하는 오디오 보존 계약

| 용도/축 | 원칙 |
|---|---|
| 직접 새로 녹음 | 가능하면 WAV 또는 FLAC, 44.1/48kHz, 16/24-bit. 원본 채널과 참가자별 트랙 보존 |
| KTV·유튜브·방송·기존 M4A/MP4 | 권리 범위가 허용하는 한 원본 컨테이너를 수정·재인코딩하지 않고 보존 |
| 학습·추론 파생본 | `16kHz mono FLAC` 또는 WAV. 현재 모델 입력에 맞춘 별도 파생본 |
| 전화·온라인 회의 | 원본 Opus/AAC/M4A를 보존하고 낮은 음질 자체를 실제 서비스 일반화 조건으로 기록 |
| 다채널 입력 | 원본 channel layout을 유지하고, mono 파생본을 별도로 생성 |

최종 저장 구조는 다음을 기본으로 한다.

```text
원본/
  source.mp4 또는 source.m4a
학습파생/
  source_16k_mono.flac
라벨/
  source.rttm
  source.transcript.json
  source.metadata.json
```

100시간의 음질 구성은 기존 난이도 축 `자연 복합 65 / 상황 집중 25 / 깨끗한 기준
10`과 **별도의 축**으로 관리한다.

| 음질 축 | 권장량 | 의미 |
|---|---:|---|
| WAV/FLAC 또는 매우 깨끗한 고음질 원본 | 40시간 | 세밀한 화자 특징과 깨끗한 기준 |
| M4A/MP4/AAC/온라인 회의 일반 압축 | 45시간 | 실제 서비스 업로드 일반화 |
| 저비트레이트·전화·원거리·방송 재압축·클리핑 | 15시간 | 의도적 난조건 |

각 파일의 metadata에는 최소한 `sourceSha256`, `derivedSha256`,
`sourceOrDerived`, `codec`, `sampleRate`, `bitDepth`, `channels`, `bitrate`,
`transcodeCount`, `derivation`(예: `48k stereo AAC → 16k mono FLAC`),
녹음 장비·마이크 거리, SNR/소음 등급, 압축·전화·방송·온라인 여부, 권리 상태를
기록한다. 원본을 확보할 권리가 없으면 원본을 임의로 저장하지 않고 URL·권리 상태·
파생본 제한을 명시한다.

**현재 코드·파일럿과의 차이:** 2026-08-05 파일럿 collector는 공식 영상의 첫
오디오 스트림을 `ffmpeg -map 0:a:0 -vn -ac 1 -ar 16000 -c:a flac`으로 파생해
저장했지만 원본 MP4를 보존하지 않았다. 그러므로 이 intake는 최종 학습/골드셋
계약을 만족하지 않으며, `pilot_pending`으로 별도 handoff한다.

## EVT-13 — Cloud Build 429와 dirty source 배포 식별자가 충돌한 사건

**상태:** `RUN` + `CODE` · **실제 staging 성공:** 역사적 배포 기록, 현재 dirty 작업의
새 배포 아님

초기 배포는 Cloud Build를 1초 간격으로 조회하다가 프로젝트의
`Build and Operation Get requests` 분당 60회 quota를 넘어 `429`
(`GetRequestsPerMinutePerProject`)로 CLI가 종료됐다. 빌드 자체는 계속 성공했다.
또한 `gcloud builds submit --async --format='value(metadata.build.id)'` 출력이
항상 ID라고 가정한 탓에 worker 단계가 멈춘 사례도 있었다. stderr의 생성 URL에서
UUID를 추출하는 helper로 수정했다.

| 항목 | 수정·확인값 |
|---|---|
| polling | 비동기 제출 + 10초 간격 조회 + 조회 실패 재시도 |
| 재사용 | 성공한 web/worker image를 digest 확인 후 재사용 가능 |
| staging web build | `45f9bd3d-933f-4644-adc8-a54050ae6db9`, `asia-northeast1`, SUCCESS |
| staging worker build | `313009ed-2339-4874-8c8d-1aebc06fbe16`, `us-central1`, SUCCESS |
| web revision | `faith-web-staging-00019-sgc`, traffic 100% |
| image digest | `sha256:3c0d50318e6ace957fc7b416f574f68c37964831304ee9771d443fccff63c87e` |
| health | `/api/health/auth` → `{"ok":true}` |
| worker | `faith-analysis-staging`, generation 7, Ready |
| 순서 | web no-traffic → migration → runtime verify → worker → traffic → health |

dirty worktree에서 Git `HEAD`를 이미지 tag로 사용하면 tag와 실제 업로드 source가
달라질 수 있다. 따라서 dirty 상태에서는 `--validate-only`만 허용하고, 실제 배포는
의도한 source를 `jjw905` identity로 커밋한 clean revision과 revision/digest/migration/
worker/health를 한 원장에 묶는다.

## EVT-14 — 팀 음성 권한과 대용량 Range 재생을 함께 고친 사건

**상태:** `RUN` + `CODE` · **남은 게이트:** 실제 staging KMS/GCS 계정·v1 rotation

### 원인과 권한 결과

기존 재생 URL이 vault 소유자 권한만 검사해 공유 회의의 팀원이 재생하지 못했다.
회의 접근권한을 먼저 검사하는 `/api/meetings/[id]/replay-audio` 경로로 통합했고,
로컬 별도 인증 팀 계정에서 다음을 확인했다.

| 시험 | 결과 |
|---|---|
| KTV 음성 길이 | 11분 44초, `readyState=4`, 전체 seekable |
| 관리자 전체 HTTP | `200`, `3,613,608B` |
| 중간 Range | `bytes=1048576-1052671` → `206`, `4,096B`, 정확한 `Content-Range` |
| 일반 MEMBER 반대 시험 | `403` + 원본 음성 정책 문구 |
| 브라우저 | 재생 및 10초 이동 확인 |

### envelope v2 설정과 로컬 측정

신규 팀 원본은 `AES-256-GCM` 독립 청크와 청크별 인증 태그를 사용한다. 청크
크기는 `1MiB`이며 Range는 겹치는 암호문 청크만 읽고, 전체 응답도 청크 단위
ReadableStream으로 복호화한다. 기존 envelope v1은 호환 fallback을 유지한다.

100MiB 로컬 코어 시험에서 중간 4KiB 응답은 암호문 1MiB 청크 하나만 읽었고,
Range 복호화는 `0.39ms`, 전후 RSS 증가는 `32KiB`, 전체 100MiB 암호화는
`41.4ms`였다. 이는 로컬 crypto 코어 값이며 GCS 왕복·KMS data key 조회·Cloud Run
메모리/응답 지연은 아직 별도 측정하지 않았다.

v1 rotation은 기본 dry-run inventory다. `--execute` 시 별도 `.v2-rotation` 객체에
쓰고, 평문 SHA-256과 재복호화를 검증한 뒤 DB pointer를 교체한다. 성공 후에도
원본 삭제는 비활성화한다.

## EVT-15 — Worker 부팅과 secret loader가 서로 다른 계층에서 실패한 사건

**상태:** `RUN` + `CODE` · **근거:** 실제 `npm run dev` 재현 및 smoke

Node 24/tsx에서 Worker 진입점의 top-level `await`가 CommonJS 변환 오류로 즉시
종료했고, 수정 중에는 `react-server` 조건 누락으로 `server-only` import가 차단됐다.
dotenv 이후 동적 의존성 로드를 `main()`으로 옮기고 단일/풀 Worker 실행에 서버 조건을
동일하게 적용한 뒤 로컬 Web과 Worker 2개가 함께 기동되고 SIGINT로 종료되는 것을
확인했다.

별도의 secret loader 사건에서는 `.env`를 shell로 source해
`AUTH_EMAIL_FROM=이름 <주소>`처럼 shell 문법으로 해석될 수 있는 값에서 파싱이
실패했다. 값을 실행하지 않는 데이터 파서로 교체하고 secret hygiene, loader smoke,
bash 문법 검사를 통과시켰다. `.env` 값 자체는 이 원장에 복제하지 않는다.

## EVT-16 — 2026-08-05 공식 정책브리핑 파일럿 intake를 별도 수집 세션으로 넘긴 사건

**상태:** `RUN` + `PLAN` · **학습/골드/봉인 승격 금지**

이 사건은 대규모 100시간 수집을 이 문서의 후속 세션으로 분리하기 위한 handoff다.
현재 세션에서 공식 정책브리핑 후보를 수집·검증한 범위는 다음과 같다.

| 항목 | 실제 값 |
|---|---|
| 후보/수집 source | `19 / 19` |
| accepted audio | `20,053.760초` = `5.57049시간` |
| 수집 오류 | `0` |
| 파일 수 | audio 19, reference 19, meta 19 |
| audio format | FLAC, `16,000Hz`, mono, 19/19 |
| partial file | `0` |
| hash/status 검증 | hash mismatch 0, status mismatch 0 |
| source family | 대한민국 정책브리핑 공식 `policyBriefingView` |
| 외부 모델/API | 호출하지 않음; `audioSentExternally=false` |

모든 meta는 `trainingEligible=false`, `goldStatus=none`, `split=pilot_pending`,
`rightsStatus=internal_evaluation_only_pending_video_rights`로 기록했다. 이는 공식
전문과 영상에서 뽑은 **내부 평가용 오디오 파생본 intake**이지 원본 보존을 마친
학습셋이 아니다. EVT-12의 원본 보존 계약이 추가됐으므로, 이후 세션은 원본
MP4/M4A 권리 상태·원본 hash·codec/bitrate/channel·파생 계보를 먼저 기록한다.

수집 도중 `destination.flac.part` 확장자를 ffmpeg 임시 출력으로 사용해 포맷을
추론하지 못한 실패가 있었다. 임시 파일명을 `destination.stem + '.part' +
destination.suffix`(예: `source.part.flac`)로 바꾼 뒤 재실행했다. 이후 2건과 15건의
분할 수집, 마지막 전체 재실행에서 각각 오류 없이 완료됐고, 전체 요약은 마지막
전체 실행으로 다시 생성했다. 이 수정값과 결과를 잃지 않되, 대규모 수집 설계·원본
보존·라벨링은 별도 세션에서 이어간다.

**이번 handoff의 결론:** 5~10시간 파일럿 최소 시간은 충족했지만, 이것을 100시간
계획의 학습 시간이나 골드 데이터로 계산하지 않는다. 사람 청취·화자/겹침/원거리/
짧은 발화 라벨, 15~20% 이중 검수, 권리 확인, 원본 보존 계보가 완료되기 전에는
`pilot_gold`, train/dev/sealed, 모델 학습 또는 production 품질 근거로 승격하지
않는다.
