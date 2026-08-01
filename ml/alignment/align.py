#!/usr/bin/env python3
"""Align an existing Korean transcript to audio without changing its text."""

from __future__ import annotations

import argparse
import gc
import json
from difflib import SequenceMatcher
from pathlib import Path

import whisperx

# wav2vec2 정렬 비용은 창 길이에 비례하지 않고 더 가파르게 는다. 전사 청크
# 그대로인 5분 창으로 KTV 11분 44초를 맞추면 244초가 걸리는데, 같은 오디오를
# 문장 단위 창으로 자르면 97초로 준다. 창을 30초 안팎으로 유지한다.
TARGET_WINDOW_SEC = 12.0
# 창 하나가 쓰는 메모리는 창 길이에 거의 비례한다(실측: 10초 2.2GB, 30초 3.4GB,
# 60초 4.7GB). 문장 경계를 기다리다 보면 창이 50초를 넘기도 해서 상한을 둔다.
MAX_WINDOW_SEC = 20.0
# 창 경계 시각은 전사 세그먼트에서 옮겨온 추정치다. 앞뒤를 열어 경계에 걸친
# 어절이 잘리지 않게 한다.
WINDOW_PAD_SEC = 2.0
SENTENCE_END = ".?!。"
# 한 번에 정렬할 창 수. 전부 한 번에 넘기면 방출 행렬이 창 수만큼 쌓여
# KTV 11분 44초에서 최대 상주 메모리가 6.3GB까지 올라갔다. 배치로 끊으면
# 메모리가 배치 크기에 묶이고, 속도는 거의 그대로다.
BATCH_WINDOWS = 8


def _strip_spaces(text: str) -> tuple[str, list[int]]:
    """공백을 뺀 문자열과, 각 문자가 원문 어디였는지의 색인."""
    chars: list[str] = []
    offsets: list[int] = []
    for index, char in enumerate(text):
        if char.isspace():
            continue
        chars.append(char)
        offsets.append(index)
    return "".join(chars), offsets


def _segment_char_times(
    segments: list[dict],
) -> tuple[str, list[float]]:
    """전사 세그먼트를 이어 붙이고 글자마다 시각을 매긴다."""
    chars: list[str] = []
    times: list[float] = []
    for segment in segments:
        text, _ = _strip_spaces(str(segment.get("text", "")))
        if not text:
            continue
        start = float(segment["startSec"])
        end = max(start, float(segment["endSec"]))
        span = end - start
        for index, char in enumerate(text):
            chars.append(char)
            times.append(start + span * (index / len(text)))
    return "".join(chars), times


def _corrected_char_times(
    corrected: str,
    raw: str,
    raw_times: list[float],
) -> list[float] | None:
    """
    보정 전사문의 글자마다 시각을 매긴다.

    보정문은 전사 세그먼트를 다듬은 것이라 대부분 그대로 겹친다. 겹치는
    구간은 세그먼트 시각을 그대로 옮기고, 고쳐 쓴 구간만 앞뒤 사이를
    비례로 메운다.
    """
    if not corrected or not raw:
        return None
    times: list[float | None] = [None] * len(corrected)
    matcher = SequenceMatcher(None, corrected, raw, autojunk=False)
    matched = 0
    for start_left, start_right, size in matcher.get_matching_blocks():
        for offset in range(size):
            times[start_left + offset] = raw_times[start_right + offset]
        matched += size
    # 절반도 못 맞추면 보정문이 세그먼트와 다른 내용이다. 매핑을 쓰지 않는다.
    if matched < len(corrected) * 0.5:
        return None

    known = [index for index, value in enumerate(times) if value is not None]
    if not known:
        return None
    for index in range(known[0]):
        times[index] = times[known[0]]
    for index in range(known[-1] + 1, len(times)):
        times[index] = times[known[-1]]
    for left, right in zip(known, known[1:]):
        if right - left <= 1:
            continue
        span = times[right] - times[left]
        for step in range(1, right - left):
            times[left + step] = times[left] + span * (step / (right - left))
    # 세그먼트 경계에서 시각이 뒤로 밀릴 수 있다. 단조 증가로 만든다.
    for index in range(1, len(times)):
        if times[index] < times[index - 1]:
            times[index] = times[index - 1]
    return [float(value) for value in times]


def split_part_into_windows(
    part: str,
    part_start: float,
    part_end: float,
    segments: list[dict],
) -> list[dict] | None:
    """보정 전사문 한 덩어리를 30초 안팎의 정렬 창으로 자른다."""
    inside = [
        segment
        for segment in segments
        if float(segment.get("endSec", 0)) > part_start
        and float(segment.get("startSec", 0)) < part_end
        and str(segment.get("text", "")).strip()
    ]
    if len(inside) < 2:
        return None

    raw, raw_times = _segment_char_times(inside)
    stripped, offsets = _strip_spaces(part)
    char_times = _corrected_char_times(stripped, raw, raw_times)
    if not char_times:
        return None

    windows: list[dict] = []
    window_start_char = 0
    cut_after = -1
    for index, offset in enumerate(offsets):
        is_sentence_end = part[offset] in SENTENCE_END
        long_enough = char_times[index] - char_times[window_start_char] >= (
            TARGET_WINDOW_SEC
        )
        last = index == len(offsets) - 1
        if not ((is_sentence_end and long_enough) or last):
            continue
        text = part[offsets[window_start_char] : offset + 1].strip()
        if text:
            windows.append(
                {
                    "start": max(
                        part_start, char_times[window_start_char] - WINDOW_PAD_SEC
                    ),
                    "end": min(part_end, char_times[index] + WINDOW_PAD_SEC),
                    "text": text,
                }
            )
        window_start_char = index + 1
        cut_after = offset

    tail = part[cut_after + 1 :].strip()
    if tail and windows:
        windows[-1]["text"] = f"{windows[-1]['text']} {tail}".strip()
        windows[-1]["end"] = part_end
    return windows if len(windows) > 1 else None


