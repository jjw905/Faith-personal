#!/usr/bin/env python3
"""Collect reproducible Korean-video intake from YouTube CC BY sources.

The collector accepts only videos for which yt-dlp observes YouTube's
``Creative Commons Attribution license (reuse allowed)`` field at collection
time.  It preserves a deliberately storage-bounded 144p MP4 platform
rendition with the source M4A audio stream, then creates a 16 kHz mono FLAC
derivative for Faith's audio pipeline.  The retained MP4 is *not* represented
as the uploader's master file.

Every collected item remains outside train/gold/sealed splits until listening
QC, speaker/overlap annotations, and leakage review are complete.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_유튜브_CC_BY_2026-08-05"
)
DEFAULT_MANIFEST = DEFAULT_ROOT / "00_intake" / "candidates.jsonl"
COLLECTOR_VERSION = "youtube-cc-by-video-intake-v0.1"
EXPECTED_LICENSE = "Creative Commons Attribution license (reuse allowed)"
# 144p is intentional: the input signal needed for model tuning is the
# untouched platform audio stream.  It preserves the video context while
# keeping a 100-hour source pool feasible on the current workspace volume.
SOURCE_FORMAT = "bv*[height<=144][ext=mp4]+ba[ext=m4a]/b[height<=144][ext=mp4]"
# Some YouTube CDN edges intermittently return HTTP 503 for the preferred AV1
# rendition even when the equivalent AVC 144p stream is available.  Keep this
# fallback narrow: it preserves the same MP4 video + original M4A audio policy
# rather than silently switching to a different audio codec or re-encoding.
SOURCE_FORMAT_FALLBACK = "160+140/18"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_json(value: Any) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_command(command: str) -> None:
    result = subprocess.run(["/usr/bin/env", "which", command], capture_output=True, text=True)
    if result.returncode:
        raise SystemExit(f"required command is not available: {command}")


def run_json(command: list[str]) -> dict[str, Any]:
    result = subprocess.run(command, check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def yt_dlp_info(url: str) -> dict[str, Any]:
    return run_json(["yt-dlp", "--no-download", "--dump-single-json", "--", url])


def ffprobe_json(path_or_url: str) -> dict[str, Any]:
    return run_json(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate:stream=index,codec_name,codec_type,sample_rate,channels,bit_rate,bits_per_raw_sample,width,height",
            "-of",
            "json",
            path_or_url,
        ]
    )


def stream_summary(probe: dict[str, Any], codec_type: str) -> dict[str, Any] | None:
    for stream in probe.get("streams", []):
        if stream.get("codec_type") == codec_type:
            return {
                "codec": stream.get("codec_name"),
                "sampleRate": stream.get("sample_rate"),
                "channels": stream.get("channels"),
                "bitrate": stream.get("bit_rate"),
                "bitDepth": stream.get("bits_per_raw_sample"),
                "width": stream.get("width"),
                "height": stream.get("height"),
            }
    return None


def format_duration(value: Any) -> float | None:
    try:
        return round(float(value), 3)
    except (TypeError, ValueError):
        return None


def validate_candidate(candidate: dict[str, Any], line_number: int, manifest: Path) -> None:
    for field in ("alias", "videoId", "primaryDomain", "primaryBucket", "sourceFamily"):
        if not candidate.get(field):
            raise SystemExit(f"{manifest}:{line_number}: missing {field}")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", str(candidate["alias"])):
        raise SystemExit(f"{manifest}:{line_number}: unsafe alias {candidate['alias']!r}")
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", str(candidate["videoId"])):
        raise SystemExit(f"{manifest}:{line_number}: invalid YouTube videoId {candidate['videoId']!r}")


def read_manifest(path: Path) -> list[dict[str, Any]]:
    candidates: list[dict[str, Any]] = []
    aliases: set[str] = set()
    video_ids: set[str] = set()
    for line_number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        try:
            candidate = json.loads(raw)
        except json.JSONDecodeError as error:
            raise SystemExit(f"{path}:{line_number}: invalid JSON: {error}") from error
        validate_candidate(candidate, line_number, path)
        alias = str(candidate["alias"])
        video_id = str(candidate["videoId"])
        if alias in aliases:
            raise SystemExit(f"{path}:{line_number}: duplicate alias {alias}")
        if video_id in video_ids:
            raise SystemExit(f"{path}:{line_number}: duplicate videoId {video_id}")
        aliases.add(alias)
        video_ids.add(video_id)
        candidates.append(candidate)
    if not candidates:
        raise SystemExit(f"{path}: no candidates")
    return candidates


def canonical_url(video_id: str) -> str:
    return f"https://www.youtube.com/watch?v={video_id}"


def assert_rights(candidate: dict[str, Any], info: dict[str, Any]) -> None:
    expected_id = str(candidate["videoId"])
    observed_id = str(info.get("id") or "")
    if observed_id != expected_id:
        raise RuntimeError(f"yt-dlp resolved unexpected id: expected {expected_id}, got {observed_id}")
    observed_license = str(info.get("license") or "")
    if observed_license != EXPECTED_LICENSE:
        raise RuntimeError(
            "source is not a currently verified YouTube CC BY item: "
            f"observed license={observed_license!r}"
        )
    if info.get("is_live"):
        raise RuntimeError("live stream is not immutable enough for this intake; wait for its VOD")
    if format_duration(info.get("duration")) is None:
        raise RuntimeError("source has no stable duration")
    if candidate.get("transcriptRequirement") == "manual_youtube_ko_subtitles":
        if not manual_korean_subtitle_languages(info):
            raise RuntimeError("source has no publisher-provided Korean subtitle track")


def manual_korean_subtitle_languages(info: dict[str, Any]) -> list[str]:
    subtitles = info.get("subtitles") or {}
    return sorted(language for language in subtitles if language == "ko" or language.startswith("ko-"))


def automatic_korean_caption_languages(info: dict[str, Any]) -> list[str]:
    captions = info.get("automatic_captions") or {}
    return sorted(language for language in captions if language == "ko" or language.startswith("ko-"))


def preferred_manual_korean_subtitle_language(info: dict[str, Any]) -> str | None:
    languages = manual_korean_subtitle_languages(info)
    if "ko" in languages:
        return "ko"
    if "ko-KR" in languages:
        return "ko-KR"
    return languages[0] if languages else None


def _download_source_with_selector(url: str, source_path: Path, force: bool, selector: str) -> None:
    command = [
        "yt-dlp",
        "--no-progress",
        "--no-warnings",
        "--retries",
        "3",
        "--fragment-retries",
        "3",
        "--socket-timeout",
        "30",
        "--concurrent-fragments",
        "2",
        "--format",
        selector,
        "--merge-output-format",
        "mp4",
        "--output",
        str(source_path.with_suffix(".%(ext)s")),
    ]
    command.append("--force-overwrites" if force else "--no-overwrites")
    command.extend(["--", url])
    subprocess.run(command, check=True)


def download_source(url: str, source_path: Path, force: bool) -> str:
    if source_path.exists() and not force:
        return "existing_local_retained_source"
    try:
        _download_source_with_selector(url, source_path, force, SOURCE_FORMAT)
        selector = SOURCE_FORMAT
    except subprocess.CalledProcessError as primary_error:
        if source_path.exists() and source_path.stat().st_size:
            raise primary_error
        _download_source_with_selector(url, source_path, force, SOURCE_FORMAT_FALLBACK)
        selector = SOURCE_FORMAT_FALLBACK
    if not source_path.exists() or source_path.stat().st_size == 0:
        raise RuntimeError(f"yt-dlp did not leave the expected retained MP4: {source_path}")
    return selector


def derive_audio(source_path: Path, audio_path: Path, force: bool) -> None:
    if audio_path.exists() and not force:
        return
    partial = audio_path.with_name(f"{audio_path.stem}.part{audio_path.suffix}")
    command = [
        "ffmpeg",
        "-nostdin",
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(source_path),
        "-map",
        "0:a:0",
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "flac",
        str(partial),
    ]
    subprocess.run(command, check=True)
    partial.replace(audio_path)


def download_manual_subtitles(url: str, reference_dir: Path, alias: str, language: str, force: bool) -> Path:
    expected = reference_dir / f"{alias}.{language}.vtt"
    if expected.exists() and not force:
        return expected
    command = [
        "yt-dlp",
        "--no-progress",
        "--no-warnings",
        "--skip-download",
        "--write-subs",
        "--sub-langs",
        language,
        "--sub-format",
        "vtt",
        "--output",
        str(reference_dir / f"{alias}.%(ext)s"),
    ]
    command.append("--force-overwrites" if force else "--no-overwrites")
    command.extend(["--", url])
    subprocess.run(command, check=True)
    if expected.exists() and expected.stat().st_size:
        return expected
    available = sorted(reference_dir.glob(f"{alias}.{language}*.vtt"))
    if len(available) == 1 and available[0].stat().st_size:
        return available[0]
    raise RuntimeError(f"yt-dlp did not leave a manual VTT subtitle file for {language}")


def normalize_vtt(vtt_path: Path, text_path: Path, force: bool) -> None:
    if text_path.exists() and not force:
        return
    timestamp = re.compile(r"^\d{2}:\d{2}(?::\d{2})?\.\d{3}\s+-->\s+\d{2}:\d{2}(?::\d{2})?\.\d{3}")
    tag = re.compile(r"<[^>]+>")
    normalized: list[str] = []
    in_note = False
    for raw in vtt_path.read_text(encoding="utf-8-sig").splitlines():
        line = raw.strip()
        if not line:
            in_note = False
            continue
        if line.startswith(("WEBVTT", "Kind:", "Language:")):
            continue
        if line.startswith("NOTE"):
            in_note = True
            continue
        if in_note or timestamp.match(line) or line.isdigit():
            continue
        line = re.sub(r"<br\s*/?>", " ", line, flags=re.I)
        line = re.sub(r"<[^>]+>", "", line)
        line = re.sub(r"\s+", " ", html.unescape(line)).strip()
        if line and (not normalized or normalized[-1] != line):
            normalized.append(line)
    if not normalized:
        raise RuntimeError(f"manual VTT did not contain normalizable text: {vtt_path}")
    text_path.write_text("\n".join(normalized) + "\n", encoding="utf-8")


def extract_attribution(info: dict[str, Any], url: str) -> dict[str, Any]:
    return {
        "title": info.get("title"),
        "channel": info.get("channel"),
        "channelId": info.get("channel_id"),
        "uploader": info.get("uploader"),
        "uploaderId": info.get("uploader_id"),
        "uploadDate": info.get("upload_date"),
        "sourceUrl": url,
        "license": info.get("license"),
    }


def collect(candidate: dict[str, Any], root: Path, force: bool, probe_only: bool) -> dict[str, Any]:
    alias = str(candidate["alias"])
    url = canonical_url(str(candidate["videoId"]))
    info = yt_dlp_info(url)
    assert_rights(candidate, info)

    source_path = root / "00_source" / f"{alias}.mp4"
    audio_path = root / "01_audio" / f"{alias}.flac"
    subtitle_language = preferred_manual_korean_subtitle_language(info)
    subtitle_path = (
        root / "02_references" / f"{alias}.{subtitle_language}.vtt" if subtitle_language else None
    )
    transcript_path = (
        root / "02_references" / f"{alias}.{subtitle_language}.reference.txt" if subtitle_language else None
    )
    metadata_path = root / "03_meta" / f"{alias}.json"
    if not probe_only:
        source_selector_used = download_source(url, source_path, force)
        source_probe = ffprobe_json(str(source_path))
        if stream_summary(source_probe, "video") is None:
            raise RuntimeError("retained source has no video stream")
        if stream_summary(source_probe, "audio") is None:
            raise RuntimeError("retained source has no audio stream")
        derive_audio(source_path, audio_path, force)
        if candidate.get("transcriptRequirement") == "manual_youtube_ko_subtitles":
            if subtitle_language is None or subtitle_path is None or transcript_path is None:
                raise RuntimeError("manual Korean subtitle was required but no language was available")
            subtitle_path = download_manual_subtitles(url, root / "02_references", alias, subtitle_language, force)
            normalize_vtt(subtitle_path, transcript_path, force)
    else:
        source_probe = ffprobe_json(str(source_path)) if source_path.exists() else {}
        source_selector_used = "probe_only_no_retained_source_download"

    derived_probe = ffprobe_json(str(audio_path)) if audio_path.exists() else {}
    source_duration = format_duration(info.get("duration"))
    retained_duration = format_duration(source_probe.get("format", {}).get("duration"))
    title_risk_pending = (
        candidate.get("contentOwnershipScreening")
        == "title_risk_requires_human_third_party_content_review"
    )
    observed_channel_id = str(candidate.get("catalogChannelId") or info.get("channel_id") or "unknown")
    source_group = str(candidate.get("sourceGroup") or f"youtube-channel:{observed_channel_id}")
    series_group = str(candidate.get("seriesGroup") or source_group)
    voice_cluster_candidate = str(candidate.get("voiceClusterCandidate") or source_group)
    model_task_eligibility = dict(
        candidate.get("modelTaskEligibility")
        or {
            "asr": "intake_pending",
            "diarization": "not_evidenced",
            "wordTiming": "not_evidenced",
            "meetingSummary": "not_applicable_or_pending",
        }
    )
    promotion_blockers = [
        "human_listening_qc",
        "speaker_and_overlap_annotation",
        "split_leakage_review",
        "source_ownership_representation_review",
        "attribution_registry",
    ]
    if title_risk_pending:
        promotion_blockers.append("title_risk_human_third_party_content_review")
    metadata: dict[str, Any] = {
        **candidate,
        "canonicalSourceUrl": url,
        "pageTitle": info.get("title"),
        "sourceLicense": EXPECTED_LICENSE,
        "licenseEvidenceUrl": url,
        "sourceInfoMetadataSha256": sha256_json(info),
        "sourceDurationSec": source_duration,
        "retainedSourceDurationSec": retained_duration,
        "sourceOriginalStatus": "selected_youtube_platform_rendition_not_uploader_master",
        "sourceRenditionPolicy": {
            "requestedFormatSelector": SOURCE_FORMAT,
            "fallbackFormatSelector": SOURCE_FORMAT_FALLBACK,
            "actualDownloadSelector": source_selector_used,
            "fallbackUsed": source_selector_used == SOURCE_FORMAT_FALLBACK,
            "retainedContainer": "MP4",
            "collectorTranscode": "none; yt-dlp/ffmpeg remuxes selected MP4 video and M4A audio streams",
            "visualResolutionTarget": "144p maximum to preserve video context within local storage budget",
        },
        "sourceOrDerived": "retained_video_source_and_derived_audio",
        "sourcePath": str(source_path) if source_path.exists() else None,
        "sourceSha256": sha256_file(source_path) if source_path.exists() else None,
        "sourceFileSizeBytes": source_path.stat().st_size if source_path.exists() else None,
        "sourceProbe": {
            "container": "MP4 selected platform rendition",
            "video": stream_summary(source_probe, "video"),
            "audio": stream_summary(source_probe, "audio"),
            "durationSec": retained_duration,
        },
        "derivation": "retained selected YouTube CC BY MP4 -> 16kHz mono FLAC",
        "transcodeCount": 1,
        "audioPath": str(audio_path) if audio_path.exists() else None,
        "derivedSha256": sha256_file(audio_path) if audio_path.exists() else None,
        "derivedFileSizeBytes": audio_path.stat().st_size if audio_path.exists() else None,
        "derivedProbe": {
            "audio": stream_summary(derived_probe, "audio"),
            "durationSec": format_duration(derived_probe.get("format", {}).get("duration")),
        },
        "transcript": {
            "requirement": candidate.get("transcriptRequirement") or "none",
            "manualKoreanSubtitleLanguagesAvailable": manual_korean_subtitle_languages(info),
            "automaticKoreanCaptionLanguagesAvailable": automatic_korean_caption_languages(info),
            "sourceType": "publisher_provided_youtube_subtitles" if subtitle_path and subtitle_path.exists() else None,
            "language": subtitle_language,
            "rawVttPath": str(subtitle_path) if subtitle_path and subtitle_path.exists() else None,
            "rawVttSha256": sha256_file(subtitle_path) if subtitle_path and subtitle_path.exists() else None,
            "normalizedTextPath": str(transcript_path) if transcript_path and transcript_path.exists() else None,
            "normalizedTextSha256": sha256_file(transcript_path) if transcript_path and transcript_path.exists() else None,
        },
        "attribution": extract_attribution(info, url),
        "platformLicensePermitsCommercialAdaptation": True,
        "rightsStatus": (
            "youtube_cc_by_verified_title_risk_pending_human_review"
            if title_risk_pending
            else "youtube_cc_by_verified_at_collection_time"
        ),
        "rightsEligibleForModelTuning": not title_risk_pending,
        "rightsCaveat": (
            "YouTube CC BY is the uploader's licence representation; title-level possible third-party material "
            "must be reviewed before model-tuning promotion."
            if title_risk_pending
            else "YouTube CC BY is the uploader's licence representation; ownership-chain review remains recorded for promotion."
        ),
        "sourceGroup": source_group,
        "seriesGroup": series_group,
        "voiceClusterCandidate": voice_cluster_candidate,
        "speakerDiversityEvidence": candidate.get("speakerDiversityEvidence") or "unreviewed",
        "observedSpeakerCount": candidate.get("observedSpeakerCount"),
        "hasVerifiedOverlap": bool(candidate.get("hasVerifiedOverlap", False)),
        "primarySpeakerReuseRisk": candidate.get("primarySpeakerReuseRisk") or "unknown",
        "diversityTargetEligible": bool(candidate.get("diversityTargetEligible", False)),
        "modelTaskEligibility": model_task_eligibility,
        "audioSentExternally": False,
        "trainingEligible": False,
        "goldStatus": "none",
        "split": "intake_pending",
        "promotionBlockers": promotion_blockers,
        "collectedAt": utc_now(),
        "collectorVersion": COLLECTOR_VERSION,
    }
    write_json(metadata_path, metadata)
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument(
        "--summary",
        type=Path,
        help="write this run's immutable summary here (default: <root>/00_intake/youtube-cc-collection-summary.json)",
    )
    parser.add_argument("--only", nargs="*", help="collect only these aliases")
    parser.add_argument("--force", action="store_true", help="explicitly refresh an existing retained MP4 and FLAC")
    parser.add_argument("--probe-only", action="store_true", help="verify licence and source metadata without downloading media")
    args = parser.parse_args()

    for command in ("yt-dlp", "ffmpeg", "ffprobe"):
        require_command(command)
    for directory in ("00_intake", "00_source", "01_audio", "02_references", "03_meta", "04_qa"):
        (args.root / directory).mkdir(parents=True, exist_ok=True)
    summary_path = args.summary or args.root / "00_intake" / "youtube-cc-collection-summary.json"
    summary_path.parent.mkdir(parents=True, exist_ok=True)

    candidates = read_manifest(args.manifest)
    if args.only:
        requested = set(args.only)
        candidates = [candidate for candidate in candidates if candidate["alias"] in requested]
        missing = requested - {candidate["alias"] for candidate in candidates}
        if missing:
            raise SystemExit(f"unknown aliases requested: {', '.join(sorted(missing))}")

    summary: dict[str, Any] = {
        "collectorVersion": COLLECTOR_VERSION,
        "startedAt": utc_now(),
        "manifest": str(args.manifest),
        "root": str(args.root),
        "summaryPath": str(summary_path),
        "probeOnly": args.probe_only,
        "requested": len(candidates),
        "collected": [],
        "errors": [],
    }
    for candidate in candidates:
        alias = str(candidate["alias"])
        print(f"collecting {alias} ...", flush=True)
        try:
            metadata = collect(candidate, args.root, args.force, args.probe_only)
            summary["collected"].append(
                {
                    "alias": alias,
                    "sourceDurationSec": metadata["sourceDurationSec"],
                    "sourceSha256": metadata["sourceSha256"],
                    "derivedSha256": metadata["derivedSha256"],
                    "transcriptVttSha256": metadata["transcript"]["rawVttSha256"],
                }
            )
            print(f"  ok {metadata['sourceDurationSec']:.1f}s", flush=True)
        except Exception as error:
            summary["errors"].append({"alias": alias, "error": str(error)})
            print(f"  failed: {error}", file=sys.stderr, flush=True)

    summary["finishedAt"] = utc_now()
    summary["acceptedDurationSec"] = round(
        sum(item["sourceDurationSec"] for item in summary["collected"] if item["sourceDurationSec"]), 3
    )
    summary["acceptedSourceHours"] = summary["acceptedDurationSec"] / 3600
    summary["rightsEligibleDurationSec"] = round(
        sum(
            item["sourceDurationSec"]
            for item in summary["collected"]
            if item["sourceDurationSec"]
            and (args.root / "03_meta" / f"{item['alias']}.json").exists()
            and json.loads((args.root / "03_meta" / f"{item['alias']}.json").read_text(encoding="utf-8")).get(
                "rightsEligibleForModelTuning"
            )
        ),
        3,
    )
    summary["rightsEligibleSourceHours"] = summary["rightsEligibleDurationSec"] / 3600
    write_json(summary_path, summary)
    print(
        f"completed: {len(summary['collected'])}/{summary['requested']} sources, "
        f"{summary['acceptedSourceHours']:.2f} source hours, "
        f"{len(summary['errors'])} errors"
    )
    if summary["errors"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
