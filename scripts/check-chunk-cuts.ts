/**
 * 청크 경계가 발화 중간이 아니라 무음에 떨어지는지 확인.
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-chunk-cuts.ts [audioPath]
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const AUDIO =
  process.argv[2] ||
  join(process.cwd(), ".data/stt-bench/assembly-envlabor-20250425.mp3");
const WORK = join(process.cwd(), ".data/tmp-chunk-cut-check");
const CHUNK_SEC = 300;
const NOISE_DB = -32;
const MIN_SILENCE_SEC = 0.35;
const SEARCH_SEC = 25;

type Span = { startSec: number; endSec: number };

function silences(path: string): Span[] {
  const res = spawnSync(
    "ffmpeg",
    [
      "-v",
      "info",
      "-i",
      path,
      "-af",
      `silencedetect=noise=${NOISE_DB}dB:d=${MIN_SILENCE_SEC}`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const log = res.stderr || "";
  const out: Span[] = [];
  let pending: number | null = null;
  for (const line of log.split("\n")) {
    const s = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (s) {
      pending = Number(s[1]);
      continue;
    }
    const e = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (e && pending != null) {
      out.push({ startSec: pending, endSec: Number(e[1]) });
      pending = null;
    }
  }
  return out;
}

function clock(sec: number) {
  const s = Math.floor(sec);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function segmentStarts(path: string, times: string[] | null): number[] {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  const listPath = join(WORK, "segments.csv");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      path,
      "-f",
      "segment",
      ...(times ? ["-segment_times", times.join(",")] : ["-segment_time", String(CHUNK_SEC)]),
      "-segment_list",
      listPath,
      "-segment_list_type",
      "csv",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      "-reset_timestamps",
      "1",
      join(WORK, "part_%03d.mp3"),
    ],
    { stdio: "pipe" },
  );
  const starts: number[] = [];
  for (const line of readFileSync(listPath, "utf8").split("\n")) {
    const [, start] = line.trim().split(",");
    if (start !== undefined && Number.isFinite(Number(start))) {
      starts.push(Number(start));
    }
  }
  return starts.slice(1);
}

function inSilence(sec: number, spans: Span[]): Span | null {
  return spans.find((s) => sec >= s.startSec && sec <= s.endSec) ?? null;
}

function main() {
  const spans = silences(AUDIO);
  const total = Number(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=nw=1:nk=1",
        AUDIO,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  console.log(
    `${AUDIO.split("/").pop()} ${clock(total)}, 무음 ${spans.length}곳`,
  );

  const fixed = segmentStarts(AUDIO, null);
  console.log("\n[고정 300초 분할]");
  for (const s of fixed) {
    const hit = inSilence(s, spans);
    console.log(
      `  ${clock(s)} (${s.toFixed(1)}s) ${hit ? "무음 안" : "발화 중간 절단"}`,
    );
  }

  const cuts: number[] = [];
  let prev = 0;
  while (prev + CHUNK_SEC < total - 1) {
    const target = prev + CHUNK_SEC;
    let best = target;
    let bestGap = Infinity;
    for (const s of spans) {
      const mid = (s.startSec + s.endSec) / 2;
      if (mid <= prev + 1) continue;
      const gap = Math.abs(mid - target);
      if (gap < bestGap && gap <= SEARCH_SEC) {
        bestGap = gap;
        best = mid;
      }
    }
    cuts.push(Number(best.toFixed(3)));
    prev = best;
  }
  const silent = segmentStarts(
    AUDIO,
    cuts.map((c) => String(c)),
  );
  console.log("\n[무음 기준 분할]");
  for (const s of silent) {
    const hit = inSilence(s, spans);
    console.log(
      `  ${clock(s)} (${s.toFixed(1)}s) ${hit ? `무음 안 (${hit.startSec.toFixed(1)}~${hit.endSec.toFixed(1)})` : "발화 중간 절단"}`,
    );
  }

  rmSync(WORK, { recursive: true, force: true });
}

main();
