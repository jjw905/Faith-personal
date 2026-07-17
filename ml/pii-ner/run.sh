#!/usr/bin/env bash
# Mac(M1/M2/M3) PII NER: 데이터 생성 → 학습 → 추론
set -euo pipefail
cd "$(dirname "$0")"

PYTHON="${PYTHON:-}"
if [[ -z "$PYTHON" ]]; then
  if command -v python3.11 >/dev/null; then PYTHON=python3.11
  elif command -v python3.12 >/dev/null; then PYTHON=python3.12
  else PYTHON=python3
  fi
fi
VENV="${VENV:-.venv}"
MODE="${1:-smoke}"

if [[ ! -d "$VENV" ]]; then
  echo "[1/4] create venv ($VENV)"
  "$PYTHON" -m venv "$VENV"
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
  pip install -U pip
  pip install -r requirements.txt
else
  # shellcheck disable=SC1091
  source "$VENV/bin/activate"
fi

echo "[2/4] generate data ($MODE)"
if [[ "$MODE" == "smoke" ]]; then
  python generate_data.py --train 600 --valid 80
  echo "[3/4] smoke train (max_steps=40)"
  python train.py --epochs 1 --batch 4 --max-steps 40
else
  python generate_data.py --train 3000 --valid 400
  echo "[3/4] full train"
  python train.py --epochs 3 --batch 8
fi

echo "[4/4] predict samples"
python predict.py --text "계좌는 110112134938 이고 신한 입니다. 김민수 님 연락처 010-2394-2493"
python predict.py --text "사업자번호 123-45-67890, 여권 M12345678, 차량 12가3456"
python predict.py --text "운전면허 11-21-123456-01, 외국인등록 900101-5123456"

echo "done. model → artifacts/model"
