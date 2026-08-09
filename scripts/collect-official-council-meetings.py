#!/usr/bin/env python3
"""Collect official Korean council meeting videos paired with official minutes.

The source MP4 is retained byte-for-byte and is the collection/QC input.  This
collector does not create a FLAC copy: decoding to PCM, if a later model needs
it, is a temporary model-runtime concern rather than a collected asset.
Official minutes are weak-supervision text until alignment and human listening
QC are completed; this collector never marks them as frame-accurate gold labels.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_ROOT = Path(
    "Faith-office/08_검증_정답셋/Faith_STT_수집_공식회의_속기록_2026-08-05"
)
DEFAULT_MANIFEST = DEFAULT_ROOT / "00_intake" / "meeting-pairs.v1.json"
COLLECTOR_VERSION = "official-council-meeting-pairs-v0.2-source-video-only"
USER_AGENT = "Faith-STT-official-council-intake/2026-08-05"
MIN_DURATION_SEC = 600.0
MIN_HANGUL_CHARS = 5000
MIN_SPEAKER_LABELS = 4


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_run_id(value: str) -> str:
    return value.replace("+00:00", "Z").replace("-", "").replace(":", "").replace(".", "-")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def require_command(name: str) -> None:
    if not shutil.which(name):
        raise SystemExit(f"required command is not available: {name}")


def run(command: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=capture, text=True)
    if result.returncode:
        detail = (result.stderr or result.stdout or "").strip().replace("\n", " ")
        raise RuntimeError(f"command failed ({result.returncode}): {detail[-1600:]}")
    return result


def curl_download(url: str, destination: Path, *, force: bool = False) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists() and not force:
        return
    partial = destination.with_name(destination.name + ".part")
    command = [
        "curl",
        "--fail",
        "--location",
        "--retry",
        "4",
        "--retry-all-errors",
        "--connect-timeout",
        "30",
        "--speed-limit",
        "1024",
        "--speed-time",
        "30",
        "--compressed",
        "--silent",
        "--show-error",
        "--user-agent",
        USER_AGENT,
    ]
    if partial.exists() and partial.stat().st_size:
        command.extend(["--continue-at", "-"])
    command.extend(["--output", str(partial), url])
    run(command)
    partial.replace(destination)


def ffprobe_json(path_or_url: str) -> dict[str, Any]:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,size,bit_rate:stream=index,codec_name,codec_type,sample_rate,channels,channel_layout,bit_rate,bits_per_raw_sample,width,height",
            "-of",
            "json",
            path_or_url,
        ],
        capture=True,
    )
    return json.loads(result.stdout)


def probe_duration(probe: dict[str, Any]) -> float:
    return float(probe.get("format", {}).get("duration") or 0.0)


def first_stream(probe: dict[str, Any], codec_type: str) -> dict[str, Any] | None:
    return next((item for item in probe.get("streams", []) if item.get("codec_type") == codec_type), None)


def stream_summary(stream: dict[str, Any] | None) -> dict[str, Any] | None:
    if stream is None:
        return None
    return {
        "codec": stream.get("codec_name"),
        "sampleRate": stream.get("sample_rate"),
        "channels": stream.get("channels"),
        "channelLayout": stream.get("channel_layout"),
        "bitrate": stream.get("bit_rate"),
        "bitDepth": stream.get("bits_per_raw_sample"),
        "width": stream.get("width"),
        "height": stream.get("height"),
    }


def compact_text(value: str) -> str:
    value = re.sub(r"<(?:script|style)[^>]*>.*?</(?:script|style)>", " ", value, flags=re.S | re.I)
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"</(?:div|p|li|h[1-6]|tr|section|article)>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", " ", value)
    lines = [re.sub(r"[ \t\r\f\v]+", " ", html.unescape(line)).strip() for line in value.split("\n")]
    return "\n".join(line for line in lines if line)


def fetch_ggc_speaker_timeline(candidate: dict[str, Any]) -> tuple[str, list[dict[str, Any]]] | None:
    if candidate.get("transcriptParser") != "ggc_context_blocks":
        return None
    match = re.search(r"[?&]midx=(\d+)", str(candidate.get("sourcePageUrl") or ""))
    if not match:
        raise RuntimeError(f"Gyeonggi candidate has no midx: {candidate.get('alias')}")
    midx = match.group(1)
    url = f"https://kms.ggc.go.kr/caster/player/listAngunXhr.do?midx={midx}"
    result = run(
        [
            "curl",
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "--user-agent",
            USER_AGENT,
            url,
        ],
        capture=True,
    )
    timeline = json.loads(result.stdout)
    if not isinstance(timeline, list):
        raise RuntimeError(f"Gyeonggi speaker timeline is not a list: {candidate.get('alias')}")
    return url, timeline


def fetch_chungnam_video_info(candidate: dict[str, Any]) -> str:
    if candidate.get("transcriptParser") != "chungnam_video_info":
        raise RuntimeError("Chungnam video-info fetch called for another parser")
    uid = str(candidate.get("videoUid") or "").strip()
    if not uid:
        match = re.search(r"/minutes/(\d+)\.do", str(candidate.get("sourcePageUrl") or ""))
        uid = match.group(1) if match else ""
    if not uid:
        raise RuntimeError(f"Chungnam candidate has no video uid: {candidate.get('alias')}")
    result = run(
        [
            "curl",
            "--fail",
            "--location",
            "--compressed",
            "--silent",
            "--show-error",
            "--user-agent",
            USER_AGENT,
            "--request",
            "POST",
            "--header",
            "X-Requested-With: XMLHttpRequest",
            "--header",
            f"Referer: {candidate['sourcePageUrl']}",
            "--data",
            f"uid={uid}",
            str(candidate["transcriptUrl"]),
        ],
        capture=True,
    )
    # Parse once here so an HTML error page is never preserved as official transcript data.
    value = json.loads(result.stdout)
    if int(value.get("video", {}).get("uid") or 0) != int(uid):
        raise RuntimeError(f"Chungnam video-info uid mismatch: {candidate.get('alias')}")
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def clean_speaker_label(value: str) -> str:
    return re.sub(r"^[○●]\s*", "", compact_text(value)).strip()


def speaker_labels_from_text(value: str) -> list[str]:
    labels: list[str] = []
    for line in value.splitlines():
        match = re.match(r"^[○●]\s*(.+?)(?:\s{2,}|$)", line)
        if match:
            label = match.group(1).strip()
            if label:
                labels.append(label)
    return labels


def speaker_labels_from_html(value: str) -> list[str]:
    """Extract labels before whitespace normalization removes the two-space delimiter."""
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    labels: list[str] = []
    for raw_line in html.unescape(value).splitlines():
        line = raw_line.strip()
        match = re.match(r"^[○●]\s*(.+?)\s{2,}", line)
        if match:
            label = match.group(1).strip()
            if label:
                labels.append(label)
    return labels


def parse_seoul_minutes(raw_html: str) -> dict[str, Any]:
    block_pattern = re.compile(
        r"<div\s+id=['\"]record(\d+)['\"][^>]*data-pos=['\"]([^'\"]*)['\"][^>]*>(.*?)</div>",
        re.S | re.I,
    )
    blocks: list[dict[str, Any]] = []
    all_labels: list[str] = []
    for match in block_pattern.finditer(raw_html):
        text = compact_text(match.group(3))
        labels = speaker_labels_from_html(match.group(3))
        all_labels.extend(labels)
        position = match.group(2).strip()
        blocks.append(
            {
                "blockIndex": int(match.group(1)),
                "startSec": float(position) if position else None,
                "speakerLabels": labels,
                "text": text,
            }
        )
    if not blocks:
        raise RuntimeError("Seoul transcript parser found no record blocks")
    full_text = "\n\n".join(block["text"] for block in blocks)
    return {
        "parser": "seoul_record_blocks-v0.1",
        "alignmentStatus": "official_coarse_block_offsets_not_gold",
        "blocks": blocks,
        "fullText": full_text,
        "speakerLabels": sorted(set(all_labels)),
        "speakerLabelCounts": dict(sorted(Counter(all_labels).items())),
    }


def parse_busan_minutes(raw_html: str) -> dict[str, Any]:
    article_match = re.search(r"<article\s+id=['\"]bodyBx['\"][^>]*>(.*?)</article>", raw_html, re.S | re.I)
    if not article_match:
        raise RuntimeError("Busan transcript parser found no bodyBx article")
    article = article_match.group(1)
    token_pattern = re.compile(
        r"<span\s+class=['\"]member['\"][^>]*>(.*?)</span>|<div\s+class=['\"]text['\"][^>]*>(.*?)</div>",
        re.S | re.I,
    )
    turns: list[dict[str, Any]] = []
    current_speaker: str | None = None
    pending_text: list[str] = []

    def flush() -> None:
        nonlocal pending_text
        text = " ".join(piece for piece in pending_text if piece).strip()
        if current_speaker and text:
            turns.append({"turnIndex": len(turns), "speakerLabel": current_speaker, "text": text})
        pending_text = []

    for match in token_pattern.finditer(article):
        if match.group(1) is not None:
            flush()
            current_speaker = clean_speaker_label(match.group(1)) or None
        else:
            value = compact_text(match.group(2) or "")
            if value:
                pending_text.append(value.replace("\n", " "))
    flush()
    if not turns:
        raise RuntimeError("Busan transcript parser found no speaker turns")
    labels = [turn["speakerLabel"] for turn in turns]
    full_text = "\n".join(f"○ {turn['speakerLabel']}  {turn['text']}" for turn in turns)
    return {
        "parser": "busan_bodybx-v0.1",
        "alignmentStatus": "official_minutes_without_frame_offsets_not_gold",
        "turns": turns,
        "fullText": full_text,
        "speakerLabels": sorted(set(labels)),
        "speakerLabelCounts": dict(sorted(Counter(labels).items())),
    }


def parse_ggc_minutes(raw_html: str) -> dict[str, Any]:
    block_pattern = re.compile(
        r"<div[^>]+id=['\"]CONTEXT(\d+)['\"][^>]*>(.*?)</div>",
        re.S | re.I,
    )
    blocks: list[dict[str, Any]] = []
    labels: list[str] = []
    for match in block_pattern.finditer(raw_html):
        body = match.group(2)
        speaker_match = re.search(r"<strong[^>]*>(.*?)</strong>", body, re.S | re.I)
        speaker = clean_speaker_label(speaker_match.group(1)) if speaker_match else ""
        text = compact_text(re.sub(r"<strong[^>]*>.*?</strong>", "", body, count=1, flags=re.S | re.I))
        if speaker:
            labels.append(speaker)
        blocks.append(
            {
                "blockIndex": int(match.group(1)),
                "speakerLabel": speaker or None,
                "text": text,
            }
        )
    if not blocks:
        raise RuntimeError("Gyeonggi transcript parser found no CONTEXT blocks")
    full_text = "\n\n".join(
        f"○ {block['speakerLabel']}  {block['text']}" if block["speakerLabel"] else block["text"]
        for block in blocks
    )
    return {
        "parser": "ggc_context_blocks-v0.1",
        "alignmentStatus": "official_provisional_minutes_without_exported_frame_offsets_not_gold",
        "blocks": blocks,
        "fullText": full_text,
        "speakerLabels": sorted(set(labels)),
        "speakerLabelCounts": dict(sorted(Counter(labels).items())),
    }


def parse_chungnam_minutes(raw_json: str) -> dict[str, Any]:
    value = json.loads(raw_json)
    video = value.get("video") or {}
    speeches = video.get("speech_list") or []
    turns: list[dict[str, Any]] = []
    labels: list[str] = []
    for speech in speeches:
        speaker = clean_speaker_label(str(speech.get("speaker") or ""))
        text = compact_text(str(speech.get("speech") or ""))
        if not speaker or not text:
            continue
        labels.append(speaker)
        turns.append(
            {
                "turnIndex": len(turns),
                "officialSpeechUid": speech.get("uid"),
                "officialSort": speech.get("sort"),
                "speakerLabel": speaker,
                "text": text,
            }
        )
    if not turns:
        raise RuntimeError("Chungnam transcript parser found no speaker turns")
    agendas = [
        {
            "officialAgendaUid": agenda.get("uid"),
            "type": agenda.get("type"),
            "runtime": agenda.get("runtime"),
            "agenda": compact_text(str(agenda.get("agenda") or "")),
        }
        for agenda in (video.get("agenda_list") or [])
    ]
    full_text = "\n".join(f"○ {turn['speakerLabel']}  {turn['text']}" for turn in turns)
    return {
        "parser": "chungnam_video_info-v0.1",
        "alignmentStatus": "official_minutes_without_per_turn_frame_offsets_not_gold",
        "officialVideoUid": video.get("uid"),
        "agendas": agendas,
        "turns": turns,
        "fullText": full_text,
        "speakerLabels": sorted(set(labels)),
        "speakerLabelCounts": dict(sorted(Counter(labels).items())),
    }


def validate_manifest(value: dict[str, Any], path: Path) -> list[dict[str, Any]]:
    candidates = value.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise SystemExit(f"{path}: candidates must be a nonempty list")
    seen: set[str] = set()
    for index, candidate in enumerate(candidates):
        for field in (
            "alias",
            "institution",
            "committee",
            "meetingDate",
            "meetingTitle",
            "sourcePageUrl",
            "videoUrl",
            "transcriptUrl",
            "transcriptParser",
        ):
            if not candidate.get(field):
                raise SystemExit(f"{path}: candidates[{index}] missing {field}")
        alias = str(candidate["alias"])
        if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", alias):
            raise SystemExit(f"{path}: unsafe alias {alias!r}")
        if alias in seen:
            raise SystemExit(f"{path}: duplicate alias {alias}")
        seen.add(alias)
    return candidates


def preflight_storage(root: Path, candidates: list[dict[str, Any]]) -> dict[str, int]:
    expected_source = sum(int(item.get("expectedProbe", {}).get("sizeBytes") or 0) for item in candidates)
    remaining_source = 0
    for item in candidates:
        expected_bytes = int(item.get("expectedProbe", {}).get("sizeBytes") or 0)
        source = root / "00_source" / f"{item['alias']}.mp4"
        partial = source.with_name(source.name + ".part")
        if source.exists():
            continue
        already_downloaded = partial.stat().st_size if partial.exists() else 0
        remaining_source += max(0, expected_bytes - already_downloaded)
    free = shutil.disk_usage(root.parent if root.parent.exists() else Path.cwd()).free
    required = int(remaining_source * 1.05) + 1024**3
    if free < required:
        raise SystemExit(
            f"insufficient free space: free={free}, required={required}, remainingSource={remaining_source}"
        )
    return {
        "freeBytesBeforeRun": free,
        "expectedSourceBytes": expected_source,
        "remainingSourceBytes": remaining_source,
        "requiredBytes": required,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=DEFAULT_ROOT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--only", action="append", default=[])
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--probe-only", action="store_true")
    args = parser.parse_args()

    for command in ("curl", "ffprobe"):
        require_command(command)
    manifest_value = json.loads(args.manifest.read_text(encoding="utf-8"))
    candidates = validate_manifest(manifest_value, args.manifest)
    only = set(args.only)
    if only:
        unknown = only - {str(item["alias"]) for item in candidates}
        if unknown:
            raise SystemExit(f"unknown aliases in --only: {sorted(unknown)}")
        candidates = [item for item in candidates if str(item["alias"]) in only]

    args.root.mkdir(parents=True, exist_ok=True)
    storage = preflight_storage(args.root, candidates)
    started_at = utc_now()
    run_id = make_run_id(started_at)
    run_config = {
        "collectorVersion": COLLECTOR_VERSION,
        "startedAt": started_at,
        "runId": run_id,
        "root": str(args.root),
        "manifest": str(args.manifest),
        "manifestSha256": sha256_file(args.manifest),
        "selectedAliases": [item["alias"] for item in candidates],
        "thresholds": {
            "minimumDurationSec": MIN_DURATION_SEC,
            "minimumHangulCharacters": MIN_HANGUL_CHARS,
            "minimumDistinctSpeakerLabels": MIN_SPEAKER_LABELS,
        },
        "sourcePolicy": "direct official-host MP4 retained unchanged",
        "collectionInputPolicy": "use the retained source MP4 and its original audio stream directly",
        "audioDerivative": "disabled; no FLAC is created or required",
        "officialMinutesStatus": "weak supervision; not frame-accurate gold without later alignment and human QC",
        "force": args.force,
        "probeOnly": args.probe_only,
        "storagePreflight": storage,
        "command": sys.argv,
    }
    write_json(args.root / "00_intake" / "run-config.latest.json", run_config)

    results: list[dict[str, Any]] = []
    for index, candidate in enumerate(candidates, 1):
        alias = str(candidate["alias"])
        print(f"[{index}/{len(candidates)}] {alias}: snapshot and probe", flush=True)
        source_page = args.root / "00_intake" / "source_pages" / f"{alias}.html"
        parser_name = str(candidate["transcriptParser"])
        if parser_name == "chungnam_video_info":
            transcript_raw = args.root / "02_transcripts" / "raw_json" / f"{alias}.json"
        else:
            transcript_raw = args.root / "02_transcripts" / "raw_html" / f"{alias}.html"
        curl_download(str(candidate["sourcePageUrl"]), source_page, force=args.force)
        if parser_name == "chungnam_video_info":
            transcript_raw.parent.mkdir(parents=True, exist_ok=True)
            if args.force or not transcript_raw.exists():
                transcript_raw.write_text(fetch_chungnam_video_info(candidate), encoding="utf-8")
        elif candidate["transcriptUrl"] == candidate["sourcePageUrl"]:
            transcript_raw.parent.mkdir(parents=True, exist_ok=True)
            if args.force or not transcript_raw.exists():
                shutil.copyfile(source_page, transcript_raw)
        else:
            curl_download(str(candidate["transcriptUrl"]), transcript_raw, force=args.force)
        raw_text = transcript_raw.read_text(encoding="utf-8", errors="replace")
        if parser_name == "seoul_record_blocks":
            transcript = parse_seoul_minutes(raw_text)
        elif parser_name == "busan_bodybx":
            transcript = parse_busan_minutes(raw_text)
        elif parser_name == "ggc_context_blocks":
            transcript = parse_ggc_minutes(raw_text)
        elif parser_name == "chungnam_video_info":
            transcript = parse_chungnam_minutes(raw_text)
        else:
            raise RuntimeError(f"unsupported transcript parser: {parser_name}")

        transcript_text = args.root / "02_transcripts" / "text" / f"{alias}.txt"
        transcript_json = args.root / "02_transcripts" / "json" / f"{alias}.json"
        transcript_text.parent.mkdir(parents=True, exist_ok=True)
        transcript_text.write_text(transcript["fullText"].rstrip() + "\n", encoding="utf-8")
        write_json(transcript_json, {key: value for key, value in transcript.items() if key != "fullText"})
        hangul_count = len(re.findall(r"[가-힣]", transcript["fullText"]))

        speaker_timeline = fetch_ggc_speaker_timeline(candidate)
        speaker_timeline_path: Path | None = None
        speaker_timeline_url: str | None = None
        if speaker_timeline:
            speaker_timeline_url, timeline_items = speaker_timeline
            speaker_timeline_path = args.root / "02_transcripts" / "timeline" / f"{alias}.json"
            write_json(speaker_timeline_path, timeline_items)

        remote_probe = ffprobe_json(str(candidate["videoUrl"]))
        expected = candidate.get("expectedProbe", {})
        remote_duration = probe_duration(remote_probe)
        expected_duration = float(expected.get("durationSec") or remote_duration)
        probe_matches_manifest = abs(remote_duration - expected_duration) <= 1.0
        if args.probe_only:
            source_path = None
            source_probe = remote_probe
        else:
            source_path = args.root / "00_source" / f"{alias}.mp4"
            print(f"[{index}/{len(candidates)}] {alias}: download MP4", flush=True)
            curl_download(str(candidate["videoUrl"]), source_path, force=args.force)
            source_probe = ffprobe_json(str(source_path))

        legacy_audio_path = args.root / "01_audio" / f"{alias}.flac"
        legacy_audio_exists = legacy_audio_path.exists()

        video_stream = first_stream(source_probe, "video")
        audio_stream = first_stream(source_probe, "audio")
        duration = probe_duration(source_probe)
        unique_speaker_labels = list(transcript["speakerLabels"])
        checks = {
            "durationAtLeast600Sec": duration >= MIN_DURATION_SEC,
            "videoStreamPresent": video_stream is not None,
            "audioStreamPresent": audio_stream is not None,
            "officialTranscriptHangulAtLeast5000": hangul_count >= MIN_HANGUL_CHARS,
            "distinctSpeakerLabelsAtLeast4": len(unique_speaker_labels) >= MIN_SPEAKER_LABELS,
            "remoteProbeMatchesManifestWithin1Sec": probe_matches_manifest,
        }
        passed = all(checks.values())
        metadata = {
            "collectorVersion": COLLECTOR_VERSION,
            "collectedAt": utc_now(),
            "alias": alias,
            "institution": candidate["institution"],
            "committee": candidate["committee"],
            "meetingDate": candidate["meetingDate"],
            "meetingTitle": candidate["meetingTitle"],
            "sourcePageUrl": candidate["sourcePageUrl"],
            "sourceVideoUrl": candidate["videoUrl"],
            "officialTranscriptUrl": candidate["transcriptUrl"],
            "officialTranscriptKind": candidate["officialTranscriptKind"],
            "observedPortalNotice": candidate.get("observedPortalNotice"),
            "rightsGateApplied": False,
            "sourceOriginalStatus": "direct_mp4_from_official_council_host_not_claimed_as_camera_master",
            "source": {
                "path": str(source_path) if source_path else None,
                "sha256": sha256_file(source_path) if source_path else None,
                "bytes": source_path.stat().st_size if source_path else int(remote_probe.get("format", {}).get("size") or 0),
                "durationSec": round(duration, 6),
                "video": stream_summary(video_stream),
                "audio": stream_summary(audio_stream),
                "reencodedByCollector": False,
            },
            "audioDerivative": {
                "requiredForCollectionOrInput": False,
                "createdByThisRun": False,
                "status": (
                    "preexisting_legacy_derivative_preserved_not_counted"
                    if legacy_audio_exists
                    else "not_created_source_mp4_used_directly"
                ),
                "path": str(legacy_audio_path) if legacy_audio_exists else None,
                "bytes": legacy_audio_path.stat().st_size if legacy_audio_exists else None,
                "derivation": None,
            },
            "transcript": {
                "rawHtmlPath": str(transcript_raw),
                "rawHtmlSha256": sha256_file(transcript_raw),
                "textPath": str(transcript_text),
                "textSha256": sha256_file(transcript_text),
                "jsonPath": str(transcript_json),
                "jsonSha256": sha256_file(transcript_json),
                "parser": transcript["parser"],
                "alignmentStatus": transcript["alignmentStatus"],
                "hangulCharacterCount": hangul_count,
                "distinctSpeakerLabelCount": len(unique_speaker_labels),
                "speakerLabels": unique_speaker_labels,
            },
            "officialSpeakerTimeline": {
                "path": str(speaker_timeline_path) if speaker_timeline_path else None,
                "sha256": sha256_file(speaker_timeline_path) if speaker_timeline_path else None,
                "url": speaker_timeline_url,
                "eventCount": len(timeline_items) if speaker_timeline else None,
                "alignmentStatus": (
                    "official_coarse_event_start_positions_not_gold"
                    if speaker_timeline
                    else None
                ),
            },
            "qualityGate": {
                "checks": checks,
                "passedIntakeGate": passed,
                "tuningCandidate": passed,
                "trainingEligible": False,
                "reasonTrainingEligibleFalse": "official minutes still require audio-text alignment, silence/break trimming, and human listening QC",
            },
        }
        write_json(args.root / "03_meta" / f"{alias}.json", metadata)
        results.append(
            {
                "alias": alias,
                "institution": candidate["institution"],
                "committee": candidate["committee"],
                "durationSec": round(duration, 6),
                "sourceBytes": metadata["source"]["bytes"],
                "distinctSpeakerLabelCount": len(unique_speaker_labels),
                "observedSpeakerLabels": unique_speaker_labels,
                "hangulCharacterCount": hangul_count,
                "passedIntakeGate": passed,
                "probeOnly": args.probe_only,
            }
        )
        print(
            f"[{index}/{len(candidates)}] {alias}: gate={'PASS' if passed else 'FAIL'}, "
            f"duration={duration / 3600:.3f}h, speakers={len(unique_speaker_labels)}, hangul={hangul_count}",
            flush=True,
        )

    passed_results = [item for item in results if item["passedIntakeGate"]]
    observed_label_counts = Counter(
        label
        for item in passed_results
        for label in item.get("observedSpeakerLabels", [])
    )
    summary = {
        "collectorVersion": COLLECTOR_VERSION,
        "runId": run_id,
        "startedAt": started_at,
        "finishedAt": utc_now(),
        "manifest": str(args.manifest),
        "manifestSha256": sha256_file(args.manifest),
        "probeOnly": args.probe_only,
        "requestedCount": len(candidates),
        "passedIntakeCount": len(passed_results),
        "failedIntakeCount": len(results) - len(passed_results),
        "retainedSourceCount": 0 if args.probe_only else len([item for item in results if item["passedIntakeGate"]]),
        "passedDurationSec": round(sum(item["durationSec"] for item in passed_results), 6),
        "passedDurationHours": round(sum(item["durationSec"] for item in passed_results) / 3600, 9),
        "passedSourceBytes": sum(int(item["sourceBytes"] or 0) for item in passed_results),
        "institutionCount": len({item["institution"] for item in passed_results}),
        "committeeCount": len({item["committee"] for item in passed_results}),
        "observedSpeakerLabelCountSum": sum(observed_label_counts.values()),
        "uniqueExactSpeakerLabelStringCount": len(observed_label_counts),
        "repeatedExactSpeakerLabels": {
            label: count for label, count in sorted(observed_label_counts.items()) if count > 1
        },
        "speakerLabelCountsArePerMeetingNotCrossMeetingDeduplicated": True,
        "speakerIdentityDeduplicationStatus": "not_performed; exact label strings cannot prove voice identity",
        "trainingEligibleCount": 0,
        "trainingEligibilityNote": "Intake pass is not gold-label pass; alignment and human listening QC remain required.",
        "items": results,
    }
    write_json(args.root / "collection-summary.json", summary)
    write_json(args.root / "00_intake" / "runs" / f"{run_id}.json", {"runConfig": run_config, "summary": summary})
    print(
        f"completed: passed={len(passed_results)}/{len(results)}, "
        f"hours={summary['passedDurationHours']}, summary={args.root / 'collection-summary.json'}",
        flush=True,
    )


if __name__ == "__main__":
    main()
