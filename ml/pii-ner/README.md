# PII NER (Mac)

Apple Silicon에서 작은 한국어 BERT로 PII span을 파인튜닝하는 MVP입니다.

## 최종 학습
```bash
cd ml/pii-ner
./run.sh full
```
- 데이터: train 3000 / valid 400 (채팅형 합성)
- 모델: `klue/bert-base` → `artifacts/model`
- M2 기준 약 10분, eval_loss ≈ 0.0002

## 검사
```bash
source .venv/bin/activate
FAITH_NER_DEVICE=cpu python predict.py --text "채팅 문장 입력"
```

유형 목록: `PII_COVERAGE.md`

## 다음
검사 피드백을 주시면 데이터/라벨을 보완한 뒤 재학습합니다.
