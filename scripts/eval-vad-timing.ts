/**
 * whisper-1 타이밍 패스를 로컬 VAD로 대체할 수 있는지 측정.
 *
 * 정답: whisper-1 verbose 세그먼트 시작 시각
 * 후보 A: 로컬 무음 감지로 만든 발화 구간에 글자 수 비례 배분
 * 후보 B: 전체 길이에 글자 수 비례 배분 (VAD 없이)
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-vad-timing.ts
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type Seg = { startSec: number; endSec: number; text: string };
type Span = { startSec: number; endSec: number };

const CASES = [
  ["assembly", "assembly-envlabor-20250425.mp3", "assembly__timed-segments.json"],
  ["ktv", "ktv-briefing-20251231.mp3", "ktv__timed-segments.json"],
] as const;

const BENCH = join(process.cwd(), ".data/stt-bench");

function normChars(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function duration(path: string): number {
  return Number(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        path,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
}

function silences(path: string, db: number, minSec: number): Span[] {
  const res = spawnSync(
    "ffmpeg",
    [
      "-v",
      "info",
      "-i",
      path,
      "-af",
      `silencedetect=noise=${db}dB:d=${minSec}`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const out: Span[] = [];
  let pending: number | null = null;
  for (const line of (res.stderr || "").split("\n")) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) {
      pending = Number(s[1]);
      continue;
    }
    const e = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (e && pending != null) {
      out.push({ startSec: Math.max(0, pending), endSec: Number(e[1]) });
      pending = null;
    }
  }
  return out;
}

/** 무음의 여집합 = 발화 구간. */
function speechSpans(totalSec: number, sil: Span[]): Span[] {
  const out: Span[] = [];
  let cur = 0;
  for (const s of sil.sort((a, b) => a.startSec - b.startSec)) {
    if (s.startSec > cur) out.push({ startSec: cur, endSec: s.startSec });
    cur = Math.max(cur, s.endSec);
  }
  if (cur < totalSec) out.push({ startSec: cur, endSec: totalSec });
  return out.filter((s) => s.endSec - s.startSec > 0.2);
}

/** 글자 위치 → 시각. 발화 구간 길이에 비례해 글자를 배분한다. */
function timeAtChar(spans: Span[], totalChars: number): (c: number) => number {
  const speechTotal = spans.reduce((s, x) => s + (x.endSec - x.startSec), 0);
  const cumChars: number[] = [];
  let acc = 0;
  for (const s of spans) {
    cumChars.push(acc);
    acc += (totalChars * (s.endSec - s.startSec)) / (speechTotal || 1);
  }
  return (c: number) => {
    let lo = 0;
    let hi = spans.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (cumChars[mid]! <= c) lo = mid;
      else hi = mid - 1;
    }
    const span = spans[lo]!;
    const spanChars =
      (totalChars * (span.endSec - span.startSec)) / (speechTotal || 1);
    const within = spanChars > 0 ? (c - cumChars[lo]!) / spanChars : 0;
    return (
      span.startSec + Math.max(0, Math.min(1, within)) * (span.endSec - span.startSec)
    );
  };
}

function stats(errors: number[]) {
  const sorted = [...errors].sort((a, b) => a - b);
  const mean = errors.reduce((s, e) => s + e, 0) / (errors.length || 1);
  const p = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const within = (t: number) =>
    (errors.filter((e) => e <= t).length / (errors.length || 1)) * 100;
  return `평균 ${mean.toFixed(2)}s / p50 ${p(0.5).toFixed(2)}s / p90 ${p(0.9).toFixed(2)}s / 최대 ${(sorted.at(-1) ?? 0).toFixed(1)}s / ±2s ${within(2).toFixed(0)}% / ±5s ${within(5).toFixed(0)}%`;
}

function main() {
  for (const [name, audio, timedFile] of CASES) {
    const audioPath = join(BENCH, audio);
    const segs = (
      JSON.parse(readFileSync(join(BENCH, timedFile), "utf8")) as {
        segments?: Seg[];
      }
    ).segments!.filter((s) => s.text?.trim());
    const total = duration(audioPath);

    const cum: number[] = [];
    let acc = 0;
    for (const s of segs) {
      cum.push(acc);
      acc += Math.max(1, normChars(s.text).length);
    }
    const totalChars = acc;

    console.log(`\n[${name}] ${segs.length}구간, ${(total / 60).toFixed(1)}분, ${totalChars}자`);

    const flat = timeAtChar([{ startSec: 0, endSec: total }], totalChars);
    console.log(
      `  VAD 없음: ${stats(segs.map((s, i) => Math.abs(flat(cum[i]!) - s.startSec)))}`,
    );

    for (const [db, minSec] of [
      [-30, 0.4],
      [-32, 0.4],
      [-35, 0.3],
    ] as const) {
      const spans = speechSpans(total, silences(audioPath, db, minSec));
      const f = timeAtChar(spans, totalChars);
      const speechSec = spans.reduce((s, x) => s + (x.endSec - x.startSec), 0);
      console.log(
        `  VAD ${db}dB/${minSec}s (발화구간 ${spans.length}개, ${((speechSec / total) * 100).toFixed(0)}%): ${stats(
          segs.map((s, i) => Math.abs(f(cum[i]!) - s.startSec)),
        )}`,
      );
    }
  }
}

main();