def split_part_by_time(part: str, part_start: float, part_end: float) -> list[dict]:
    """세그먼트 시각이 없을 때 쓰는 대비책. 시간을 균등하게 잘라 창을 만든다.

    문장 경계를 못 찾으면 예전에는 덩어리 하나를 통째로 정렬했다. 11분 44초를
    한 창으로 맞추면 최대 상주 메모리가 11.5GB까지 올라가 Worker가 죽는다.
    글자 수 비율로 나눈 창은 경계가 조금 어긋나도, 메모리를 창 길이에 묶어 둔다.
    """
    span = part_end - part_start
    if span <= TARGET_WINDOW_SEC * 1.5 or not part:
        return [{"start": part_start, "end": part_end, "text": part}]

    count = max(2, round(span / TARGET_WINDOW_SEC))
    per = len(part) / count
    windows: list[dict] = []
    for index in range(count):
        head = int(round(index * per))
        tail = len(part) if index == count - 1 else int(round((index + 1) * per))
        text = part[head:tail].strip()
        if not text:
            continue
        windows.append(
            {
                "start": max(part_start, part_start + span * (head / len(part)) - WINDOW_PAD_SEC),
                "end": min(part_end, part_start + span * (tail / len(part)) + WINDOW_PAD_SEC),
                "text": text,
            }
        )
    return windows or [{"start": part_start, "end": part_end, "text": part}]


def cap_window_length(windows: list[dict]) -> list[dict]:
    """상한을 넘는 창은 시간으로 다시 쪼갠다. 최대 메모리를 창 길이에 묶는다."""
    out: list[dict] = []
    for window in windows:
        span = float(window["end"]) - float(window["start"])
        if span <= MAX_WINDOW_SEC:
            out.append(window)
            continue
        out.extend(
            split_part_by_time(
                str(window["text"]), float(window["start"]), float(window["end"])
            )
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("transcript_json")
    parser.add_argument("output_json")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--model-dir", default=".data/models/alignment")
    args = parser.parse_args()

    source = json.loads(Path(args.transcript_json).read_text(encoding="utf-8"))
    text = str(source["text"])
    duration = float(source["durationSec"])
    parts = [part.strip() for part in text.splitlines() if part.strip()]
    if not parts:
        raise RuntimeError("정렬할 전사문이 없습니다.")

    supplied_ranges = source.get("partRanges")
    timed = source.get("timedSegments")
    timed = timed if isinstance(timed, list) else []
    segments = []
    for index, part in enumerate(parts):
        if isinstance(supplied_ranges, list) and index < len(supplied_ranges):
            item = supplied_ranges[index]
            start = max(0.0, float(item["startSec"]) - 3.0)
            end = min(duration, float(item["endSec"]) + 3.0)
        else:
            # 이전 벤치 캐시는 범위를 저장하지 않았다. 5분 경계 주변을 넓게
            # 열어 무음 기준으로 이동한 실제 청크도 포함한다.
            start = max(0.0, index * 300.0 - 30.0)
            end = min(duration, (index + 1) * 300.0 + 30.0)
        windows = split_part_into_windows(part, start, end, timed)
        segments.extend(
            cap_window_length(windows or split_part_by_time(part, start, end))
        )

    Path(args.model_dir).mkdir(parents=True, exist_ok=True)
    model, metadata = whisperx.load_align_model(
        language_code="ko",
        device=args.device,
        model_dir=args.model_dir,
    )
    # 오디오는 한 번만 읽는다. 배치마다 경로를 넘기면 whisperx가 그때마다
    # 다시 디코딩해 같은 파형을 여러 벌 들고 있게 된다.
    audio = whisperx.load_audio(args.audio)

    aligned_words: list[dict] = []
    for offset in range(0, len(segments), BATCH_WINDOWS):
        batch = segments[offset : offset + BATCH_WINDOWS]
        aligned = whisperx.align(
            batch,
            model,
            metadata,
            audio,
            args.device,
            return_char_alignments=False,
            print_progress=False,
        )
        aligned_words.extend(aligned["word_segments"])
        # 배치가 쓴 방출 행렬을 바로 놓아준다. 한 번에 다 맞추면 이 행렬이
        # 창 수만큼 쌓여 최대 메모리가 창 하나짜리의 몇 배가 된다.
        del aligned
        gc.collect()
        print(
            f"Progress: {min(offset + BATCH_WINDOWS, len(segments)) / len(segments) * 100:.2f}%...",
            flush=True,
        )

    words = [
        {
            "text": str(word.get("word", "")).strip(),
            "startSec": float(word["start"]),
            "endSec": float(word["end"]),
            "score": float(word.get("score", 0.0)),
        }
        for word in aligned_words
        if str(word.get("word", "")).strip()
        and word.get("start") is not None
        and word.get("end") is not None
    ]
    Path(args.output_json).write_text(
        json.dumps(
            {
                "model": "whisperx:kresnik/wav2vec2-large-xlsr-korean",
                "durationSec": duration,
                "words": words,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(json.dumps({"words": len(words)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
