# Faith 화자분리 평가 지표 계약 v2 — 보존용 이전 문서

> 운영 기준은 [Faith Community-1 화자분리 튜닝 파일럿](../faith-stt-diarization-pilot.md) 하나다. 이 파일은 병합 전 원문 보존용이며 새 변경을 반영하지 않는다.

작성일: 2026-08-08  
상태: `ACTIVE_FOR_PILOT_DESIGN`  
적용 범위: 추가 튜닝 전 사람 검수 파일럿과 이후 기준모델·후보모델 비교

## 결론

새 파일럿의 주지표는 `boundary F1`이 아니라 `DER`와 `JER`로 바꾼다.

`DER`는 화자 시간 기준으로 false alarm·miss·confusion을 분해해 전체 오류의 원인을 보여 주고, `JER`는 최적 일대일 매핑 뒤 화자별 Jaccard 오류를 평균내 긴 공백 후 재등장, fragmentation, merge의 불균형을 보완한다. 두 점수 모두 낮을수록 좋다.

다만 전체 DER/JER만으로는 비중이 작은 실제 겹침이나 짧은 새 화자 오류가 희석될 수 있다. 따라서 이 프로젝트의 수집 목적에 맞춰 다음 조건별 진단을 필수로 함께 보고한다.

- 실제 겹침: overlap activity F1, overlap speaker-time recall, overlap slice DER/JER
- 긴 공백 후 재등장: same-speaker reappearance recall, slice DER/JER
- 짧은 발화·늦은 진입: short-turn recall, late-entrant recall, slice DER/JER
- 비슷한 음색·원거리/잔향·고정 소음: 각 slice DER/JER와 DER components
- 1인 기준: single-speaker extra-attributed time rate

`boundary F1`, 전체 화자 수 일치, 기존 `1:1 identity accuracy`는 원인 탐색과 과거 fixture 회귀용으로만 보존한다. 어떤 것도 새 파일럿의 단독 통과 기준이 아니다.

## 조사 근거와 적용 범위

### DIHARD/NIST 계열

