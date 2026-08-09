#!/usr/bin/env python3
"""Create an approximately 100-hour CC BY + manual-Korean-subtitle manifest.

The output is a *collection manifest*, not a claim that every item has passed
speaker or quality QC.  It records title-level screening and keeps content
with obvious third-party-material signals out of the automated model-tuning
pool pending a human review.
"""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_유튜브_CC_BY_2026-08-05"
)
DEFAULT_INPUT = DEFAULT_ROOT / "00_intake" / "manual-ko-subtitle-catalog.jsonl"
DEFAULT_OUTPUT = DEFAULT_ROOT / "00_intake" / "candidates.jsonl"
DEFAULT_REPORT = DEFAULT_ROOT / "00_intake" / "curation-report.json"
CURATION_VERSION = "youtube-cc-by-manual-ko-curation-v0.1"

# These do not prove a rights problem.  They are conservative stop signs for
# unattended selection because the surrounding work may have an additional
# author, performer, broadcaster, or publisher.
THIRD_PARTY_RISK_TERMS = (
    "어린 왕자",
    "audiobook",
    "낭독",
    "k-pop",
    "kpop",
    "bts",
    "netflix",
    "드라마",
    "ost",
    "노래",
    "music",
    "뉴스",
    "news",
    "책으로",
    "book",
)
FOCUSED_TERMS = (
    "walk",
    "산책",
    "여행",
    "vlog",
    "인터뷰",
    "interview",
    "q&a",
    "qna",
    "guest",
    "게스트",
    "세계일주",
    "현장",
)
CLEAN_TERMS = (
    "문법",
    "grammar",
    "1-hour",
    "1hour",
    "goodnight",
    "morning",
    "듣기",
    "listening",
)
NATURAL_TERMS = (
    "conversation",
    "대화",
    "팟캐스트",
    "podcast",
    "요모조모",
    "talk",
    "토크",
)
BUCKET_ORDER = ("natural_complex", "focused_diagnostic", "clean_baseline")
DEFAULT_BUCKET_TARGETS = {
    "natural_complex": 65.0,
    "focused_diagnostic": 25.0,
    "clean_baseline": 10.0,
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        try:
            record = json.loads(raw)
        except json.JSONDecodeError as error:
            raise SystemExit(f"{path}:{line_number}: invalid JSON: {error}") from error
        if not record.get("alias") or not record.get("videoId") or not record.get("catalogDurationSec"):
            raise SystemExit(f"{path}:{line_number}: incomplete discovery record")
        records.append(record)
    if not records:
        raise SystemExit(f"{path}: no candidates")
    return records


def contains(title: str, terms: tuple[str, ...]) -> list[str]:
    folded = title.casefold()
    return [term for term in terms if term.casefold() in folded]


def classify(record: dict[str, Any]) -> tuple[str, list[str], str | None]:
    title = str(record.get("catalogTitle") or "")
    third_party = contains(title, THIRD_PARTY_RISK_TERMS)
    if third_party:
        return "excluded", [], "title_has_possible_third_party_material:" + ",".join(third_party)
    focused = contains(title, FOCUSED_TERMS)
    clean = contains(title, CLEAN_TERMS)
    natural = contains(title, NATURAL_TERMS)
    if focused:
        return "focused_diagnostic", focused, None
    if clean:
        return "clean_baseline", clean, None
    if natural:
        return "natural_complex", natural, None
    return "natural_complex", ["default_creator_spoken_content"], None


def duration_hours(record: dict[str, Any]) -> float:
    return float(record["catalogDurationSec"]) / 3600


def add_bucket_fields(
    record: dict[str, Any], bucket: str, signals: list[str], content_ownership_screening: str = "title_heuristic_pass_pending_human_review"
) -> dict[str, Any]:
    result = dict(record)
    result["primaryBucket"] = bucket
    result["primaryDomain"] = {
        "natural_complex": "natural_creator_podcast_or_conversation",
        "focused_diagnostic": "field_or_interview_or_variable_recording",
        "clean_baseline": "controlled_creator_recording",
    }[bucket]
    result["secondaryTags"] = list(result.get("secondaryTags") or []) + [
        f"curated_{bucket}",
        *[f"title_signal:{signal}" for signal in signals],
    ]
    result["contentOwnershipScreening"] = content_ownership_screening
    result["curationVersion"] = CURATION_VERSION
    result["curatedAt"] = now()
    return result


def write_jsonl(path: Path, records: list[dict[str, Any]], overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise SystemExit(f"refusing to replace existing manifest: {path} (pass --overwrite after review)")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records),
        encoding="utf-8",
    )


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--target-hours", type=float, default=100.0)
    parser.add_argument(
        "--include-title-risk",
        action="store_true",
        help="only when needed, add CC BY + manual-subtitle items whose titles need a human third-party-content review",
    )
    parser.add_argument("--overwrite", action="store_true", help="replace an existing generated manifest")
    args = parser.parse_args()
    if args.target_hours <= 0:
        raise SystemExit("--target-hours must be positive")

    records = read_jsonl(args.input)
    classified: dict[str, list[tuple[dict[str, Any], list[str]]]] = {bucket: [] for bucket in BUCKET_ORDER}
    excluded: list[dict[str, Any]] = []
    title_risk: list[tuple[dict[str, Any], str]] = []
    for record in records:
        bucket, signals, exclusion_reason = classify(record)
        if exclusion_reason:
            excluded.append({"alias": record["alias"], "title": record.get("catalogTitle"), "reason": exclusion_reason})
            title_risk.append((record, exclusion_reason))
            continue
        classified[bucket].append((record, signals))

    scale = args.target_hours / sum(DEFAULT_BUCKET_TARGETS.values())
    targets = {bucket: DEFAULT_BUCKET_TARGETS[bucket] * scale for bucket in BUCKET_ORDER}
    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    bucket_hours: dict[str, float] = {bucket: 0.0 for bucket in BUCKET_ORDER}

    # Longest-first makes the remote collection more resilient to a small
    # number of unavailable VODs while retaining the planned bucket ratio.
    for bucket in BUCKET_ORDER:
        for record, signals in sorted(classified[bucket], key=lambda item: duration_hours(item[0]), reverse=True):
            if bucket_hours[bucket] >= targets[bucket]:
                break
            if record["videoId"] in selected_ids:
                continue
            selected.append(add_bucket_fields(record, bucket, signals))
            selected_ids.add(record["videoId"])
            bucket_hours[bucket] += duration_hours(record)

    # A sparse title category must not prevent collection.  Fill from all
    # screened candidates in stable duration order and mark the original
    # classifier bucket; the report exposes any shortfall transparently.
    all_remaining: list[tuple[dict[str, Any], str, list[str]]] = []
    for bucket in BUCKET_ORDER:
        all_remaining.extend((record, bucket, signals) for record, signals in classified[bucket])
    for record, bucket, signals in sorted(all_remaining, key=lambda item: duration_hours(item[0]), reverse=True):
        if sum(bucket_hours.values()) >= args.target_hours:
            break
        if record["videoId"] in selected_ids:
            continue
        selected.append(add_bucket_fields(record, bucket, signals))
        selected_ids.add(record["videoId"])
        bucket_hours[bucket] += duration_hours(record)

    if args.include_title_risk:
        for record, reason in sorted(title_risk, key=lambda item: duration_hours(item[0]), reverse=True):
            if sum(bucket_hours.values()) >= args.target_hours:
                break
            if record["videoId"] in selected_ids:
                continue
            title = str(record.get("catalogTitle") or "")
            bucket = "focused_diagnostic" if "news" in title.casefold() or "뉴스" in title else "clean_baseline"
            selected.append(
                add_bucket_fields(
                    record,
                    bucket,
                    ["title_risk_backfill"],
                    "title_risk_requires_human_third_party_content_review",
                )
            )
            selected_ids.add(record["videoId"])
            bucket_hours[bucket] += duration_hours(record)

    report = {
        "curationVersion": CURATION_VERSION,
        "curatedAt": now(),
        "input": str(args.input),
        "output": str(args.output),
        "requestedTargetHours": args.target_hours,
        "bucketTargetsHours": targets,
        "bucketSelectedHours": bucket_hours,
        "selectedCount": len(selected),
        "selectedHours": sum(bucket_hours.values()),
        "screenedCandidateCount": len(records),
        "screenedCandidateHours": sum(duration_hours(record) for record in records),
        "titleHeuristicExcluded": excluded,
        "includedTitleRiskBackfill": args.include_title_risk,
        "unmetBucketTargets": {
            bucket: max(0.0, targets[bucket] - bucket_hours[bucket]) for bucket in BUCKET_ORDER
        },
    }
    write_jsonl(args.output, selected, args.overwrite)
    write_json(args.report, report)
    print(
        f"curated {len(selected)} videos, {report['selectedHours']:.2f}h; "
        + ", ".join(f"{bucket}={bucket_hours[bucket]:.2f}h" for bucket in BUCKET_ORDER)
    )


if __name__ == "__main__":
    main()
