#!/usr/bin/env python3
"""PII NER 추론 HTTP 서버 (기본 CPU, 포트 8765)."""

from __future__ import annotations

import os
from pathlib import Path

import torch
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from labels import ID2LABEL
from pydantic import BaseModel, Field
from transformers import AutoModelForTokenClassification, AutoTokenizer

ROOT = Path(__file__).resolve().parent
MODEL_DIR = Path(os.environ.get("FAITH_NER_MODEL", ROOT / "artifacts" / "model"))
DEVICE_NAME = os.environ.get("FAITH_NER_DEVICE", "cpu")

app = FastAPI(title="Faith PII NER", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_tokenizer = None
_model = None
_device = None


def get_runtime():
    global _tokenizer, _model, _device
    if _model is None:
        _device = torch.device(DEVICE_NAME)
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
        _model = AutoModelForTokenClassification.from_pretrained(MODEL_DIR)
        _model.to(_device)
        _model.eval()
    return _tokenizer, _model, _device


class DetectRequest(BaseModel):
    text: str = Field(..., min_length=0, max_length=8000)


class Span(BaseModel):
    label: str
    start: int
    end: int
    text: str
    score: float | None = None


class DetectResponse(BaseModel):
    text: str
    spans: list[Span]
    device: str
    model: str


def predict_spans(text: str) -> list[Span]:
    tokenizer, model, device = get_runtime()
    if not text.strip():
        return []

    enc = tokenizer(
        text,
        return_tensors="pt",
        return_offsets_mapping=True,
        truncation=True,
        max_length=160,
    )
    offsets = enc.pop("offset_mapping")[0].tolist()
    enc = {k: v.to(device) for k, v in enc.items()}
    with torch.no_grad():
        logits = model(**enc).logits[0]
        probs = torch.softmax(logits, dim=-1)
    ids = logits.argmax(-1).tolist()

    spans: list[Span] = []
    cur: dict | None = None
    for i, (label_id, (start, end)) in enumerate(zip(ids, offsets)):
        if start == end:
            continue
        label = ID2LABEL.get(label_id, "O")
        conf = float(probs[i, label_id].item())
        if label == "O":
            if cur:
                spans.append(Span(**cur))
                cur = None
            continue
        kind = label[2:] if label.startswith(("B-", "I-")) else label
        is_b = label.startswith("B-")
        if cur and not is_b and cur["label"] == kind:
            cur["end"] = end
            cur["text"] = text[cur["start"] : end]
            cur["score"] = min(cur["score"], conf)
        else:
            if cur:
                spans.append(Span(**cur))
            cur = {
                "label": kind,
                "start": start,
                "end": end,
                "text": text[start:end],
                "score": conf,
            }
    if cur:
        spans.append(Span(**cur))
    return spans


@app.get("/health")
def health():
    ready = MODEL_DIR.exists() and (MODEL_DIR / "config.json").exists()
    return {
        "ok": ready,
        "model": str(MODEL_DIR),
        "device": DEVICE_NAME,
    }


@app.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest):
    spans = predict_spans(req.text)
    return DetectResponse(
        text=req.text,
        spans=spans,
        device=DEVICE_NAME,
        model=str(MODEL_DIR),
    )


def main():
    import uvicorn

    host = os.environ.get("FAITH_NER_HOST", "127.0.0.1")
    port = int(os.environ.get("FAITH_NER_PORT", "8765"))
    # preload
    get_runtime()
    print(f"NER ready on http://{host}:{port} device={DEVICE_NAME}")
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
