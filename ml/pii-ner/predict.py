#!/usr/bin/env python3
"""학습된 PII NER로 span 추론."""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from labels import ID2LABEL
from transformers import AutoModelForTokenClassification, AutoTokenizer

ROOT = Path(__file__).resolve().parent


def pick_device() -> torch.device:
    # MPS는 연속 추론 시 간헐적으로 hang — 안정용 기본 CPU, FAITH_NER_DEVICE로 오버라이드
    import os

    forced = os.environ.get("FAITH_NER_DEVICE", "").strip().lower()
    if forced in {"cpu", "mps", "cuda"}:
        return torch.device(forced)
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def predict_spans(text: str, model, tokenizer, device) -> list[dict]:
    enc = tokenizer(
        text,
        return_tensors="pt",
        return_offsets_mapping=True,
        truncation=True,
        max_length=128,
    )
    offsets = enc.pop("offset_mapping")[0].tolist()
    enc = {k: v.to(device) for k, v in enc.items()}
    model.eval()
    with torch.no_grad():
        logits = model(**enc).logits[0]
    ids = logits.argmax(-1).tolist()

    spans: list[dict] = []
    cur = None
    for label_id, (start, end) in zip(ids, offsets):
        if start == end:
            continue
        label = ID2LABEL.get(label_id, "O")
        if label == "O":
            if cur:
                spans.append(cur)
                cur = None
            continue
        kind = label[2:] if label.startswith(("B-", "I-")) else label
        is_b = label.startswith("B-")
        if cur and not is_b and cur["label"] == kind:
            cur["end"] = end
            cur["text"] = text[cur["start"] : end]
        else:
            if cur:
                spans.append(cur)
            cur = {
                "label": kind,
                "start": start,
                "end": end,
                "text": text[start:end],
            }
    if cur:
        spans.append(cur)
    return spans


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        type=Path,
        default=ROOT / "artifacts" / "model",
    )
    parser.add_argument(
        "--text",
        default="계좌는 110112134938 이고 신한 입니다. 연락처 010-2394-2493",
    )
    args = parser.parse_args()

    device = pick_device()
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForTokenClassification.from_pretrained(args.model).to(device)

    spans = predict_spans(args.text, model, tokenizer, device)
    print("text:", args.text)
    print("spans:")
    for s in spans:
        print(f"  [{s['label']}] {s['text']!r} ({s['start']}:{s['end']})")


if __name__ == "__main__":
    main()
