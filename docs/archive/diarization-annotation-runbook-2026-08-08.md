# 화자분리 파일럿 사람 검수 런북 v1 — 보존용 이전 문서

> 운영 기준은 [Faith Community-1 화자분리 튜닝 파일럿](../faith-stt-diarization-pilot.md) 하나다. 이 파일은 병합 전 원문 보존용이며 새 변경을 반영하지 않는다.

작성일: 2026-08-08  
상태: `READY_FOR_HUMAN_REVIEW`  
범위: 추가 튜닝 전 5~10시간 파일럿

## 현재 결론

현재 자료는 화자분리 튜닝 방향과 후보 시간을 보여주지만, 아직 골드 데이터가 아니다. 자동 자막, 공식 회의록, 기존 모델 출력은 화자 시각 정답으로 사용하지 않는다.

`04_qa`가 비어 있었기 때문에 먼저 원본 manifest를 읽어 사람 검수 큐를 만들었다. 큐에는 다음 7개 원본 후보가 들어 있으며, 원본 길이 합은 약 8.87시간이다.

- 실제 동시발화 후보
- 자연 배경소음·청중 분위기 후보
- 5명 이상 다화자 회의 후보
- 원거리·잔향 후보
- 비슷한 발음·음색 후보
- 짧은 새 화자·늦은 진입 후보
- 깨끗한 1인 기준 후보

이 8.87시간은 `candidate source hours`일 뿐이며, `confirmedSituationHours`, `gold hours`, `trainingEligible` 시간으로 집계하지 않는다. 조건의 실제 존재 여부는 사람이 영상을 듣고 라벨링한 뒤에만 확정한다.

원본 파일을 통째로 큐에 넣었기 때문에 현재 후보 bucket 합은 상황 집중 5.95시간, 자연 복합 2.17시간, 깨끗한 기준 0.75시간이다. 문서의 4/3/1시간은 사람 검수로 실제 구간을 확정한 파일럿 구성 목표이지, 후보 원본을 단순 합산한 값이 아니다. 따라서 아래 큐를 완료로 표시하지 않고, 사람 검수 때 실제 구간을 4/3/1에 맞춰 기록하거나 부족한 bucket만 보강한다.

큐 파일:

`Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/diarization-pilot-queue.v1.json`

재생성:

```bash
python3 scripts/build-diarization-annotation-queue.py
python3 scripts/build-diarization-pilot-workspace.py
```

두 번째 명령은 원본별 빈 라벨 파일, 권리 장부, 분할 장부, 기준모델 평가 장부와 진행 장부를 만든다. 이미 라벨이 있으면 기본 동작은 덮어쓰기를 거부한다. metadata가 바뀐 뒤 권리·분할·평가·진행 장부만 갱신할 때는 다음 명령을 사용한다.

```bash
python3 scripts/build-diarization-pilot-workspace.py --refresh-ledgers
```

현재 게이트 상태를 확인한다.

```bash
python3 scripts/audit-diarization-pilot-gates.py
```

감사 결과는 다음 파일에 저장된다.

`Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/pilot-gate-report.v1.json`

원본을 10분 단위로 연속 분할한 검수 창은 다음 장부에 있다. 창의 시작·끝은 탐색용이며, 사람 검수 전에는 gold 구간으로 세지 않는다.

`Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/review-windows.v1.json`

현재 판정은 `NOT_READY`이며, intake만 `PASS`, 분할은 `PASS_QUARANTINE`이다. 사람 라벨·이중검수·권리·기준모델 평가가 실제로 채워지기 전에는 `READY_FOR_GOLD_PROMOTION`으로 바뀌지 않는다.

기존 기준선은 별도로 보존한다. 캐시 전용 KTV 장부는 43개 실행을 재평가했으며, Community-1 미지 fixture 일반화는 `brief-mou`만 통과하고 `brief-startup`은 화자 수 8→7, 경계 F1 0.615로 실패했다. 이 결과는 새 파일럿 gold가 아니며, 새 원본에 대한 추가 튜닝 필요성을 보여 주는 regression 근거로만 사용한다.

## 평가 지표 계약 v2

