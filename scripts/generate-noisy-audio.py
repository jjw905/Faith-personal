#!/usr/bin/env python3
"""macOS say + afconvert로 한국어 음성을 만들고, 외부환경 소음 ~30%를 섞은 WAV를 생성합니다."""

from __future__ import annotations

import array
import math
import random
import subprocess
import tempfile
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "samples" / "audio"

# 소음 비중 (0.3 = 외부환경 소음 30%, 음성 70%)
NOISE_RATIO = 0.30
SAMPLE_RATE = 22050

SAMPLES: list[tuple[str, str, str]] = [
    (
        "meeting-intro-noise30",
        "Eddy (한국어(한국))",
        "안녕하세요. 오늘 주간 회의를 시작하겠습니다. 안건은 개인정보 마스킹 고도화와 배포 일정입니다.",
    ),
    (
        "meeting-pii-noise30",
        "Flo (한국어(한국))",
        "담당자 연락처는 공일공 일이삼사 오육칠팔이고, 이메일은 faith.demo at company.com 입니다.",
    ),
    (
        "meeting-summary-noise30",
        "Reed (한국어(한국))",
        "결정사항은 다음과 같습니다. 마스킹 규칙을 강화하고, 다음 주 월요일까지 통합 테스트를 완료합니다.",
    ),
    (
        "meeting-cafe-noise30",
        "Sandy (한국어(한국))",
        "외부 미팅이라 주변이 좀 시끄럽습니다. 주민등록번호는 언급하지 마시고, 필요한 정보는 회의록에서 확인해주세요.",
    ),
    (
        "meeting-action-noise30",
        "Shelley (한국어(한국))",
        "후속 조치로 김대리는 업로드 화면을 점검하고, 박과장은 보안 알림 문구를 수정해 주세요.",
    ),
]


def say_to_wav(text: str, voice: str, wav_path: Path) -> None:
    with tempfile.TemporaryDirectory() as tmp:
        aiff = Path(tmp) / "speech.aiff"
        subprocess.run(
            ["say", "-v", voice, "-r", "175", "-o", str(aiff), text],
            check=True,
        )
        subprocess.run(
            [
                "afconvert",
                str(aiff),
                str(wav_path),
                "-f",
                "WAVE",
                "-d",
                "LEI16",
                "-r",
                str(SAMPLE_RATE),
                "-c",
                "1",
            ],
            check=True,
        )


def read_mono_pcm16(path: Path) -> tuple[int, array.array]:
    with wave.open(str(path), "rb") as w:
        assert w.getsampwidth() == 2
        rate = w.getframerate()
        nchan = w.getnchannels()
        raw = w.readframes(w.getnframes())
    samples = array.array("h")
    samples.frombytes(raw)
    if nchan > 1:
        mono = array.array("h")
        for i in range(0, len(samples), nchan):
            mono.append(samples[i])
        samples = mono
    return rate, samples


def write_mono_pcm16(path: Path, rate: int, samples: array.array) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(samples.tobytes())


def rms(samples: array.array) -> float:
    if not samples:
        return 0.0
    acc = 0.0
    for s in samples:
        acc += float(s) * float(s)
    return math.sqrt(acc / len(samples))


def ambient_noise(n: int, seed: int) -> array.array:
    """카페/거리 느낌의 저역 럼블 + 광대역 소음."""
    rng = random.Random(seed)
    out = array.array("h")
    phase1 = rng.random() * math.tau
    phase2 = rng.random() * math.tau
    phase3 = rng.random() * math.tau
    for i in range(n):
        t = i / SAMPLE_RATE
        rumble = (
            0.55 * math.sin(2 * math.pi * 55 * t + phase1)
            + 0.35 * math.sin(2 * math.pi * 110 * t + phase2)
            + 0.20 * math.sin(2 * math.pi * 220 * t + phase3)
        )
        hiss = rng.uniform(-1.0, 1.0)
        # 간헐적 충격음(문/식기 느낌)
        knock = 0.0
        if rng.random() < 0.0008:
            knock = rng.uniform(-1.0, 1.0)
        mixed = 0.65 * rumble + 0.30 * hiss + 0.15 * knock
        out.append(int(max(-32767, min(32767, mixed * 12000))))
    return out


def mix_with_noise(
    speech: array.array,
    noise_ratio: float,
    seed: int,
) -> array.array:
    noise = ambient_noise(len(speech), seed)
    speech_rms = rms(speech) or 1.0
    noise_rms = rms(noise) or 1.0

    # 목표: 출력 ≈ (1-r)*speech + r*noise  (에너지 비중 noise_ratio)
    speech_gain = 1.0 - noise_ratio
    noise_gain = noise_ratio * (speech_rms / noise_rms)

    out = array.array("h")
    peak = 1.0
    floats: list[float] = []
    for s, n in zip(speech, noise):
        v = speech_gain * float(s) + noise_gain * float(n)
        floats.append(v)
        peak = max(peak, abs(v))

    # 클리핑 여유
    scale = 0.92 * 32767.0 / peak if peak > 32767 else 1.0
    for v in floats:
        out.append(int(max(-32767, min(32767, v * scale))))
    return out


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest: list[str] = []

    for i, (name, voice, text) in enumerate(SAMPLES):
        clean = OUT_DIR / f"{name}-clean.wav"
        noisy = OUT_DIR / f"{name}.wav"
        print(f"[{i + 1}/{len(SAMPLES)}] {name} ({voice})")
        say_to_wav(text, voice, clean)
        rate, speech = read_mono_pcm16(clean)
        if rate != SAMPLE_RATE:
            # afconvert가 요청 rate를 지키지 않은 경우에도 그대로 사용
            pass
        mixed = mix_with_noise(speech, NOISE_RATIO, seed=1000 + i)
        write_mono_pcm16(noisy, rate, mixed)
        clean.unlink(missing_ok=True)
        dur = len(mixed) / rate
        manifest.append(
            f"- `{noisy.name}` · voice={voice} · noise={int(NOISE_RATIO * 100)}% · {dur:.1f}s"
        )
        print(f"  -> {noisy} ({dur:.1f}s)")

    readme = OUT_DIR / "README.md"
    readme.write_text(
        "\n".join(
            [
                "# Faith 음성 샘플 (외부환경 소음 30%)",
                "",
                "macOS `say`로 생성한 한국어 회의에 저역 럼블·히스·간헐 충격을 섞었습니다.",
                f"소음 비중 목표: **{int(NOISE_RATIO * 100)}%** (음성 {(100 - int(NOISE_RATIO * 100))}%).",
                "",
                *manifest,
                "",
                "재생성:",
                "",
                "```bash",
                "python3 scripts/generate-noisy-audio.py",
                "```",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print(f"\nDone. Wrote {len(SAMPLES)} files to {OUT_DIR}")


if __name__ == "__main__":
    main()
