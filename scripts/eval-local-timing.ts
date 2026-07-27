/**
 * 시각 패스를 로컬 모델로 대체할 수 있는지 실측.
 *
 * 기준: whisper-1 verbose_json 구간 시각 (지금 쓰는 값)
 * 후보: 로컬 faster-whisper 구간 시각 (ml/stt/timing_only.py 결과)
 *
 * 글자가 비슷한 구간끼리 짝지어 시작 시각 차이를 잰다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-local-timing.ts /tmp/timing-small.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const CLIP = join(
  process.cwd(),
  ".data/stt-bench/fixtures/assembly3-dense-180.wav",
);
const BASE_CACHE = join(
  process.cwd(),
  ".data/stt-bench/fixtures/assembly3-dense-180.whisper1-segments.json",
);

type Seg = { start: number; end: number; text: string };

function compact(s: string) {
  return s.replace(/\s+/g, "").replace(/[^\w가-힣]/g, "");
}

function bigrams(s: string) {
  const c = compact(s);
  const out = new Set<string>();
  for (let i = 0; i < c.length - 1; i++) out.add(c.slice(i, i + 2));
  return out;
}

function sim(a: string, b: string) {
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return (2 * inter) / (A.size + B.size);
}

async function whisper1Segments(): Promise<Seg[]> {
  if (existsSync(BASE_CACHE)) {
    return JSON.parse(readFileSync(BASE_CACHE, "utf8")) as Seg[];
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const res = await client.audio.transcriptions.create({
    file: await toFile(readFileSync(CLIP), "clip.wav"),
    model: "whisper-1",
    language: "ko",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
  const segs = ((res as unknown as { segments?: Seg[] }).segments ?? []).map(
    (s) => ({ start: s.start, end: s.end, text: s.text.trim() }),
  );
  writeFileSync(BASE_CACHE, JSON.stringify(segs, null, 2));
  return segs;
}

async function main() {
  const candidatePath = process.argv[2];
  if (!candidatePath || !existsSync(candidatePath)) {
    console.error("비교할 로컬 시각 JSON 경로를 넘겨주세요.");
    process.exit(1);
  }

  const base = await whisper1Segments();
  const local = JSON.parse(readFileSync(candidatePath, "utf8")) as {
    model: string;
    realtimeFactor: number | null;
    segments: Seg[];
  };

  const errors: number[] = [];
  let unmatched = 0;
  for (const b of base) {
    let best: { seg: Seg; score: number } | null = null;
    for (const s of local.segments) {
      const score = sim(b.text, s.text);
      if (!best || score > best.score) best = { seg: s, score };
    }
    if (!best || best.score < 0.45) {
      unmatched += 1;
      continue;
    }
    errors.push(Math.abs(best.seg.start - b.start));
  }

  errors.sort((a, b) => a - b);
  const mean = errors.reduce((a, b) => a + b, 0) / Math.max(1, errors.length);
  const within = (t: number) =>
    (errors.filter((e) => e <= t).length / Math.max(1, errors.length)) * 100;

  console.log(
    JSON.stringify(
      {
        로컬모델: local.model,
        실시간배속: local.realtimeFactor,
        "whisper-1구간": base.length,
        로컬구간: local.segments.length,
        짝지음: errors.length,
        못짝지음: unmatched,
        평균오차초: Number(mean.toFixed(2)),
        중앙값초: Number((errors[Math.floor(errors.length / 2)] ?? 0).toFixed(2)),
        "±1초": `${within(1).toFixed(0)}%`,
        "±2초": `${within(2).toFixed(0)}%`,
        "±3초": `${within(3).toFixed(0)}%`,
        최대오차초: Number((errors[errors.length - 1] ?? 0).toFixed(2)),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
