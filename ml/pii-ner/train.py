#!/usr/bin/env python3
"""Mac(Apple Silicon MPS)용 소형 PII NER 파인튜닝."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from datasets import Dataset
from labels import ID2LABEL, LABEL2ID, LABELS
from transformers import (
    AutoModelForTokenClassification,
    AutoTokenizer,
    DataCollatorForTokenClassification,
    Trainer,
    TrainingArguments,
)

ROOT = Path(__file__).resolve().parent


def pick_device() -> str:
    if torch.backends.mps.is_available():
        return "mps"
    if torch.cuda.is_available():
        return "cuda"
    return "cpu"


def load_jsonl(path: Path) -> list[dict]:
    rows = []
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def char_labels(text: str, entities: list[dict]) -> list[str]:
    tags = ["O"] * len(text)
    for ent in sorted(entities, key=lambda e: e["start"]):
        lab = ent["label"]
        s, e = ent["start"], ent["end"]
        if s >= len(text) or e > len(text) or s >= e:
            continue
        tags[s] = f"B-{lab}"
        for i in range(s + 1, e):
            tags[i] = f"I-{lab}"
    return tags


def tokenize_and_align(examples, tokenizer, max_length: int = 160):
    texts = examples["text"]
    ent_lists = examples["entities"]
    tokenized = tokenizer(
        texts,
        truncation=True,
        max_length=max_length,
        return_offsets_mapping=True,
        is_split_into_words=False,
    )
    all_labels = []
    for i, offsets in enumerate(tokenized["offset_mapping"]):
        c_tags = char_labels(texts[i], ent_lists[i])
        labels = []
        for start, end in offsets:
            if start == end:
                labels.append(-100)
                continue
            tag = c_tags[start] if start < len(c_tags) else "O"
            labels.append(LABEL2ID.get(tag, 0))
        all_labels.append(labels)
    tokenized["labels"] = all_labels
    tokenized.pop("offset_mapping")
    return tokenized


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        default="klue/bert-base",
        help="작은 한국어 BERT (맥북 권장)",
    )
    parser.add_argument("--data", type=Path, default=ROOT / "data")
    parser.add_argument("--out", type=Path, default=ROOT / "artifacts" / "model")
    parser.add_argument("--epochs", type=float, default=3.0)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--lr", type=float, default=3e-5)
    parser.add_argument("--max-steps", type=int, default=-1, help="스모크용 제한")
    parser.add_argument("--max-length", type=int, default=160)
    args = parser.parse_args()

    device = pick_device()
    print(f"device={device} model={args.model}")

    train_rows = load_jsonl(args.data / "train.jsonl")
    valid_rows = load_jsonl(args.data / "valid.jsonl")
    if not train_rows:
        raise SystemExit("no train data — run generate_data.py first")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForTokenClassification.from_pretrained(
        args.model,
        num_labels=len(LABELS),
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )

    train_ds = Dataset.from_list(train_rows).map(
        lambda x: tokenize_and_align(x, tokenizer, args.max_length),
        batched=True,
        remove_columns=["text", "entities"],
    )
    valid_ds = Dataset.from_list(valid_rows).map(
        lambda x: tokenize_and_align(x, tokenizer, args.max_length),
        batched=True,
        remove_columns=["text", "entities"],
    )

    collator = DataCollatorForTokenClassification(tokenizer)
    args.out.mkdir(parents=True, exist_ok=True)

    # MPS는 fp16 미지원인 경우가 많아 bf16/fp16 끔
    use_fp16 = device == "cuda"
    targs = TrainingArguments(
        output_dir=str(args.out / "runs"),
        learning_rate=args.lr,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        num_train_epochs=args.epochs,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_steps=20,
        report_to=[],
        fp16=use_fp16,
        dataloader_pin_memory=False,
        max_steps=args.max_steps,
        load_best_model_at_end=True if args.max_steps < 0 else False,
        metric_for_best_model="eval_loss",
    )

    trainer = Trainer(
        model=model,
        args=targs,
        train_dataset=train_ds,
        eval_dataset=valid_ds,
        processing_class=tokenizer,
        data_collator=collator,
    )
    trainer.train()
    trainer.save_model(str(args.out))
    tokenizer.save_pretrained(str(args.out))
    print(f"saved → {args.out}")


if __name__ == "__main__":
    main()
