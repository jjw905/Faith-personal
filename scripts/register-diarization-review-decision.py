#!/usr/bin/env python3
"""Register one human review-card decision without inventing gold boundaries."""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_QA = REPO_ROOT / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa"
DEFAULT_CARDS = DEFAULT_QA / "preannotations/review-cards.v1.json"
DEFAULT_LABELS = DEFAULT_QA / "labels"


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"{path} must contain an object")
    return value


def atomic_write(path: Path, value: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except OSError:
            pass
        raise


def find_card(cards: Dict[str, Any], card_id: str) -> Dict[str, Any]:
    for card in cards.get("cards") or []:
        if isinstance(card, dict) and card.get("cardId") == card_id:
            return card
    raise ValueError(f"unknown cardId: {card_id}")


def register_label_event(
    labels_dir: Path,
    card: Dict[str, Any],
    decision: Dict[str, Any],
) -> Path:
    label_path = labels_dir / f"{card['sessionId']}.labels.v1.json"
    labels = load_json(label_path)
    events = labels.setdefault("events", [])
    if not isinstance(events, list):
        raise ValueError(f"{label_path}: events must be a list")
    source_event_id = (card.get("detail") or {}).get("eventId")
    target = None
    for event in events:
        if not isinstance(event, dict):
            continue
        if source_event_id and event.get("eventId") == source_event_id:
            target = event
            break
        if event.get("reviewCardId") == card.get("cardId"):
            target = event
            break
    if target is None:
        target = {
            "eventId": f"REVIEW_{card['cardId']}",
            "type": card.get("kind"),
        }
        events.append(target)
    elif target.get("humanDecision") is not None:
        raise ValueError(
            f"label event already has a human decision: {target.get('eventId')}"
        )
    target.update(
        {
            "reviewCardId": card.get("cardId"),
            "machineBoundarySuggestion": card.get("machineBoundary"),
            "machineSpeakers": card.get("machineSpeakers") or [],
            "humanDecision": decision,
            "status": "HUMAN_DECISION_RECORDED_MACHINE_BOUNDARY_NOT_YET_GOLD",
            "evidenceSource": "human_listening_with_machine_review_card",
        }
    )
    provenance = labels.setdefault("provenance", {})
    if not isinstance(provenance, dict):
        raise ValueError(f"{label_path}: provenance must be an object")
    provenance["reviewCardContract"] = "diarization-review-cards.v1"
    provenance["machineBoundaryIsGold"] = False
    atomic_write(label_path, labels)
    return label_path


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cards", type=Path, default=DEFAULT_CARDS)
    parser.add_argument("--labels-dir", type=Path, default=DEFAULT_LABELS)
    parser.add_argument("--card-id", required=True)
    parser.add_argument("--decision", required=True)
    parser.add_argument("--reviewer-id", default="user")
    parser.add_argument("--notes", default="")
    args = parser.parse_args(list(sys.argv[1:] if argv is None else argv))
    cards_path = args.cards if args.cards.is_absolute() else REPO_ROOT / args.cards
    labels_dir = args.labels_dir if args.labels_dir.is_absolute() else REPO_ROOT / args.labels_dir
    try:
        cards = load_json(cards_path)
        card = find_card(cards, args.card_id)
        options = card.get("answerOptions") or []
        if args.decision not in options:
            raise ValueError(f"decision must be one of {options}")
        if card.get("humanDecision") is not None:
            raise ValueError(f"card already has a human decision: {args.card_id}")
        decision = {
            "answer": args.decision,
            "reviewerId": args.reviewer_id,
            "reviewedAt": datetime.now(timezone.utc).isoformat(),
            "notes": args.notes or None,
            "enteredTimestampsByHuman": False,
            "machineBoundaryAcceptedAsGold": False,
        }
        card["humanDecision"] = decision
        card["status"] = "HUMAN_DECISION_RECORDED"
        label_path = register_label_event(labels_dir, card, decision)
        cards["decidedCardCount"] = sum(
            1 for item in cards.get("cards") or [] if isinstance(item, dict) and item.get("humanDecision") is not None
        )
        cards["status"] = (
            "HUMAN_DECISIONS_PARTIAL"
            if cards["decidedCardCount"] < int(cards.get("cardCount") or 0)
            else "HUMAN_DECISIONS_COMPLETE_PENDING_LABEL_PROMOTION"
        )
        atomic_write(cards_path, cards)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f"review decision registration failed: {exc}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "cardId": args.card_id,
                "decision": args.decision,
                "cards": str(cards_path),
                "label": str(label_path),
                "goldPromoted": False,
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
