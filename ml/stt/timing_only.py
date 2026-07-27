"""로컬 faster-whisper로 구간 시각만 뽑는다.

업로드 경로는 글자는 gpt-4o-mini-transcribe, 시각은 whisper-1 로 두 번 부른다.
시각 호출이 업로드 원가의 3분의 2다. 시각만 로컬에서 뽑을 수 있으면 그만큼 줄어든다.

python ml/stt/timing_only.py --audio <file> --model small --out out.json
"""

import argparse
import json
import time

from faster_whisper import WhisperModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--model", default="small")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--language", default="ko")
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    load_started = time.time()
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)
    load_sec = time.time() - load_started

    started = time.time()
    segments, info = model.transcribe(
        args.audio,
        language=args.language,
        vad_filter=True,
        condition_on_previous_text=False,
        beam_size=1,
    )
    rows = [
        {"start": s.start, "end": s.end, "text": s.text.strip()} for s in segments
    ]
    wall_sec = time.time() - started

    payload = {
        "model": args.model,
        "computeType": args.compute_type,
        "device": args.device,
        "durationSec": info.duration,
        "loadSec": round(load_sec, 2),
        "wallSec": round(wall_sec, 2),
        "realtimeFactor": round(info.duration / wall_sec, 2) if wall_sec else None,
        "segments": rows,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(
        json.dumps(
            {k: v for k, v in payload.items() if k != "segments"}
            | {"segmentCount": len(rows)},
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