사람 검수 후 기준모델을 평가할 때는 [통합 문서](../faith-stt-diarization-pilot.md)의 `metricContractVersion`을 함께 고정한다. 기존 KTV·brief 결과의 경계 F1은 역사적 회귀 진단값으로만 남기고 새 파일럿의 주지표로 재사용하지 않는다.

| 구분 | 새 파일럿에서의 지표 | 판정 역할 |
|---|---|---|
| 전체 주지표 | overlap-inclusive `DER`, `JER` | 기준모델 대비 전체 성능·화자별 불균형 확인 |
| 원인 분해 | DER의 `false_alarm`, `miss`, `confusion`, reference speaker-time | 놓침·오탐·화자 혼동 분리 |
| 겹침 필수 진단 | overlap activity F1, overlap speaker-time recall, 겹침 slice DER/JER | 두 사람이 동시에 말하는 구간을 감지하고 두 화자를 모두 귀속했는지 확인 |
| 재등장·짧은 발화 | same-speaker reappearance recall, short-turn recall, late-entrant recall | 같은 화자 재등장 분리·짧은 새 화자 누락 확인 |
| 분리 안정성 | single-speaker extra-attributed time rate, purity, coverage | 1인 구간 허위 화자·merge·fragmentation 확인 |
| 보조값 | boundary F1, speaker-count error, 선택적 framewise MI | 원인 탐색용; 단독 통과 기준 아님 |

평가 프로토콜은 `multi-label RTTM + UEM`, `collar=0.0초`, `skip_overlap=false`, 세션별 최적 일대일 매핑, reference speaker-time 기준 micro 집계로 고정한다. 같은 파일을 `skip_overlap=true`로 다시 계산하는 값은 겹침을 제외했을 때의 원인 분리용 보조값이다. 배타적 diarization 출력은 이 주평가 입력으로 사용할 수 없다.

첫 사람 골드가 만들어지기 전에는 절대 점수 임계값을 임의로 선언하지 않는다. 장부 상태는 `CALIBRATION_REQUIRED`로 두고, 첫 기준모델 실행 후 같은 gold·UEM·프로토콜에서 후보 모델과 비교할 오차 예산을 선언한다. 값이 없는 slice는 0점으로 채우지 않고 분모와 사유를 함께 `null`로 기록한다.

## 첫 검수 순서

각 task마다 원본 MP4를 재생하면서 다음 순서로 기록한다.

1. 영상과 음성 트랙이 같은 시작점에서 재생되는지 확인한다.
2. 후보 태그가 실제로 들리는지 `confirmed`, `not_present`, `ambiguous` 중 하나로 판정한다.
3. 세션 안에서만 유효한 `SPK_01`, `SPK_02` 형식의 `speakerLocalId`를 부여한다.
4. 실제 발화마다 `startSec`, `endSec`를 기록한다. 사람의 발화가 끊기면 같은 화자의 여러 행으로 나눈다.
5. 동시에 말한 구간은 화자별로 행을 따로 만들고 동일한 `overlapGroupId`를 붙인다.
6. 새 화자, 짧은 질문·맞장구, 긴 공백 후 재등장, 웃음·박수·기침·재생음·무음을 각각 표시한다.
7. 소음의 종류·지속성·강도·말소리 마스킹 여부와 마이크 거리·채널 정보를 기록한다.
8. 확정할 수 없는 구간은 억지로 화자에 합치지 않고 `AMBIGUOUS`와 사유를 남긴다.

겹침은 다음처럼 한 시간창에 여러 화자 행을 보존해야 한다.

```text
session=PILOT-001, start=120.40, end=122.10, speaker=SPK_01, overlap=OVL_07
session=PILOT-001, start=121.15, end=123.00, speaker=SPK_02, overlap=OVL_07
```

## 최소 저장 계약

세션 manifest에는 다음을 남긴다.

- `sessionId`, `sourceId`, 원본 상대경로, SHA-256, 실제 영상 길이
- `primaryDomain`, `primaryBucket`, `primaryFocus`, 보조 상황 태그
- 실제 검수 후의 화자 수·화자 등장 순서·`speakerProfile`
- 소음·녹음·채널·마이크 환경
- `split`, `privacyClass`, `rightsStatus`, `annotationVersion`
- `goldLevels`별 상태

구간 라벨에는 다음 필드를 사용한다.

