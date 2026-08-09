#!/usr/bin/env python3
"""Render a short audio/video clip and contact sheet for one review card."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, Optional


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CARDS = REPO_ROOT / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/preannotations/review-cards.v1.json"
DEFAULT_OUTPUT = REPO_ROOT / "Faith-office/08_검증_정답셋/Faith_STT_화자분리_파일럿_2026-08-08/04_qa/preannotations/review-media"


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def find_card(cards: Dict[str, Any], card_id: str) -> Dict[str, Any]:
    for card in cards.get("cards") or []:
        if isinstance(card, dict) and card.get("cardId") == card_id:
            return card
    raise ValueError(f"unknown cardId: {card_id}")


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def render_clip(source: Path, start: float, duration: float, target: Path) -> None:
    run(
        [
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-ss", f"{start:.3f}", "-i", str(source), "-t", f"{duration:.3f}",
            "-vf", "scale='min(960,iw)':-2", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "24", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
            str(target),
        ]
    )


def probe_duration(path: Path) -> float:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        check=True,
        text=True,
        capture_output=True,
    )
    return float(completed.stdout.strip())


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cards", type=Path, default=DEFAULT_CARDS)
    parser.add_argument("--card-id", required=True)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args(list(sys.argv[1:] if argv is None else argv))
    cards_path = args.cards if args.cards.is_absolute() else REPO_ROOT / args.cards
    output_dir = args.output if args.output.is_absolute() else REPO_ROOT / args.output
    try:
        card = find_card(load_json(cards_path), args.card_id)
        source = Path(str(card["sourcePath"]))
        source = source if source.is_absolute() else REPO_ROOT / source
        if not source.is_file():
            raise ValueError(f"source is missing: {source}")
        window = card["reviewWindow"]
        start = float(window["startSec"])
        duration = max(0.5, float(window["endSec"]) - start)
        target_dir = output_dir / args.card_id
        target_dir.mkdir(parents=True, exist_ok=True)
        clip = target_dir / "review.mp4"
        sheet = target_dir / "contact-sheet.jpg"
        metadata = target_dir / "card.json"
        comparisons = (card.get("detail") or {}).get("comparisonWindows") or []
        if len(comparisons) == 2:
            parts = []
            for index, comparison in enumerate(comparisons, start=1):
                part_start = max(0.0, float(comparison["startSec"]) - 2.0)
                part_end = min(
                    float(card.get("sourceDurationSec") or float("inf")),
                    float(comparison["endSec"]) + 2.0,
                )
                part = target_dir / f"review-part-{index}.mp4"
                render_clip(source, part_start, max(0.5, part_end - part_start), part)
                parts.append(part)
            with tempfile.NamedTemporaryFile("w", suffix=".txt", encoding="utf-8") as manifest:
                for part in parts:
                    escaped = str(part).replace("'", "'\\''")
                    manifest.write(f"file '{escaped}'\n")
                manifest.flush()
                run(
                    [
                        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                        "-f", "concat", "-safe", "0", "-i", manifest.name,
                        "-c", "copy", "-movflags", "+faststart", str(clip),
                    ]
                )
            duration = probe_duration(clip)
        else:
            render_clip(source, start, duration, clip)
        tile_step = max(0.5, duration / 6.0)
        run(
            [
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(clip), "-t", f"{duration:.3f}",
                "-vf", f"fps=1/{tile_step:.3f},scale=480:-2,tile=3x2", "-frames:v", "1", str(sheet),
            ]
        )
        with metadata.open("w", encoding="utf-8") as handle:
            json.dump(card, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError, json.JSONDecodeError) as exc:
        print(f"review card rendering failed: {exc}", file=sys.stderr)
        return 1
    print(json.dumps({"cardId": args.card_id, "clip": str(clip), "contactSheet": str(sheet)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
