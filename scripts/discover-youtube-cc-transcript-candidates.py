#!/usr/bin/env python3
"""Discover YouTube CC BY videos with publisher-provided Korean subtitles.

Discovery is deliberately separate from download.  It resolves each listed
video, requires the platform's CC BY licence field, and distinguishes manual
Korean subtitles from YouTube automatic captions.  The resulting JSONL is
compatible with ``collect-youtube-cc-videos.py`` after human curation.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_유튜브_CC_BY_2026-08-05"
)
DEFAULT_PROFILES = DEFAULT_ROOT / "00_intake" / "source-profiles.jsonl"
DEFAULT_OUTPUT = DEFAULT_ROOT / "00_intake" / "manual-ko-subtitle-catalog.jsonl"
DEFAULT_REPORT = DEFAULT_ROOT / "00_intake" / "manual-ko-subtitle-discovery-report.json"
EXPECTED_LICENSE = "Creative Commons Attribution license (reuse allowed)"
DISCOVERY_VERSION = "youtube-cc-by-manual-ko-discovery-v0.1"
REQUEST_DELAY_SEC = 0.2


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_profiles(path: Path) -> list[dict[str, Any]]:
    profiles: list[dict[str, Any]] = []
    names: set[str] = set()
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        try:
            profile = json.loads(raw)
        except json.JSONDecodeError as error:
            raise SystemExit(f"{path}:{line_number}: invalid JSON: {error}") from error
        for field in ("sourceName", "channelUrl", "sourceFamily", "primaryDomain", "primaryBucket"):
            if not profile.get(field):
                raise SystemExit(f"{path}:{line_number}: missing {field}")
        if profile["sourceName"] in names:
            raise SystemExit(f"{path}:{line_number}: duplicate sourceName {profile['sourceName']}")
        names.add(profile["sourceName"])
        profiles.append(profile)
    if not profiles:
        raise SystemExit(f"{path}: no source profiles")
    return profiles


def playlist_entries(channel_url: str) -> list[dict[str, Any]]:
    listing = run_json(["yt-dlp", "--flat-playlist", "--no-warnings", "--dump-single-json", "--", channel_url])
    entries = listing.get("entries") or []
    return [entry for entry in entries if entry and entry.get("id") and entry.get("url")]


def video_info(url: str) -> dict[str, Any]:
    return run_json(["yt-dlp", "--no-download", "--no-warnings", "--dump-single-json", "--", url])


def korean_manual_subtitle_languages(info: dict[str, Any]) -> list[str]:
    subtitles = info.get("subtitles") or {}
    return sorted(key for key in subtitles if key == "ko" or key.startswith("ko-"))


def automatic_korean_caption_languages(info: dict[str, Any]) -> list[str]:
    captions = info.get("automatic_captions") or {}
    return sorted(key for key in captions if key == "ko" or key.startswith("ko-"))


def duration_sec(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def alias(source_name: str, video_id: str) -> str:
    return f"{source_name}-{video_id}"


def candidate_from_info(profile: dict[str, Any], info: dict[str, Any], manual_languages: list[str]) -> dict[str, Any]:
    video_id = str(info["id"])
    return {
        "alias": alias(str(profile["sourceName"]), video_id),
        "videoId": video_id,
        "sourceFamily": profile["sourceFamily"],
        "primaryDomain": profile["primaryDomain"],
        "primaryBucket": profile["primaryBucket"],
        "secondaryTags": list(profile.get("secondaryTags") or []) + ["youtube_cc_by", "manual_ko_subtitles"],
        "audioQualityAxis": profile.get("audioQualityAxis", "common_compressed_source"),
        "transcriptRequirement": "manual_youtube_ko_subtitles",
        "manualKoreanSubtitleLanguages": manual_languages,
        "catalogTitle": info.get("title"),
        "catalogDurationSec": duration_sec(info.get("duration")),
        "catalogChannel": info.get("channel"),
        "catalogChannelId": info.get("channel_id"),
        "catalogLicense": info.get("license"),
        "sourcePageUrl": f"https://www.youtube.com/watch?v={video_id}",
        "discoveredAt": now(),
        "discoveryVersion": DISCOVERY_VERSION,
    }


def write_jsonl(path: Path, records: list[dict[str, Any]], overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise SystemExit(f"refusing to replace existing catalog: {path} (pass --overwrite after review)")
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = "".join(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n" for record in records)
    path.write_text(payload, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profiles", type=Path, default=DEFAULT_PROFILES)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    parser.add_argument("--min-duration-sec", type=int, default=600)
    parser.add_argument("--max-per-profile", type=int, help="safe cap for a first source audit")
    parser.add_argument("--overwrite", action="store_true", help="replace existing discovery files")
    args = parser.parse_args()

    profiles = read_profiles(args.profiles)
    report: dict[str, Any] = {
        "discoveryVersion": DISCOVERY_VERSION,
        "startedAt": now(),
        "profiles": [],
        "errors": [],
    }
    candidates: list[dict[str, Any]] = []
    seen_video_ids: set[str] = set()

    for profile in profiles:
        source_name = str(profile["sourceName"])
        try:
            entries = playlist_entries(str(profile["channelUrl"]))
        except Exception as error:
            report["errors"].append({"sourceName": source_name, "stage": "playlist", "error": str(error)})
            continue
        processed = 0
        manual_count = 0
        manual_seconds = 0.0
        profile_errors = 0
        for entry in entries:
            duration = duration_sec(entry.get("duration"))
            if duration is None or duration < args.min_duration_sec:
                continue
            if args.max_per_profile is not None and processed >= args.max_per_profile:
                break
            processed += 1
            video_id = str(entry["id"])
            try:
                info = video_info(str(entry["url"]))
                if info.get("license") != EXPECTED_LICENSE:
                    continue
                manual_languages = korean_manual_subtitle_languages(info)
                if not manual_languages:
                    continue
                if video_id in seen_video_ids:
                    continue
                seen_video_ids.add(video_id)
                candidate = candidate_from_info(profile, info, manual_languages)
                candidates.append(candidate)
                manual_count += 1
                manual_seconds += float(candidate["catalogDurationSec"] or 0)
            except Exception as error:
                profile_errors += 1
                report["errors"].append(
                    {"sourceName": source_name, "videoId": video_id, "stage": "video", "error": str(error)}
                )
            if processed % 20 == 0:
                print(
                    f"{source_name}: checked {processed} candidates, accepted {manual_count} "
                    f"({manual_seconds / 3600:.2f}h)",
                    flush=True,
                )
            time.sleep(REQUEST_DELAY_SEC)
        report["profiles"].append(
            {
                "sourceName": source_name,
                "playlistEntries": len(entries),
                "checkedDurationEligible": processed,
                "acceptedManualKoreanSubtitleCount": manual_count,
                "acceptedManualKoreanSubtitleSeconds": round(manual_seconds, 3),
                "errors": profile_errors,
            }
        )

    write_jsonl(args.output, candidates, args.overwrite)
    report["finishedAt"] = now()
    report["acceptedCandidates"] = len(candidates)
    report["acceptedManualKoreanSubtitleSeconds"] = round(
        sum(float(candidate["catalogDurationSec"] or 0) for candidate in candidates), 3
    )
    report["acceptedManualKoreanSubtitleHours"] = report["acceptedManualKoreanSubtitleSeconds"] / 3600
    write_json(args.report, report)
    print(
        f"completed: {len(candidates)} CC BY videos with manual Korean subtitles, "
        f"{report['acceptedManualKoreanSubtitleHours']:.2f}h"
    )


if __name__ == "__main__":
    main()
