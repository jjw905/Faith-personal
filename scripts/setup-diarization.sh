#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV="$ROOT/.venv-diarization"
MODELS="$ROOT/.data/models/diarization"
SEGMENTATION="$MODELS/sherpa-onnx-pyannote-segmentation-3-0/model.onnx"
EMBEDDING="$MODELS/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx"

python3 -m venv "$VENV"
"$VENV/bin/python3" -m pip install --upgrade pip
"$VENV/bin/python3" -m pip install -r "$ROOT/ml/diarization/requirements.txt"

mkdir -p "$MODELS"
if [[ ! -f "$SEGMENTATION" ]]; then
  ARCHIVE="$MODELS/segmentation.tar.bz2"
  curl -fL \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2" \
    -o "$ARCHIVE"
  tar -xjf "$ARCHIVE" -C "$MODELS"
  rm "$ARCHIVE"
fi

if [[ ! -f "$EMBEDDING" ]]; then
  curl -fL \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx" \
    -o "$EMBEDDING"
fi

echo "Diarization ready"
