# Faith Community-1 화자분리 튜닝 파일럿 통합 문서

작성일: 2026-08-08
상태: `ACTIVE_CANONICAL`
목적: 현재 수집 후보를 사람 검수 가능한 화자분리 gold로 전환하고, `pyannote/speaker-diarization-community-1`의 한국어 회의 환경 적응·튜닝 가능성을 검증한다.

이 문서를 Community-1 화자분리 파일럿의 단일 운영 기준으로 사용한다. 대상 모델, 데이터, 사람 검수, 평가 지표, 튜닝 단계와 승격 조건을 따로 나누지 않으며, 변경이 생기면 이 문서와 기계 장부의 버전을 함께 갱신한다.

상위 시간 배분 원칙은 [STT 수집·골드 라벨 계획](../Faith-office/03_STT_품질_재생/Faith_STT_수집_골드라벨_계획.md)을 따른다. 과거 모델 실행의 원문 수치와 재현 근거는 [실험 사건 원장](speaker-diarization-experiment-ledger.md)에 보존한다.

## 0. 대상 모델과 튜닝 계약

### 0-1. 무엇을 튜닝하는가

이 파일럿의 대상은 Whisper가 아니라 **`pyannote/speaker-diarization-community-1` 기반 화자분리 시스템**이다. 고정 기준선은 현재 로컬 실험 코드가 사용하는 아래 실행 계약으로 정의한다.

| 항목 | 고정값 |
|---|---|
| 대상 모델 | `pyannote/speaker-diarization-community-1` |
| 기준 리비전 | `3533c8cf8e369892e6b79ff1bf80f7b0286a54ee` |
| 기준 런타임 | `pyannote.audio 4.0.7` |
| 입력 | 무손실 remux M4A에서 실행 시 임시 변환한 mono 16 kHz 음성; 영상 프레임·얼굴 정보 미사용 |
| 주 출력 | 겹침을 보존하는 `speaker_diarization` |
| 파생 출력 | 겹침을 배타화한 `exclusive_speaker_diarization`; STT 정렬·제품 표시용 |
| 현재 파일럿 baseline | `NOT_RUN`; 사람 gold와 overlap-inclusive 가설이 아직 없음 |
| 가중치 튜닝 상태 | `NOT_STARTED` |
| Community-1 segmentation 미세조정 호환성 | `NOT_VERIFIED`; 소규모 재현 실험 전에는 가능하다고 선언하지 않음 |