`segmentId`, `startSec`, `endSec`, `speakerLocalId[]`, `overlapGroupId`, `tags[]`, `confidence`, `reviewStatus`, `ambiguousReason`, `evidenceSource`

긴 공백 후 동일 화자 여부를 직접 평가할 수 있도록, 확인된 쌍은 `speakerRelations`에 남긴다. `SAME_SPEAKER_REAPPEARANCE` 관계에는 `relationId`, `firstSegmentId`, `secondSegmentId`, `gapSec`, `reviewStatus`, `evidenceSource`를 기록한다. 이는 세션 내부 identity 진단용이며 전역 화자 ID나 자동 예측을 gold로 간주하는 필드가 아니다.

`PREANNOTATED`는 초벌 결과일 뿐 골드가 아니다. 골드 승격은 `REVIEWED`, `DOUBLE_REVIEWED`, `ADJUDICATED` 중 문서 규칙을 만족한 구간에만 허용한다.

사람 검수 결과는 `diarization-labels.v1` 형식으로 저장하고, 큐의 원본 경로·SHA-256·길이를 그대로 복사한다. `speakerLocalId[]`는 JSON에서는 `speakerLocalId` 배열로 저장한다.

검수 파일을 승격 전에 검사한다.

```bash
python3 scripts/validate-diarization-labels.py \
  --labels <labels.json> \
  --queue Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/diarization-pilot-queue.v1.json
```

검증기는 다음을 실패 처리한다.

- 원본 SHA-256·길이·경로가 큐와 다름
- 음수·역전·원본 길이 밖의 구간
- 세션 밖 전역 화자 ID, 중복 구간 ID, 잘못된 검수 상태
- 겹침 구간에 여러 화자 행이나 같은 `overlapGroupId`가 없음
- `AMBIGUOUS` 사유, 비음성 이벤트 태그, `evidenceSource`가 없음
- 두 명의 독립 검수 없이 `DOUBLE_REVIEWED`·`ADJUDICATED`로 표시
- `PREANNOTATED`가 남아 있는데 `trainingEligible=true`로 요청함

권리 상태가 승인되지 않았거나 검수 상태가 승격 가능한 상태가 아니면, 구조 검증이 통과해도 `eligibleForGold=false`로 남는다.

## 이 파일럿의 완료 조건

- 두 명 이상의 실제 화자와 발언 구간을 사람 청취로 확인한다.
- 실제 겹침과 단순 발언 전환을 별도 구조로 저장한다.
- 배경소음 후보가 실제 소음인지, 지속성·강도·마스킹 정도가 무엇인지 기록한다.
- 짧은 새 화자와 긴 공백 후 재등장을 기존 화자에 자동 병합하지 않는다.
- 비슷한 음색 후보의 동일인 여부를 추측하지 않고 세션 내부 근거로만 결정한다.
- 고위험 구간은 전수 검수하고, 전체의 15~20%는 독립 이중 검수한다.
- 충돌은 합의본을 만들고, 판단 불가 구간은 `AMBIGUOUS`로 남긴다.
- 출처 사용권한 확인 전에는 `trainingEligible=true`로 바꾸지 않는다.
- word gold가 없는 상태에서 word MAE를 화자분리 성능으로 보고하지 않는다.
- `boundary F1`이나 전체 화자 수 일치만으로 화자분리 통과를 선언하지 않는다. 새 gold 평가는 반드시 `DER/JER`와 관측된 hard-condition slice 결과를 함께 남긴다.

## 파일럿 뒤에 남아 있는 후속 작업

공식 회의의 긴 공백 후 재등장 후보 4개는 큐의 `followupTasks`에 따로 넣었다. 현재 공식 회의록 기반 위치는 발언 시작점 후보일 뿐이고, 발언 끝·동일 화자 여부·정확한 구간이 없다. 따라서 첫 파일럿을 마친 뒤 영상 청취와 구간 정렬을 별도로 수행한다.

이 큐의 완료만으로 25시간 상황 집중 목표가 완료되는 것은 아니다. 파일럿에서 실제로 확인된 조건별 시간, 독립 검수율, 충돌 유형, 라벨링 시간과 QC 시간을 기록한 뒤 부족한 조건만 추가 수집한다.
