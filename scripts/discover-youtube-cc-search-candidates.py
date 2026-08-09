#!/usr/bin/env python3
"""Discover diverse YouTube candidates without trusting search labels as rights proof.

The YouTube search filter is only a lead generator.  Every video is queried
again and is emitted as a collection candidate only when its individual
metadata reports exact CC BY reuse language plus publisher-provided Korean
subtitles.  Search results are capped and all rejected observations are kept
in a separate audit ledger.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus


EXPECTED_LICENSE = "Creative Commons Attribution license (reuse allowed)"
DEFAULT_ROOT = Path("Faith-office/08_검증_정답셋/Faith_STT_수집_유튜브_CC_BY_2026-08-05")
DEFAULT_QUERIES = DEFAULT_ROOT / "00_intake" / "diverse-youtube-search-queries.jsonl"
DEFAULT_CANDIDATES = DEFAULT_ROOT / "00_intake" / "diverse-youtube-cc-manual-ko-candidates.jsonl"
DEFAULT_AUDIT = DEFAULT_ROOT / "00_intake" / "diverse-youtube-search-audit.jsonl"
DEFAULT_REPORT = DEFAULT_ROOT / "00_intake" / "diverse-youtube-search-report.json"
DEFAULT_EXCLUDED_CHANNELS = {"UCCaFYslhot_g4QxMjAcC0gg"}
DISCOVERY_VERSION = "youtube-diverse-cc-by-manual-ko-search-v0.1"

# This encoded UI filter is deliberately not treated as licence evidence.  Its
# only purpose is narrowing the lead set before individual metadata validation.
YOUTUBE_SEARCH_FILTER = "EgIQAQ%253D%253D"


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def read_jsonl(path: Path) -> list[dict[str, str]]:
    values: list[dict[str, str]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        value = json.loads(line)
        query = str(value.get("query") or "").strip()
        if not query:
            raise ValueError(f"{path}:{line_number}: query is required")
        values.append({"query": query, "intent": str(value.get("intent") or "unclassified")})
    if not values:
        raise ValueError(f"{path}: no search queries")
    return values


def write_jsonl(path: Path, records: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records), encoding="utf-8")


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def manual_korean_subtitle_languages(info: dict[str, Any]) -> list[str]:
    subtitles = info.get("subtitles") or {}
    return sorted(language for language in subtitles if language == "ko" or language.startswith("ko-"))


def automatic_korean_caption_languages(info: dict[str, Any]) -> list[str]:
    captions = info.get("automatic_captions") or {}
    return sorted(language for language in captions if language == "ko" or language.startswith("ko-"))


def search_entries(query: str) -> list[dict[str, Any]]:
    url = f"https://www.youtube.com/results?search_query={quote_plus(query)}&sp={YOUTUBE_SEARCH_FILTER}"
    result = run_json(["yt-dlp", "--flat-playlist", "--dump-single-json", "--no-warnings", "--", url])
    entries = result.get("entries") or []
    return [entry for entry in entries if isinstance(entry, dict) and entry.get("id")]


def video_info(video_id: str) -> dict[str, Any]:
    return run_json(["yt-dlp", "--no-download", "--dump-single-json", "--no-warnings", "--", f"https://www.youtube.com/watch?v={video_id}"])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--queries", type=Path, default=DEFAULT_QUERIES)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--audit", type=Path, default=DEFAULT_AUDIT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--max-results-per-query", type=int, default=10)
    parser.add_argument("--max-video-audits", type=int, default=120)
    parser.add_argument("--min-duration-sec", type=float, default=300.0)
    parser.add_argument("--exclude-channel-id", action="append", default=[])
    args = parser.parse_args()
    if args.max_results_per_query <= 0 or args.max_video_audits <= 0 or args.min_duration_sec <= 0:
        raise SystemExit("search caps and minimum duration must be positive")

    queries = read_jsonl(args.queries)
    excluded_channels = DEFAULT_EXCLUDED_CHANNELS | set(args.exclude_channel_id)
    leads: dict[str, dict[str, Any]] = {}
    search_errors: list[dict[str, str]] = []
    for search in queries:
        try:
            entries = search_entries(search["query"])
        except Exception as error:
            search_errors.append({"query": search["query"], "error": str(error)})
            continue
        for entry in entries[: args.max_results_per_query]:
            video_id = str(entry["id"])
            lead = leads.setdefault(video_id, {"videoId": video_id, "searchIntents": [], "searchQueries": []})
            lead["searchIntents"].append(search["intent"])
            lead["searchQueries"].append(search["query"])

    audits: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    metadata_errors: list[dict[str, str]] = []
    for index, lead in enumerate(leads.values()):
        if index >= args.max_video_audits:
            break
        video_id = str(lead["videoId"])
        try:
            info = video_info(video_id)
        except Exception as error:
            metadata_errors.append({"videoId": video_id, "error": str(error)})
            continue
        channel_id = str(info.get("channel_id") or "")
        duration_sec = float(info.get("duration") or 0)
        manual_ko = manual_korean_subtitle_languages(info)
        automatic_ko = automatic_korean_caption_languages(info)
        audit = {
            **lead,
            "auditedAt": utc_now(),
            "channelId": channel_id or None,
            "channel": info.get("channel"),
            "title": info.get("title"),
            "durationSec": duration_sec,
            "licenseObserved": info.get("license"),
            "manualKoreanSubtitleLanguages": manual_ko,
            "automaticKoreanCaptionLanguages": automatic_ko,
            "excludedKnownChannel": channel_id in excluded_channels,
            "meetsExactLicense": info.get("license") == EXPECTED_LICENSE,
            "meetsManualKoreanSubtitle": bool(manual_ko),
            "meetsDuration": duration_sec >= args.min_duration_sec,
        }
        audit["eligibleForCandidate"] = bool(
            audit["meetsExactLicense"]
            and audit["meetsManualKoreanSubtitle"]
            and audit["meetsDuration"]
            and not audit["excludedKnownChannel"]
        )
        audits.append(audit)
        if not audit["eligibleForCandidate"]:
            continue
        source_group = f"youtube-channel:{channel_id}"
        candidates.append(
            {
                "alias": f"youtube-diverse-{video_id}",
                "videoId": video_id,
                "sourcePageUrl": f"https://www.youtube.com/watch?v={video_id}",
                "sourceFamily": "youtube_cc_by_search_discovered",
                "catalogChannel": info.get("channel"),
                "catalogChannelId": channel_id,
                "catalogTitle": info.get("title"),
                "catalogDurationSec": duration_sec,
                "catalogLicense": info.get("license"),
                "manualKoreanSubtitleLanguages": manual_ko,
                "transcriptRequirement": "manual_youtube_ko_subtitles",
                "searchQueries": sorted(set(lead["searchQueries"])),
                "primaryDomain": "unreviewed_diverse_source",
                "primaryBucket": "unreviewed",
                "secondaryTags": ["youtube_cc_by", "manual_ko_subtitles", *sorted(set(lead["searchIntents"]))],
                "contentOwnershipScreening": "license_and_manual_transcript_verified_pending_human_review",
                "sourceGroup": source_group,
                "seriesGroup": source_group,
                "voiceClusterCandidate": source_group,
                "speakerDiversityEvidence": "unreviewed",
                "observedSpeakerCount": None,
                "hasVerifiedOverlap": False,
                "primarySpeakerReuseRisk": "unknown",
                "diversityTargetEligible": False,
                "modelTaskEligibility": {
                    "asr": "intake_pending",
                    "diarization": "not_evidenced",
                    "wordTiming": "not_evidenced",
                    "meetingSummary": "not_applicable_or_pending",
                },
                "discoveryVersion": DISCOVERY_VERSION,
                "discoveredAt": utc_now(),
            }
        )

    unique_candidate_channels = sorted({candidate["catalogChannelId"] for candidate in candidates})
    report = {
        "discoveryVersion": DISCOVERY_VERSION,
        "discoveredAt": utc_now(),
        "queriesPath": str(args.queries),
        "youtubeSearchFilter": YOUTUBE_SEARCH_FILTER,
        "note": "Search filter generated leads only; exact individual license observation and manual Korean subtitles are candidate gates.",
        "maxResultsPerQuery": args.max_results_per_query,
        "maxVideoAudits": args.max_video_audits,
        "minDurationSec": args.min_duration_sec,
        "excludedChannelIds": sorted(excluded_channels),
        "queryCount": len(queries),
        "uniqueLeads": len(leads),
        "auditedVideos": len(audits),
        "candidateVideos": len(candidates),
        "candidateChannels": len(unique_candidate_channels),
        "candidateChannelIds": unique_candidate_channels,
        "candidateHours": sum(float(candidate["catalogDurationSec"]) for candidate in candidates) / 3600,
        "searchErrors": search_errors,
        "metadataErrors": metadata_errors,
    }
    write_jsonl(args.audit, audits)
    write_jsonl(args.candidates, candidates)
    write_json(args.report, report)
    print(
        f"audited {len(audits)}/{len(leads)} leads; "
        f"{len(candidates)} candidates across {len(unique_candidate_channels)} channels; "
        f"{report['candidateHours']:.2f} candidate hours"
    )


if __name__ == "__main__":
    main()