[DIHARD 공식 평가 개요](https://dihardchallenge.github.io/dihard1/overview.html)는 DER을 정답 화자 시간 중 최적 일대일 매핑으로 올바르게 귀속되지 않은 시간의 비율로 보고, false alarm·miss·error를 구성요소로 분해한다. 또한 겹침·잡음·잔향·웹 비디오처럼 실제 조건이 섞인 자료에서 DER과 framewise mutual information을 함께 사용한다.

Faith의 주목표가 실제 겹침을 포함한 화자분리이므로, main score에서는 겹침을 제거하지 않는다. DIHARD의 보조 관점을 참고해 framewise MI는 구현 가능한 평가 환경에서만 선택적으로 보고한다. MI가 없다고 DER/JER 결과를 무효화하지는 않는다.

### pyannote.metrics

[pyannote.metrics의 DER API](https://pyannote.github.io/pyannote-metrics/reference.html)는 Hungarian 최적 매핑 기반 `DiarizationErrorRate`와 `collar`, `skip_overlap`을 명시적으로 제공한다. 현재 계약은 재현성을 위해 `collar=0.0`, `skip_overlap=false`를 고정한다.

[공식 diarization 구현 문서](https://pyannote.github.io/pyannote-metrics/_modules/pyannote/metrics/diarization.html)는 JER 구현과 화자별 집계, overlap을 포함하거나 제외하는 동작, purity·coverage 진단을 제공한다. 따라서 `JER`, `purity`, `coverage`를 같은 metric runner에서 계산하되, pyannote.metrics 버전과 UEM을 실행 장부에 고정한다.

## 고정 프로토콜

| 항목 | 계약값 |
|---|---|
| 정답 | 사람 검수된 절대 화자 구간; 동시에 말한 화자는 별도 행 |
| 입력 형식 | multi-label RTTM + UEM |
| 평가 단위 | session |
| UEM | 기술 QC를 통과한 원본 전체 유효 음성 구간 |
| collar | `0.0초` |
| main overlap | `skip_overlap=false`; 겹침 포함 |
| mapping | 세션별 Hungarian 최적 일대일 매핑 |
| 주 집계 | reference speaker-time 기준 micro |
| 보조 집계 | 세션 macro 평균, 조건별 slice |
| 배타적 출력 | 화면·전사 대표 화자용 파생물; main 평가 입력으로 금지 |
| undefined | 값 `null` + 분모 + 사유; 0으로 대체 금지 |
| 권장 라이브러리 | `pyannote.metrics 4.1.x` 계열과 실제 버전·checksum 기록 |

`skip_overlap=true` 결과는 `overlap_excluded_control`이라는 보조 실행으로 남긴다. 이는 본 점수를 대신하지 않고, “겹침 때문에 생긴 오류”와 “겹침이 아닌 구간의 오류”를 나누는 데만 쓴다.

## 지표 정의

### 주지표

| id | 정의 | 역할 |
|---|---|---|
| `der` | `(false_alarm + miss + confusion) / reference_speaker_time` | 전체 주지표; 낮을수록 좋음 |
| `jer` | 최적 매핑 뒤 정답 화자별 Jaccard error의 macro 평균 | 화자별 불균형·재등장·fragmentation 보완; 낮을수록 좋음 |

DER의 구성요소는 반드시 함께 저장한다. 전체 DER만 저장하면 같은 점수라도 “말을 놓친 것인지”, “없는 말을 화자로 만든 것인지”, “A를 B로 바꾼 것인지”를 구분할 수 없다.

### 필수 진단 지표

| id | 정의 | 실패 원인 |
|---|---|---|
| `overlap_activity_f1` | 정답·예측에서 활성 화자가 2명 이상인 시간 영역의 duration-based F1 | 겹침 감지 자체 실패 |
| `overlap_speaker_time_recall` | 정답 겹침의 화자 시간 중 최적 매핑 후 올바르게 귀속된 시간 비율 | 겹침을 찾았지만 한 화자를 버림 |
| `purity` | 한 예측 cluster가 한 정답 화자에 얼마나 집중되는지 | 여러 화자 merge |
| `coverage` | 한 정답 화자가 예측 cluster 하나에 얼마나 유지되는지 | 같은 화자 fragmentation |
| `purity_coverage_f1` | purity와 coverage의 조화평균 | merge·fragmentation 균형 |
| `same_speaker_reappearance_recall` | `speakerRelations`의 SAME 쌍 중 같은 예측 cluster로 유지된 비율 | 긴 공백 후 새 화자로 분리 |
| `short_turn_recall` | 검수된 짧은 발화 화자 시간 중 올바르게 귀속된 비율 | 짧은 질문·맞장구 누락 |
| `late_entrant_recall` | 늦게 들어온 화자 시간 중 올바르게 귀속된 비율 | 새 화자 초기 구간 누락·오병합 |
| `single_speaker_extra_attributed_time_rate` | 1인 기준에서 dominant mapped speaker 밖으로 귀속된 예측 화자 시간 / 정답 발화 시간 | 허위 화자·과분리 |

`speaker_count_error`와 `boundary_f1`은 함께 표시할 수 있지만 설명용이다. 예를 들어 화자 수가 8명으로 맞아도 두 사람을 합치고 다른 곳에서 허위 화자를 만들 수 있으며, 경계 F1이 높아도 같은 시간에 말한 두 번째 화자를 보존하지 못할 수 있다.

### 조건별 slice

라벨의 확정 태그를 이용해 다음 UEM을 만든다. 후보 태그는 gold로 승격하지 않고, 사람이 실제로 확인한 태그만 slice에 포함한다.

| slice | 필수 결과 |
|---|---|
| `actual_overlap_speech` | slice DER/JER, overlap activity F1, overlap speaker-time recall |
| `stationary_background_noise` | slice DER/JER, DER components |
| `far_mic_or_reverb` | slice DER/JER, DER components |
| `similar_timbre` | slice DER/JER, DER confusion |
| `short_new_speaker` | slice DER/JER, short-turn recall, late-entrant recall |
| `long_gap_reappearance` | slice DER/JER, same-speaker reappearance recall |
| `single_speaker_control` | slice DER/JER, extra-attributed time rate |

각 slice는 `referenceSpeakerTimeSec`, `observedWindowSec`, 모수 개수와 함께 기록한다. 분모가 없거나 사람이 조건을 확인하지 못한 slice는 `NOT_OBSERVED`로 남기며, 전체 점수에 0점으로 합산하지 않는다.

## 결과 장부 계약

`baseline-evaluation-ledger.v1.json`에는 `metricContractVersion`과 `metricContract`를 넣는다. 실제 기준모델 결과가 추가될 때 각 결과는 최소한 다음을 포함해야 한다.

```json
{
  "sessionId": "SESSION_PILOT_001",
  "goldLabelVersion": "diarization-labels.v1@<hash>",
  "uem": {"path": "uem/SESSION_PILOT_001.uem", "sha256": "..."},
  "main": {
    "der": null,
    "jer": null,
    "false_alarm": null,
    "miss": null,
    "confusion": null,
    "reference_speaker_time": null
  },
  "overlapExcludedControl": {},
  "conditionSlices": {},
  "denominators": {},
  "undefinedReasons": {}
}
```

위 예시는 아직 결과가 없다는 뜻이 아니라 장부 구조를 보여 주는 형식이다. 실행 전에는 `null` 결과를 PASS로 해석하지 않는다. 게이트는 human gold와 실제 기준모델 실행 결과가 있고, 주지표·구성요소·조건별 분모가 채워졌을 때만 통과를 검토한다.

## 임계값 정책

첫 골드 파일럿 전에는 절대 임계값을 만들지 않는다. 현재 자료는 후보 원본과 legacy fixture 중심이고, 실제 겹침·재등장·짧은 발화의 확정 gold 시간이 0시간이므로 숫자를 먼저 정하면 데이터에 맞춰 기준을 조작하게 된다.

첫 기준모델 실행 뒤 다음 순서로 임계값을 선언한다.

1. 같은 gold 버전, UEM, collar, overlap 정책, mapping으로 기준모델을 한 번 고정한다.
2. 전체 DER/JER와 각 hard-condition slice의 분포·분모·검수 불확실성을 확인한다.
3. 튜닝 후보가 전체 주지표에서 회귀하지 않고, 사전에 선택한 hard-condition 오차 예산을 넘지 않는지 비교한다.
4. 1인 기준의 extra-attributed time rate가 악화되거나 겹침·재등장 지표가 비어 있으면 성능 향상으로 선언하지 않는다.

따라서 현재 계약의 게이트 상태는 `CALIBRATION_REQUIRED`다. 이것은 평가를 미룬다는 뜻이 아니라, 먼저 올바른 gold와 재현 가능한 산출 형식을 확보한 뒤 숫자를 고정한다는 뜻이다.

## 기존 결과의 이관 규칙

- KTV와 brief의 `boundaryF1`, `boundaryRecall`, `oneToOneAccuracy`, `clusterPurity`는 `legacy_diagnostic_only`로 표시한다.
- 기존 결과에 절대 화자 시작·끝과 다중 라벨 겹침이 없으면 새 `DER/JER` gold 결과로 변환하지 않는다.
- 배타적 제품 utterance 출력은 overlap-inclusive reference와 비교할 수 없으므로 새 주평가 결과에 넣지 않는다.
- 새 파일럿 결과는 반드시 사람 라벨 버전, 원본·가설 manifest, UEM, 프로토콜 버전, 라이브러리 버전을 함께 저장한다.

이 계약을 반영한 현재 장부·게이트는 새 파일럿 결과가 없으므로 여전히 `NOT_READY`이며, 사람 라벨 작업을 시작하기 전에는 평가 지표 설계만 완료된 상태다.