[Community-1 공식 모델 카드](https://huggingface.co/pyannote/speaker-diarization-community-1)는 이 파이프라인이 음성으로 화자 활동을 추정하고, 일반 출력과 배타적 출력을 함께 제공한다고 설명한다. [pyannote.audio 공식 릴리스](https://github.com/pyannote/pyannote-audio/releases)는 Community-1이 VBx clustering을 사용한다고 명시한다. 따라서 이 문서에서 말하는 “Community-1 튜닝”은 아래 단계 중 실제 수행한 범위를 정확히 적는 말이며, 파이프라인 전체를 이미 end-to-end로 미세조정했다는 뜻이 아니다.

### 0-2. Whisper와 텍스트의 역할

Whisper, 자동 자막, 공식 회의록과 다른 STT 결과는 **Community-1 튜닝 대상이 아니다**. 사용할 수 있는 범위는 긴 영상에서 발화 후보 위치를 찾거나 사람이 내용을 이해하도록 돕는 탐색 보조까지다.

- STT 텍스트·단어 타임스탬프를 화자 gold, 화자 ID 또는 겹침 정답으로 복사하지 않는다.
- Whisper의 WER나 텍스트 정확도를 Community-1 개선 지표로 사용하지 않는다.
- 전사문이 없어도 `누가 언제 말했는가`를 완전하게 라벨하면 Community-1 화자분리 학습·평가 자료가 될 수 있다.
- STT와 결합할 때도 먼저 Community-1의 배타적 출력으로 단어를 정렬하는 파생 단계를 두며, overlap-inclusive 기준 가설과 gold는 별도로 보존한다.

### 0-3. 이번 데이터가 겨냥하는 실패

신규 gold는 일반적인 한국어 음성 전사 품질이 아니라, 기존 Community-1 실험에서 확인했거나 반드시 분리 진단해야 하는 다음 실패를 겨냥한다.

| 실패 유형 | 확인할 현상 | 핵심 평가 |
|---|---|---|
| 짧은 신규 화자 병합 | 늦게 들어온 짧은 화자가 기존 장기 화자에 붙음 | `short_turn_recall`, `late_entrant_recall`, DER confusion |
| 긴 공백 후 동일 화자 분절 | 같은 사람이 다시 등장했는데 새 cluster가 됨 | `same_speaker_reappearance_recall`, JER, coverage |
| 비슷한 음색 화자 병합 | 서로 다른 화자가 하나의 cluster가 됨 | slice DER confusion, purity |
| 실제 동시발화 누락 | 겹친 두 화자 중 한 명이 사라짐 | overlap activity F1, overlap speaker-time recall |
| 1인 발화 과분리 | 한 사람을 여러 화자로 나눔 | extra-attributed time rate, JER |
| 짧은 경계 흔들림·비음성 오검출 | 발화 경계가 흔들리거나 박수·웃음을 화자로 잡음 | DER miss/false alarm, 조건별 slice |

### 0-4. 단계별 튜닝 정의

한 번에 “Community-1 전체 튜닝”을 주장하지 않고 아래 순서로 검증한다.

1. **고정 기준선** — 위 리비전의 가중치와 파이프라인을 바꾸지 않고, 일반 `speaker_diarization`을 gold에 평가한다.
2. **보정·후처리** — 모델 가중치를 동결한 채 화자 수 제약, clustering 관련 설정, 경계·재등장·겹침 후처리를 gold dev에서 보정한다. 이 단계는 `calibration`이며 가중치 미세조정으로 부르지 않는다.
3. **잔차 교정 모델** — 경계 유지/삭제, 같은 화자/다른 화자, 겹침 여부처럼 오류가 반복되는 판단만 별도 교정한다.
4. **segmentation 미세조정 후보** — 앞 단계로 해결되지 않고 train/dev에서 일반화되는 오류가 있을 때만 진행한다. Community-1과 현재 `pyannote.audio` 조합의 학습 경로·체크포인트 호환성을 5~10시간 파일럿에서 먼저 재현해야 한다.
5. **embedding 미세조정 후보** — 비슷한 화자 병합과 동일 화자 분절을 충분히 분리 진단한 뒤 마지막에 검토한다. 현재는 직접 지원이나 성공 가능성을 전제로 하지 않는다.

실행 이름에는 실제 변경 범위를 넣는다. 예: `community1-baseline-r3533c8`, `community1-calibrated-v1`, `community1-residual-v1`, `community1-segft-v1`. 실행하지 않은 단계는 `NOT_STARTED`, 호환성을 확인하지 않은 단계는 `NOT_VERIFIED`로 남긴다.

### 0-5. 겹침 출력 선행 차단 조건

현재 `experiments/speech-model-lab/community1/run.py`는 일반 `speaker_diarization`과 `exclusive_speaker_diarization`을 별도 필드로 직렬화한다. 주 baseline과 DER/JER에는 일반 출력을 사용하고, 배타적 출력은 STT 정렬용 파생 결과로만 사용한다. 이 계약이 누락되거나 두 출력 중 하나라도 없으면 실행 결과를 수집하지 않는다.

첫 DER/JER 실행 전에 다음을 충족해야 한다.

1. 일반 `speaker_diarization`과 배타적 출력을 서로 다른 필드·파일로 모두 보존한다.
2. main DER/JER와 겹침 slice에는 일반 출력을 사용한다.
3. 배타적 출력은 `exclusive_alignment_output`으로 표시하고 보조 결과만 계산한다.
4. 가설 메타데이터에 모델 ID, 리비전, 런타임, 출력 종류, 입력 원본 SHA-256을 기록한다.

## 1. 현재 결론과 범위

현재 자료는 튜닝 방향과 후보 시간을 보여 주지만 아직 골드 데이터가 아니다. 자동 자막, 공식 회의록, 기존 모델 출력은 화자 시각 정답으로 사용하지 않는다.

100시간의 상위 배분은 다음과 같다.

| 구분 | 시간 | 파일럿에서의 의미 |
|---|---:|---|
| 자연 복합 | 65시간 | 처음 보는 다화자 실제 환경의 일반화 |
| 상황 집중 | 25시간 | 겹침·소음·비슷한 음색·원거리·짧은 발화·재등장 실패 원인 분리 |
| 깨끗한 기준 | 10시간 | 과분리·과병합 진단; 1인 5시간과 깨끗한 다화자 5시간 |
| 합계 | 100시간 | 출처별 M4A 음성 길이 기준 |

따라서 95시간은 다화자, 5시간만 단일 화자 기준으로 사용한다. 2026-08-09 이후 보존·시간 산정의 로컬 기준은 MP4의 AAC 패킷을 재인코딩 없이 옮긴 M4A이며, 삭제한 MP4의 출처 URL·원본 SHA-256·변환 검증값은 [M4A 무손실 변환 장부](../Faith-office/08_검증_정답셋/M4A_무손실_변환_장부_2026-08-09.md)에 보존한다. FLAC은 골드·학습·봉인 시간에 포함하지 않고 분석용 PCM/WAV와 함께 임시 파생물로 취급한다.

### 전체 수집 후보와 첫 파일럿의 관계

이 문서에서 숫자를 다음 세 층으로 구분한다. 처음 보고한 약 30시간은 `25시간 + 추가 5시간` 규모의 **수집 후보 풀**을 뜻한다. 현재 사람 검수 큐의 8.8685시간은 그 전체 수집량을 다시 말하는 숫자가 아니라, 대표 난조건을 먼저 검수하기 위해 추린 **첫 파일럿 범위**다. 사람 청취로 실제 조건·화자 구간을 확정한 gold 시간은 아직 0시간이다.

| 구분 | 시간 | 현재 의미 |
|---|---:|---|
| 처음 보고한 수집 후보 풀 | 약 30시간 | 원본을 확보하고 기술 QC를 통과한 후보 규모; gold 아님 |
| 첫 사람 검수 파일럿 | 8.8685시간 | 7개 원본으로 우선 라벨링할 대표 범위; 전체 수집량 아님 |
| 사람 청취로 확정된 gold | 0시간 | 실제 상황·화자·구간을 확정하기 전까지 0으로 유지 |

### 현재 파일럿 후보

현재 사람 검수 큐는 7개 원본, 약 8.87시간이다. 이는 `candidate source hours`이며 확정 상황 시간·gold 시간·trainingEligible 시간으로 집계하지 않는다. 원본 후보 bucket은 상황 집중 약 5.95시간, 자연 복합 약 2.17시간, 깨끗한 기준 약 0.75시간이지만, 사람이 실제 구간을 확정한 뒤에만 파일럿 목표 4/3/1시간으로 재계산한다.

현재 상태:

| 게이트 | 상태 | 의미 |
|---|---|---|
| queue intake | `PASS` | 7개 원본과 연속 검수 창 준비 |
| human labels | `PARTIAL` | `PILOT-001` 00:00~13:20에 5개 REVIEWED 발화 구간 입력; 세션 전체 검수는 미완료 |
| independent double review | `PENDING` | 독립 이중검수 0개 |
| rights | `PENDING` | 학습 사용권한·범위·증거 미확정 |
| split | `PASS_QUARANTINE` | diagnostic/regression만 허용; train/dev/sealed 승격 보류 |
| Community-1 baseline evaluation | `PENDING` | human gold와 overlap-inclusive DER/JER 결과 없음 |
| overall | `NOT_READY` | 골드 승격 불가 |

큐와 장부:

- `Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/diarization-pilot-queue.v1.json`
- `Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/review-windows.v1.json`
- `Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/pilot-gate-report.v1.json`
- `Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/preannotations/community1-vast-full-baseline-plan.v1.json`

## 2. 사람 검수 라벨 계약

### 2-1. 세션·구간 필드

세션에는 `sessionId`, `sourceId`, 원본 경로, SHA-256, 실제 영상 길이, `primaryDomain`, `primaryBucket`, `primaryFocus`, 실제 화자 수, 소음·녹음·채널 정보, `split`, `privacyClass`, `rightsStatus`, `annotationVersion`, 각 gold level 상태를 남긴다.

화자 구간에는 다음을 사용한다.

`segmentId`, `startSec`, `endSec`, `speakerLocalId[]`, `overlapGroupId`, `tags[]`, `confidence`, `reviewStatus`, `ambiguousReason`, `evidenceSource`

`speakerLocalId`는 세션 안에서만 유효한 `SPK_01` 형식의 익명 ID다. 세션 간 동일인 여부를 자동으로 추정하거나 전역 음성 ID를 gold에 넣지 않는다.

실제 겹침은 한 시각에 여러 행으로 보존한다.

```text
session=PILOT-001, start=120.40, end=122.10, speaker=SPK_01, overlap=OVL_07
session=PILOT-001, start=121.15, end=123.00, speaker=SPK_02, overlap=OVL_07
```

검수 상태는 다음과 같다.

- `PREANNOTATED`: 자동 또는 모델 초벌; gold 아님
- `REVIEWED`: 한 명의 사람 검수
- `DOUBLE_REVIEWED`: 두 명의 독립 검수
- `ADJUDICATED`: 충돌 합의 완료
- `AMBIGUOUS`: 사람이 확정할 수 없어 별도 보존
- `REJECTED`: 권리·품질·손상 등으로 제외

### 2-2. 긴 공백 후 재등장 관계

동일 화자 재등장은 구간의 `speakerLocalId`만 보고 평가하지 않고 `speakerRelations`에 명시한다.

```json
{
  "relationId": "REL_001",
  "type": "SAME_SPEAKER_REAPPEARANCE",
  "firstSegmentId": "SEG_001",
  "secondSegmentId": "SEG_014",
  "gapSec": 42.3,
  "reviewStatus": "REVIEWED",
  "evidenceSource": "human_listening"
}
```

사람 검수자는 실제로 같은 화자인지, 서로 다른 화자인지 확정할 수 없는 경우 억지로 연결하지 않고 `AMBIGUOUS`로 남긴다.

### 2-3. 검수 순서

각 M4A 음원을 재생하며 다음 순서로 기록한다.

1. 음원이 정상 재생되고 장부·검수 창의 시작점과 같은 시간축인지 확인한다.
2. 후보 태그를 `confirmed`, `not_present`, `ambiguous` 중 하나로 판정한다.
3. 세션 내부 화자 ID를 부여한다.
4. 모든 실제 발화의 `startSec`, `endSec`를 기록한다.
5. 동시발화는 화자별 행과 동일한 `overlapGroupId`로 보존한다.
6. 짧은 발화·늦은 진입·긴 공백 후 재등장·웃음·박수·기침·재생음·무음을 별도 태그로 표시한다.
7. 소음 종류·지속성·강도·마스킹 여부와 마이크 거리·채널 정보를 기록한다.
8. 확정할 수 없는 구간은 `AMBIGUOUS`와 사유를 남긴다.

고위험 구간은 전수 검수하고, 전체의 15~20%는 두 사람이 독립적으로 검수한다. 충돌은 합의본을 만들고, 합의할 수 없는 구간은 애매한 상태로 보존한다.

## 3. 사람이 듣고 판단하는 것과 시스템이 확인하는 것

이번 작업에서 사람의 청취 판단은 **실제로 어떤 화자가 언제 무엇을 했는지와 후보 상황이 실제로 존재하는지**를 확정하는 데 사용한다. 반대로 파일의 동일성·권리·누수·평가 수치는 청취만으로 확정하지 않고 파일과 장부·계산으로 확인한다. 현재 7개 원본 약 8.87시간은 모두 후보일 뿐이며, 아래 사람 검수를 끝내기 전에는 gold나 학습 시간으로 세지 않는다.

### 3-1. 사용자가 직접 듣고 판단할 범위

| 청취 판단 항목 | 사람이 확정할 내용 | 남기는 결과 |
|---|---|---|
| 후보 상황의 실재 여부 | 겹침·소음·잔향·원거리·비슷한 음색·짧은 신규 화자·긴 공백 후 재등장이 실제로 있는지 | `confirmed` / `not_present` / `ambiguous` |
| 발화 구간 | 말이 시작되고 끝나는 시점, 겹침이 시작·종료되는 시점 | `startSec`, `endSec` |
| 화자 구분 | 한 세션 안에서 같은 사람인지 다른 사람인지, `SPK_01` 같은 세션 로컬 ID | `speakerLocalId[]` |
| 실제 동시발화 | 순차 발화가 아닌 같은 시간의 두 명 이상 발화인지 | 화자별 행 + `overlapGroupId` |
| 긴 공백 후 재등장 | 앞뒤 발화가 같은 사람인지, 확정 불가인지 | `speakerRelations` + `SAME_SPEAKER_REAPPEARANCE` 또는 `AMBIGUOUS` |
| 짧은 발화·늦은 진입 | 짧아서 버리면 안 되는 말인지, 새 화자가 실제로 들어왔는지 | `short_turn`, `late_entrant` 태그 |
| 소리 조건 | 배경 소음이 지속적인지, 발화를 가리는지, 원거리·잔향·압축·온라인 채널 문제가 들리는지 | 소음·채널 태그와 강도/마스킹 메모 |
| 비음성 | 웃음·박수·기침·재생음·침묵이 발화로 잘못 들어가면 안 되는 구간인지 | 비음성 태그·구간 |
| 깨끗한 1인 기준 | 실제로 한 사람만 말하는지, 다른 목소리·화면 밖 발화가 섞이지 않는지 | `single_speaker_control` 확정 또는 제외 |

확정할 수 없으면 억지로 화자나 관계를 정하지 않는다. 그 구간은 `AMBIGUOUS`와 사유로 남기며, 이 시간은 평가 분모에 넣을 때 별도 UEM 처리가 필요하다.

### 3-2. 7개 파일럿에서 들을 핵심

| 세션 | 우선 청취 판단 |
|---|---|
| `PILOT-001` | 패널의 실제 동시발화인지, 각 화자의 겹침 시작·종료, 잔향이 발화를 가리는지 |
| `PILOT-002` | 지속적인 청중/환경 소음이 있는지, 발화를 마스킹하는지, 시민 화자와 겹침이 있는지 |
| `PILOT-003` | 회의록의 화자 수를 믿지 말고 실제 5명 이상인지, 발화 구간과 긴 공백 후 동일 화자 여부 |
| `PILOT-004` | 먼 마이크·잔향·압축으로 발화가 약해지는 구간, 패널 겹침과 실제 화자 수 |
| `PILOT-005` | 비슷한 음색의 패널을 청취상 구분할 수 있는지, 혼동 구간과 겹침 구간 |
| `PILOT-006` | 짧은 새 발화와 늦게 들어온 화자의 정확한 시작·종료, 온라인 채널 특성 |
| `PILOT-007` | 정말 1인 기준인지, 숨은 두 번째 목소리나 과분리 원인이 없는지 |

후보 태그는 청취를 시작할 위치를 정하는 힌트일 뿐이다. 태그가 있다고 해서 상황이 확인된 것으로 보지 않으며, 공식 회의록·자동 자막·기존 모델 출력도 청취 판단을 대신하지 않는다.

### 3-3. 제가 파일·장부·계산으로 확인할 범위

| 확인 항목 | 확인 방법 | 사용자의 청취만으로 확정하지 않는 이유 |
|---|---|---|
| 원본 무결성 | 경로, SHA-256, 실제 길이, 오디오 트랙·코덱·채널·샘플레이트·UEM | 같은 영상인지와 평가 입력 범위는 소리 인상으로 확인할 수 없음 |
| 시간·카테고리 집계 | 후보 시간, 실제 확정 시간, 65/25/10 배분과 파일럿 4/3/1 시간을 장부로 재계산 | 전체 길이를 듣고도 어떤 시간으로 집계할지는 라벨·버킷 규칙의 문제 |
| 라벨 형식·누락 | 구간 겹침, 역전, 세션 ID, 필수 필드, 상태와 `trainingEligible` 연결 | 사람이 작성한 판단을 기계가 일관된 구조인지 검사해야 함 |
| 이중검수·합의 | 독립 검수자 수, 대상 비율, 충돌·adjudication 상태 | 한 사람이 잘 들었다는 사실만으로 독립성이나 합의 완료를 증명할 수 없음 |
| 권리 | 권리 보유자, 허가/라이선스 증거, 학습 허용 범위, 보존 조건 | 공개 URL·공개 영상이라는 사실이나 청취 내용만으로 학습권을 추정할 수 없음 |
| 데이터 누수·분할 | 원본·프로그램·장소·장비·화자 계보와 train/dev/sealed 관계 | 서로 다른 파일이 같은 출처인지 음성만으로 안전하게 보장할 수 없음 |
| DER/JER 및 slice | 같은 gold·UEM·프로토콜에서 기준모델과 후보 모델을 계산 | 지표는 사람의 인상평이 아니라 정답과 가설의 시간 비교 결과임 |
| 재현성 | 모델 버전, 가설 파일, 평가 계약, 실행 결과와 비용/환경 | 한 번의 청취 결과로 모델 실행이 재현되었는지 알 수 없음 |

권리의 최종 승인과 애매한 출처의 사실 확인에는 사용자의 증거 제공·승인이 필요할 수 있다. 다만 제가 권리 장부의 누락·범위 불일치·승격 차단을 검사하고, 증거가 없는 항목을 자동으로 승인하지 않는 역할을 맡는다.

### 3-4. 함께 확인하는 경계

- 사용자는 **청취로 gold 라벨을 확정**하고, 저는 그 라벨이 계약된 형식인지 검증한 뒤 평가기에 넣는다.
- 사용자는 모델 결과를 들으며 맞고 틀린 구간을 판단할 수 있지만, 그 판단을 바로 gold로 덮어쓰지 않는다. 원본 청취 라벨과 모델 가설을 별도 보존한다.
- 사용자가 `ambiguous`로 남긴 구간은 제가 0점이나 정상 구간으로 바꾸지 않는다. 분모 제외가 필요하면 UEM과 사유를 함께 기록한다.
- 청취 결과가 끝나면 제가 확정 시간·조건별 분모·이중검수율·권리·분할·DER/JER 게이트를 다시 계산한다.

따라서 사용자가 먼저 할 일은 7개 원본에서 위 표의 **청취 판단 항목만** 채우는 것이다. 파일 해시, 시간 합산, 평가 지표 계산, 승격 가능 여부는 제가 장부와 검증 결과로 분리해 보고한다.

## 4. 권리·분할·승격 게이트

공개 URL이나 포털 제공만으로 학습권한을 추정하지 않는다. 각 원본에 대해 권리 보유자·라이선스/허가 증거·학습 허용 범위·보존 조건·검토자·검토일을 장부에 남긴다.

권리 상태가 `approved`, `cleared`, `passed` 중 하나이고 증거 링크와 범위가 있어야 학습 승격을 검토한다. 권리 확인 전에는 내부 진단용으로만 사용하며 `trainingEligible=true`로 바꾸지 않는다.

분할은 원본·세션·프로그램·장소·장비·화자 계보를 비교한 뒤 고정한다.

- 사람 검수 전: `diagnostic_regression`, `regression`, `development`만 허용
- `train`, `dev`, `sealed_test`: 골드·권리·누수 검토가 모두 끝날 때까지 금지
- 같은 원본의 다른 인코딩·클립·자막 버전은 같은 계보로 묶는다.
- legacy KTV·brief는 새 파일럿 gold나 sealed test로 재사용하지 않는다.

## 5. 평가 지표 계약 `diarization-metrics.v2`

### 5-1. 연구 근거

[DIHARD 공식 평가 개요](https://dihardchallenge.github.io/dihard1/overview.html)의 DER 구성요소와 실제 잡음·잔향·겹침 평가 원칙, [pyannote.metrics 공식 API](https://pyannote.github.io/pyannote-metrics/reference.html)의 최적 일대일 매핑 기반 DER·JER·`skip_overlap` 설정을 적용한다. [공식 구현 문서](https://pyannote.github.io/pyannote-metrics/_modules/pyannote/metrics/diarization.html)의 JER·purity·coverage 정의도 함께 고정한다.

### 5-2. 고정 프로토콜

| 항목 | 계약값 |
|---|---|
| reference/hypothesis | multi-label RTTM + UEM |
| 평가 단위 | session |
| UEM | 기술 QC를 통과한 원본 전체 유효 구간 |
| collar | `0.0초` |
| main overlap | `skip_overlap=false`; 겹침 포함 |
| mapping | 세션별 Hungarian 최적 일대일 매핑 |
| 주 집계 | reference speaker-time 기준 micro |
| 보조 집계 | 세션 macro, 조건별 slice |
| 배타적 출력 | main 평가 입력으로 금지; 전사 대표 화자 파생물로만 사용 |
| 미정 값 | `null` + 분모 + 사유; 0으로 대체 금지 |
| 라이브러리 | `pyannote.metrics 4.1.x` 계열과 실제 버전 기록 |

`skip_overlap=true` 실행은 `overlap_excluded_control`이라는 보조 결과로만 남긴다.

### 5-3. 주지표와 필수 진단

| 지표 | 정의 | 역할 |
|---|---|---|
| `der` | `(false_alarm + miss + confusion) / reference_speaker_time` | 전체 주지표; 낮을수록 좋음 |
| `jer` | 최적 매핑 뒤 정답 화자별 Jaccard error의 macro 평균 | 화자별 불균형·재등장·fragmentation 보완 |
| `der_components` | false alarm·miss·confusion·분모 | 오류 원인 분리 |
| `overlap_activity_f1` | 활성 화자 2명 이상인 시간 영역의 duration F1 | 겹침 감지 여부 |
| `overlap_speaker_time_recall` | 겹침 화자 시간 중 올바른 귀속 비율 | 두 번째 화자를 버리는지 확인 |
| `purity`, `coverage` | merge와 fragmentation 진단 | cluster 안정성 |
| `same_speaker_reappearance_recall` | SAME 관계 중 같은 예측 cluster 유지 비율 | 긴 공백 후 분리 오류 |
| `short_turn_recall`, `late_entrant_recall` | 해당 조건의 올바른 화자 시간 비율 | 짧은 발화·늦은 화자 누락 |
| `single_speaker_extra_attributed_time_rate` | 1인 기준에서 dominant speaker 밖 예측 시간 비율 | 허위 화자·과분리 |

`boundary F1`, 전체 화자 수 일치, legacy `1:1 identity accuracy`는 보조·역사적 진단값이며 단독 통과 기준이 아니다. 전체 DER/JER가 좋아도 겹침·재등장 slice가 비어 있거나 악화되면 튜닝 성공으로 선언하지 않는다.

### 5-4. 조건별 slice

사람이 확정한 태그만 slice에 넣는다. 후보 태그를 gold 조건으로 사용하지 않는다.

| slice | 필수 결과 |
|---|---|
| `actual_overlap_speech` | slice DER/JER, overlap activity F1, overlap speaker-time recall |
| `stationary_background_noise` | slice DER/JER, DER components |
| `far_mic_or_reverb` | slice DER/JER, DER components |
| `similar_timbre` | slice DER/JER, DER confusion |
| `short_new_speaker` | slice DER/JER, short-turn/late-entrant recall |
| `long_gap_reappearance` | slice DER/JER, same-speaker reappearance recall |
| `single_speaker_control` | slice DER/JER, extra-attributed time rate |

분모가 없는 조건은 `NOT_OBSERVED`와 사유를 기록하며 0점으로 채우지 않는다.

### 5-5. 임계값 정책

첫 골드 기준모델이 나오기 전에는 절대 임계값을 임의로 정하지 않는다. 먼저 같은 gold 버전·UEM·collar·overlap 정책·mapping으로 기준모델을 실행한 뒤 전체 DER/JER 분포와 조건별 분모를 확인한다. 그 다음 후보 모델이 전체 주지표에서 회귀하지 않고 사전에 정한 hard-condition 오차 예산을 넘지 않는지 비교한다.

현재 상태는 `CALIBRATION_REQUIRED`이며, `null` 결과나 boundary F1만으로 PASS를 만들 수 없다.

## 6. 장부와 검증 명령

새 큐와 작업공간 생성:

```bash
python3 scripts/build-diarization-annotation-queue.py
python3 scripts/build-diarization-pilot-workspace.py
```

기존 라벨을 건드리지 않고 권리·분할·기준선·진행 장부만 갱신:

```bash
python3 scripts/build-diarization-pilot-workspace.py --refresh-ledgers
```

라벨 파일 검증:

```bash
python3 scripts/validate-diarization-labels.py \
  --labels <labels.json> \
  --queue Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/diarization-pilot-queue.v1.json
```

전체 게이트 감사:

```bash
python3 scripts/audit-diarization-pilot-gates.py
```

사람 gold와 Community-1 기준 가설 JSON이 모두 준비된 뒤 DER/JER를 계산하고 장부에 기록한다. 가설 파일명은 `hypotheses/SESSION_PILOT_001.hypothesis.v1.json`처럼 세션 ID를 맞춘다. `--write-ledger`가 없으면 결과만 출력하며 기존 기준선 장부를 바꾸지 않는다. 첫 실행에는 `model=pyannote/speaker-diarization-community-1`, 위 고정 리비전과 `outputType=speaker_diarization`을 반드시 기록한다.

```bash
python3 scripts/evaluate-diarization-pilot.py \
  --hypotheses-dir Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/hypotheses \
  --uem-dir Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/uem \
  --write-ledger
```

기준모델 가설에는 최소한 `model`, `modelVersion`, `runtimeVersion`, `outputType`, `sourceSha256`, `durationSec`, `segments[]`의 `startSec`, `endSec`, `speaker`를 넣는다. 겹침을 보존하는 일반 출력은 같은 시간에 여러 `speaker` 행을 남긴다. 사람이 확정하지 못한 `AMBIGUOUS` 시간이 있으면 그 시간을 제외한 UEM을 별도로 제공하지 않는 한 평가기는 실행을 거부한다.

기준모델 장부에는 `metricContractVersion`, `metricContract`, human gold 버전, UEM, main DER/JER, DER 구성요소, overlap 제외 보조 결과, 조건별 slice, 분모를 함께 기록한다. 결과가 없거나 필드가 비어 있으면 baseline gate는 PASS가 아니다.

## 7. 현재 남은 작업

1. 7개 원본을 영상 청취해 후보 조건을 `confirmed/not_present/ambiguous`로 확정한다.
2. 실제 발화·겹침·비음성·소음·재등장 관계를 `diarization-labels.v1`에 기록한다.
3. 고위험 구간 전수 검수와 전체 15~20% 독립 이중검수를 완료한다.
4. 출처별 권리 증거와 사용 범위를 채운다.
5. lineage 누수 검토 후 분할 장부를 승격한다.
6. 수정된 Community-1 runner의 일반 출력·배타적 출력 분리와 원본 타임라인 보존을 `PILOT-001` 10분 스모크에서 실제 확인한다.
7. 확정 gold에 고정 Community-1 기준선을 실행하고 새 DER/JER 프로토콜로 첫 오차 예산을 보정한다.
8. 가중치를 동결한 보정 후보를 같은 gold·UEM·프로토콜로 비교한다.
9. 보정으로 해결되지 않는 반복 오류가 확인된 경우에만 잔차 교정 모델을 평가한다.
10. train/dev 일반화와 Community-1 학습 호환성 검증을 통과한 경우에만 segmentation 미세조정으로 진행한다.

이 문서와 기계 장부가 모두 완료되기 전에는 `READY_FOR_GOLD_PROMOTION`, `trainingEligible`, `sealedTestEligible`를 선언하지 않는다. 또한 실제 가중치 학습과 독립 dev 개선이 없으면 `COMMUNITY1_FINE_TUNED`라고 기록하지 않는다.

## 8. 실제 청취 검수 절차

### 8-1. 검수에 사용하는 파일

처음에는 30시간 전체가 아니라 첫 파일럿 8.8685시간만 검수한다. 현재 7개 M4A 음원을 10분 단위 57개 창으로 나눈 `review-windows.v1.json`이 준비되어 있다. 창은 빠뜨리지 않기 위한 이동 경로일 뿐 gold 구간이 아니다.

첫 10분 창에서 후보 상황이 들리지 않았다고 세션 전체를 `not_present`로 확정하지 않는다. `candidateVerdict`는 해당 원본의 모든 검수 창을 확인한 뒤 최종 입력한다. 한 창에서 확인되지 않은 조건은 그 창의 구간 태그에서만 빠지며, 다른 창에서 실제로 발견될 수 있다.

검수자는 한 세션씩 다음 세 파일을 함께 연다.

1. 큐: `Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/diarization-pilot-queue.v1.json`
2. 검수 창: `Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/review-windows.v1.json`
3. 해당 라벨: `labels/SESSION_PILOT_00X.labels.v1.json`

로컬 검수는 변환 장부에서 무손실을 검증한 M4A를 사용한다. 화면 확인이 꼭 필요한 불확실 구간은 장부의 출처 URL을 별도로 열어 보조 증거로만 사용한다. 자동 자막·공식 회의록·기존 모델 결과와 화면 추정은 재생 위치를 찾는 참고자료일 뿐 화자·겹침 정답으로 복사하지 않는다.

### 8-2. 한 세션을 검수하는 순서

#### 1단계 — 재생과 시작점 확인

M4A 음성이 정상으로 재생되는지 확인하고, 첫 발화가 검수 창의 시간축과 맞는지 본다. 재생이 끊기거나 시작점이 어긋나면 라벨을 만들지 말고 메모에 남긴다.

#### 2단계 — 후보 상황을 먼저 판정

후보 태그가 실제로 들리는지 세 가지 중 하나로 판정한다.

| 판정 | 의미 |
|---|---|
| `confirmed` | 해당 상황을 사람 청취로 확인함 |
| `not_present` | 후보로 보였지만 실제 음성에서는 확인되지 않음 |
| `ambiguous` | 일부 증거는 있으나 사람 청취만으로 확정할 수 없음 |

후보 태그가 `actual_overlap_speech_candidate`라고 되어 있어도 실제 동시발화가 없으면 `not_present`다. 반대로 실제로 확인된 구간의 `segments[].tags`에는 `_candidate`가 아닌 확정 태그를 넣는다. 후보 태그는 세션의 원래 `candidateTags`에만 보존한다.

#### 3단계 — 세션 안의 화자 ID를 먼저 정함

처음 들린 화자부터 `SPK_01`, `SPK_02`, `SPK_03` 순서로 붙인다. 이 ID는 해당 세션 안에서만 사용한다.

- 세션이 바뀌면 다시 `SPK_01`부터 시작한다.
- 화면의 이름이나 회의록 이름을 ID로 쓰지 않는다.
- 긴 공백 뒤 목소리가 비슷하다는 이유만으로 기존 ID에 자동 병합하지 않는다.
- 같은 사람이라고 확신하기 어렵다면 관계를 억지로 만들지 않고 해당 구간을 `AMBIGUOUS`로 남긴다.

#### 4단계 — 실제 발화 구간을 기록

말이 들리는 모든 구간을 `startSec`부터 `endSec`까지 기록한다. 자연스러운 짧은 호흡·단어 사이의 미세한 멈춤은 같은 발화로 둘 수 있지만, 발화가 끝난 뒤의 명확한 침묵이나 다른 화자의 발화는 새 구간으로 나눈다.

화자가 바뀌지 않았더라도 긴 공백 후 다시 말하면 별도 구간으로 나누어야 `speakerRelations`를 기록할 수 있다. 일반적인 침묵만으로 모든 구간을 채울 필요는 없지만, 박수·웃음·기침·재생음처럼 화자분리에 영향을 주는 비음성은 별도 구간으로 표시한다.

#### 5단계 — 동시발화는 절대 한 화자로 합치지 않음

두 사람이 동시에 말하면 화자별 행을 따로 만들고 같은 `overlapGroupId`를 붙인다. 순서대로 말한 것뿐이면 `overlapGroupId`를 붙이지 않는다.

```json
{
  "segmentId": "SEG_001",
  "startSec": 120.40,
  "endSec": 122.10,
  "speakerLocalId": ["SPK_01"],
  "overlapGroupId": "OVL_007",
  "tags": ["actual_overlap_speech"],
  "confidence": "high",
  "reviewStatus": "REVIEWED",
  "ambiguousReason": null,
  "evidenceSource": "human_listening"
}
```

```json
{
  "segmentId": "SEG_002",
  "startSec": 121.15,
  "endSec": 123.00,
  "speakerLocalId": ["SPK_02"],
  "overlapGroupId": "OVL_007",
  "tags": ["actual_overlap_speech"],
  "confidence": "high",
  "reviewStatus": "REVIEWED",
  "ambiguousReason": null,
  "evidenceSource": "human_listening"
}
```

한 행에 `speakerLocalId: ["SPK_01", "SPK_02"]`로 두 화자를 넣어 겹침을 표현하지 않는다. 이 파일럿의 검증기는 겹침을 서로 다른 두 행과 동일한 `overlapGroupId`로 확인한다.

#### 6단계 — 조건 태그를 실제 구간에 붙임

상황 태그는 세션 전체에 막연히 붙이지 말고 해당 소리가 영향을 준 발화 구간에 붙인다.

| 실제로 확인한 상황 | 확정 태그 |
|---|---|
| 동시에 말함 | `actual_overlap_speech` |
| 발화 중 지속적인 배경소음 | `stationary_background_noise` |
| 먼 마이크·잔향·저음량 | `far_mic_or_reverb` |
| 서로 다른 화자의 음색이 비슷함 | `similar_timbre` |
| 짧은 새 화자·늦은 진입 | `short_new_speaker` 또는 `late_entrant` |
| 긴 공백 뒤 같은 화자 재등장 | `long_gap_reappearance` |
| 단일 화자 기준 구간 | `single_speaker_control` |

고립된 한 번의 기침·박수는 지속 배경소음으로 태그하지 않는다. 불특정 다수의 웅성거림이 개별 화자로 분리되지 않으면 화자 ID를 새로 만들지 말고, 비음성/배경음 이벤트 또는 `AMBIGUOUS` 사유로 남긴다.

#### 7단계 — 비음성 구간 기록

비음성 이벤트는 화자 ID를 비워 둔다.

```json
{
  "segmentId": "SEG_003",
  "startSec": 130.20,
  "endSec": 131.80,
  "speakerLocalId": [],
  "overlapGroupId": null,
  "tags": ["non_speech_event", "applause"],
  "confidence": "high",
  "reviewStatus": "REVIEWED",
  "ambiguousReason": null,
  "evidenceSource": "human_listening"
}
```

화자 발화와 웃음이 이어져도 웃음만 따로 떼어 표시하기 어려우면 발화 구간의 메모에 남기고 억지로 시간을 나누지 않는다. 분리 가능한 경우에만 별도 비음성 행을 만든다.

#### 8단계 — 긴 공백 후 재등장 관계 기록

앞뒤 구간의 화자가 같다고 확신할 때만 관계를 만든다.

```json
{
  "relationId": "REL_001",
  "type": "SAME_SPEAKER_REAPPEARANCE",
  "firstSegmentId": "SEG_010",
  "secondSegmentId": "SEG_024",
  "gapSec": 42.30,
  "reviewStatus": "REVIEWED",
  "evidenceSource": "human_listening"
}
```

같은 사람인지 다른 사람인지 구분하기 어려우면 `SAME_SPEAKER_REAPPEARANCE`를 만들지 않는다. 별도 구간을 `AMBIGUOUS`로 두고 `ambiguousReason`에 “음색이 유사하지만 이전 화자와 동일성 확정 불가”처럼 적는다.

#### 9단계 — 애매한 구간 처리

애매함은 실패가 아니라 정답 품질을 지키기 위한 결과다.

```json
{
  "segmentId": "SEG_025",
  "startSec": 410.50,
  "endSec": 412.20,
  "speakerLocalId": [],
  "overlapGroupId": null,
  "tags": ["similar_timbre"],
  "confidence": "low",
  "reviewStatus": "AMBIGUOUS",
  "ambiguousReason": "두 화자의 음성이 겹쳐 어느 화자의 발화인지 확정할 수 없음",
  "evidenceSource": "human_listening"
}
```

애매한 구간을 임의로 `SPK_01`이나 `SPK_02`에 넣지 않는다. 제가 나중에 이 시간을 평가에서 제외할 UEM으로 만들지, 이중검수·합의로 살릴지 별도로 처리한다.

### 8-3. 세션을 끝낼 때 채우는 값

한 원본의 모든 검수 창을 끝내면 라벨 파일의 다음 값을 채운다.

- `classification.candidateVerdict`: `confirmed` / `not_present` / `ambiguous`
- `classification.speakerProfile`: `multi_speaker_turn_taking` / `multi_speaker_overlap` / `single_speaker_control`
- `classification.speakerProfile`의 실제 화자 수 메모
- `classification.noiseProfile`: 실제로 들린 소음 종류·지속성·마스킹 정도
- `review.status`: 첫 검수 완료 시 `REVIEWED`
- `review.reviewerIds`, `review.reviewedAt`, `review.notes`
- `segments`, `speakerRelations`, 필요 시 `events`

권리·분할·`trainingEligible`·`sealedTestEligible`는 검수자가 바꾸지 않는다. 그 값은 별도 장부와 게이트 검증에서 처리한다.

### 8-4. 검수자가 저에게 전달하면 되는 형식

JSON을 직접 편집하기 불편하면 아래처럼 세션과 시간만 보내도 된다. 제가 라벨 파일로 옮긴 뒤 구조 검증을 실행한다.

```text
세션: PILOT-001
검수자: reviewer-01
후보 판정: confirmed
실제 화자 수: 4
화자 프로필: multi_speaker_overlap

구간
- 120.40–122.10 / SPK_01 / actual_overlap_speech / high / REVIEWED
- 121.15–123.00 / SPK_02 / actual_overlap_speech / high / REVIEWED
- 130.20–131.80 / 비음성·박수 / high / REVIEWED

관계
- SEG_010–SEG_024 / 같은 화자 재등장 / 42.30초 / REVIEWED

메모
- 410.50–412.20은 두 화자 음성이 겹쳐 화자 확정 불가
```

검수 결과를 받은 뒤에는 제가 원본 SHA-256·길이와 대조하고, 구간·겹침·관계·애매함을 검증하며, 진행 장부와 게이트 상태를 갱신한다. 검수 파일이 구조적으로 통과해도 독립 이중검수와 권리 확인 전에는 gold·학습 데이터로 승격하지 않는다.

### 8-5. 사용자가 작성할 가장 쉬운 양식

사용자는 JSON을 직접 작성하지 않는다. `SPK_01` 같은 ID, 초 단위 변환, `overlapGroupId`, 해시, 권리 상태는 제가 채운다. 사용자는 원본을 들으면서 아래 다섯 가지만 적는다.

1. 세션과 창 번호
2. 이 창에서 후보 상황이 `있음`·`없음`·`모름` 중 무엇인지
3. 화자를 `A`, `B`, `C`처럼 구분한 결과
4. 말이 나온 시간과 겹침·박수·애매함 같은 표시
5. 소음·잔향·재등장에 대한 짧은 메모

복사해서 쓰는 양식:

```text
세션/창: PILOT-001 / W001 (00:00–10:00)

이 창의 후보 상황: 있음 / 없음 / 모름
화자: A, B, C (모르면 모름)

발화 구간:
- 02:00–02:02 / A / 일반 발화
- 02:01–02:03 / B / 겹침
- 03:20–03:22 / 박수
- 05:10–05:12 / 모름 / 화자 확정 불가

재등장:
- A가 00:30 이후 다시 등장한 것 같음 / 확실함·모름

소음·녹음 메모:
- 04:00 이후 잔향이 커짐
- 관객 소리가 말소리를 조금 가림

애매한 부분:
- 05:10–05:12는 A와 B 중 누구인지 모름
```

더 짧게 적어도 된다.

```text
PILOT-001 W001
후보: 있음
02:00–02:02 A, 02:01–02:03 B 겹침
03:20–03:22 박수
05:10–05:12 A/B 구분 안 됨
04:00부터 잔향과 관객 소음 있음
```

여기서 `A`와 `B`는 사용자가 기억하기 위한 임시 이름이다. 제가 세션 안에서 `SPK_01`, `SPK_02`로 바꾸고, 시간이 겹치는 두 행에 같은 겹침 ID를 붙인다. `02:00`처럼 분:초로 적어도 되고, `120.40초`처럼 초로 적어도 된다. 발화 내용 자체를 받아쓰지는 않는다.

단, gold 평가를 하기 위해서는 선택한 원본의 실제 발화 구간을 빠뜨리지 않고 기록해야 한다. 위 양식은 이를 쉽게 입력하기 위한 형식이며, 한 창의 모든 발화를 적은 뒤에 제가 JSON으로 변환한다. 처음에는 `PILOT-001 / W001` 한 창만 해 보고, 형식이 맞는지 확인한 후 다음 창으로 넘어간다.

## 9. 역사적 결과와 문서 정리 규칙

KTV·brief의 기존 Community-1 결과는 이 모델을 목표로 선택한 근거이자 재현·회귀 근거로 보존하지만 새 파일럿 gold로 이관하지 않는다. KTV에서는 중요한 화자 전환을 통과하고 boundary F1 `0.769`를 기록했지만, 미지 영상 `brief-startup`에서는 늦게 등장한 짧은 신규 화자를 긴 발화 화자와 병합했다. 따라서 Community-1은 현재 **정확도 우선 기준선**이지, 한국어 회의 환경에 이미 승격된 최종 모델이 아니다. 상세 실행 사건과 정확한 분모·실행 환경은 [실험 사건 원장](speaker-diarization-experiment-ledger.md)의 역사적 기록으로만 읽는다.

이전 런북과 지표 계약은 [`docs/archive/`](archive/)에 보존한다. 새 운영 변경은 이 문서에만 반영한다.

## 10. 기계 전처리와 사람 판단의 협업 방식

사용자는 초 단위 시작·종료를 직접 작성하지 않는다. Community-1과 기계 분석이 먼저 정확한 후보 구간, 예상 화자 cluster, 겹침·짧은 화자·재등장 후보와 짧은 재생 창을 만든다. 사용자는 카드에 표시된 구간을 듣거나 화면을 보고 **상황 판단만** 답한다.

### 10-1. 기계가 먼저 만드는 것

1. Community-1 일반 `speaker_diarization`과 배타적 출력을 별도 보존한다.
2. 일반 출력에서 두 화자 이상이 동시에 활성인 구간을 겹침 후보로 만든다.
3. 2.5초 이하 짧은 발화, 60초 이후 처음 등장한 짧은 cluster, 30초 이상 공백 뒤 재등장한 cluster를 후보로 만든다.
4. 1인 기준 영상에서 dominant cluster가 아닌 모든 구간을 과분리 후보로 만든다.
5. 각 후보 앞뒤 5초를 포함한 짧은 영상과 6장 contact sheet를 만든다. 긴 공백 뒤 재등장은 공백 전체를 재생하지 않고 앞 발화 끝과 뒤 발화 시작의 짧은 두 클립만 이어 붙인다.
6. 화면 전환·보이는 인물·마이크·이름표는 보조 단서로 기록하지만, 화면에 보인 사람만으로 화자 gold를 확정하지 않는다.

### 10-2. 사용자가 답할 내용

카드 ID와 아래와 같은 판단만 전달하면 된다. 시간은 적지 않는다.

- `겹침 맞음`
- `순서대로 말했을 뿐 겹침 아님`
- `끼어들었지만 실제 동시발화는 아님`
- `같은 사람`
- `다른 사람`
- `말이 아니라 박수·웃음·재생음`
- `잘 모르겠음`

제가 이 답을 카드의 허용값으로 변환하고, 기계가 제안한 구간·원본 SHA-256·모델 리비전·사람 판단을 함께 장부와 해당 세션 라벨의 `events`에 등록한다. 사용자가 시간을 입력하지 않았다는 사실도 provenance에 남긴다.

### 10-3. 자동 등록과 gold의 경계

사람의 상황 판단을 받았더라도 기계 경계는 즉시 gold가 아니다. 먼저 `HUMAN_DECISION_RECORDED_MACHINE_BOUNDARY_NOT_YET_GOLD`로 등록한다. 해당 세션의 전체 발화 coverage, cluster-to-`SPK_*` 매핑, 애매 구간, 독립 이중검수를 확인한 뒤에만 실제 `segments`와 gold 상태로 승격한다. 따라서 자동 전처리 오류가 곧바로 학습 정답에 섞이지 않는다.

### 10-4. 실행 명령

Vast.ai 전체 기준선 계획은 10분 발췌가 아니라 7개 원본 전체 8.8685시간을 대상으로 한다. 먼저 원본 7개와 오프라인 모델의 SHA-256·길이를 다시 검사하고, 외부 전송물은 만들지 않은 계획만 생성한다.

```bash
python3 scripts/prepare-community1-vast-bundle.py
```

Vast.ai Secure Cloud의 실제 offer, 시간당 총비용, GPU·RAM·디스크, 외부 처리 승인을 확인한 뒤에만 임시 무손실 음성 bundle을 만든다. 이 파생물은 원본·gold·수집 시간으로 세지 않는다.

```bash
python3 scripts/prepare-community1-vast-bundle.py \
  --materialize \
  --confirm-external-processing
```

Vast.ai 컨테이너에서는 세션 단위 체크포인트와 재시작을 지원하는 배치 실행기를 사용한다. `<실제 시간당 총비용>`에는 GPU뿐 아니라 Vast.ai offer에 표시된 총 시간당 비용을 넣는다.

```bash
python /app/vast_batch.py \
  --manifest /workspace/faith-community1/batch-manifest.v1.json \
  --runner /app/run.py \
  --output-dir /workspace/faith-community1/output \
  --hourly-usd <실제 시간당 총비용>
```

결과를 로컬로 받은 뒤 먼저 읽기 전용 감사를 통과시키고, 통과한 동일 파일만 가설 폴더로 가져온다. 기존 가설과 해시가 다르면 덮어쓰지 않는다.

```bash
python3 scripts/collect-community1-vast-results.py \
  --manifest .data/vast/community1-full-baseline/batch-manifest.v1.json \
  --results-dir <다운로드한-output-경로>

python3 scripts/collect-community1-vast-results.py \
  --manifest .data/vast/community1-full-baseline/batch-manifest.v1.json \
  --results-dir <다운로드한-output-경로> \
  --import-results

python3 scripts/prepare-community1-preannotation.py
```

그 뒤 한 검수 카드의 짧은 영상·contact sheet를 만들고 사용자 판단을 시간 입력 없이 등록한다. 어느 명령도 gold를 자동 승격하지 않는다.

```bash
python3 scripts/render-diarization-review-card.py --card-id <CARD_ID>

python3 scripts/register-diarization-review-decision.py \
  --card-id <CARD_ID> \
  --decision <ALLOWED_DECISION> \
  --notes '<사용자가 들은 내용>'
```

### 10-5. Vast.ai 전체 기준선 실행 제한

첫 유료 실행의 최종 목표는 7개 전체 8.8685시간의 고정 Community-1 기준 가설이다. 다만 잘못된 CUDA·모델·입출력 환경으로 전체 비용을 잃지 않도록 `PILOT-006` 전체 세션을 첫 canary로 사용한다. 10분 발췌가 아니라 짧은 신규 화자·늦은 진입 조건을 포함한 약 27분 전체 세션이며, 같은 GPU·모델·seed로 두 번 실행해 일반·배타적 출력이 정확히 재현될 때만 나머지 6개를 계속한다.

- Vast.ai `Secure Cloud`, 첫 전체 실행은 `on-demand`, GPU VRAM 24 GiB 이상, 시스템 RAM 32 GiB 이상, 디스크 50 GiB 이상을 요구한다.
- 각 세션은 독립 결과·로그·heartbeat를 저장한다. 중단되면 해시·출력 계약을 통과한 세션만 재사용하고 실패 세션부터 다시 실행한다.
- CUDA가 없으면 CPU로 조용히 전환하지 않고 실패한다.
- 원본·파생 음성·모델 archive SHA-256, 모델 리비전, 런타임, GPU, seed, 비용을 결과에 기록한다.
- 일반 `speaker_diarization`이 main이며 배타적 출력으로 대체하지 않는다.
- 결과를 외부 저장소나 로컬로 내려받아 해시 검증하기 전에는 인스턴스를 파기하지 않는다.
- 결과를 검증한 뒤 인스턴스와 임시 volume을 파기한다. 중지만 한 저장공간은 계속 과금될 수 있다.
- API 키·클라우드 장기 자격증명·고객 음성은 인스턴스나 이미지에 넣지 않는다.
- 현재 공개 후보는 진단 전처리에만 사용한다. 권리 승인·사람 gold·안전한 split 전에는 `trainingEligible=false`를 유지한다.

### 10-6. GPU 결과와 실제 학습의 경계

전체 GPU 기준선이 성공해도 이는 `PREANNOTATED` 가설일 뿐 학습 성공이 아니다. 사람 검수·독립 이중검수·권리·split·DER/JER 기준선이 완료된 뒤 먼저 clustering·화자 수·후처리 보정을 평가한다. 그 잔차가 train/dev에서 반복될 때만 Community-1 segmentation 학습 호환성을 별도 GPU 실험으로 검증한다. 체크포인트 저장·재시작·기준선 대비 회귀 검사가 재현되기 전에는 장시간 미세조정이나 interruptible 인스턴스를 사용하지 않는다.
