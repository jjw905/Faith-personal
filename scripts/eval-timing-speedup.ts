/**
 * 시각 패스 절감 실험.
 *
 * 업로드 경로는 글자는 mini, 시각은 whisper-1 로 두 번 부른다.
 * whisper-1 은 오디오 길이로 과금하므로, 2배속 오디오를 보내면 분값이 반이다.
 * 되돌린 시각이 원속도와 얼마나 어긋나는지 재서 쓸 수 있는지 판단한다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-timing-speedup.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { config } from "dotenv";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const CLIP = join(
  process.cwd(),
  ".data/stt-bench/fixtures/assembly3-dense-180.wav",
);

type Seg = { start: number; end: number; text: string };

async function transcribe(client: OpenAI, path: string, name: string) {
  const res = await client.audio.transcriptions.create({
    file: await toFile(readFileSync(path), name),
    model: "whisper-1",
    language: "ko",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
  const segments =
    ((res as unknown as { segments?: Seg[] }).segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      text: s.text.trim(),
    }));
  return segments;
}

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

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const tempo = Number(process.env.TEMPO || "2.0");
  const fast = join(tmpdir(), `fixture-${tempo}x.wav`);
  execFileSync("ffmpeg", [
    "-y", "-i", CLIP, "-filter:a", `atempo=${tempo}`, "-ac", "1", "-ar", "16000",
    fast,
  ], { stdio: "ignore" });

  const [base, sped] = await Promise.all([
    transcribe(client, CLIP, "base.wav"),
    transcribe(client, fast, "fast.wav"),
  ]);

  const scaled = sped.map((s) => ({
    start: s.start * tempo,
    end: s.end * tempo,
    text: s.text,
  }));

  console.log(
    `배속 ${tempo}x — 원속도 ${base.length}구간, 배속 ${scaled.length}구간(되돌림)`,
  );

  // 글자가 가장 비슷한 구간끼리 짝지어 시작 시각 차이를 잰다.
  const errors: number[] = [];
  for (const b of base) {
    let best: { seg: (typeof scaled)[number]; score: number } | null = null;
    for (const s of scaled) {
      const score = sim(b.text, s.text);
      if (!best || score > best.score) best = { seg: s, score };
    }
    if (!best || best.score < 0.45) continue;
    errors.push(Math.abs(best.seg.start - b.start));
  }

  errors.sort((a, b) => a - b);
  const mean = errors.reduce((a, b) => a + b, 0) / Math.max(1, errors.length);
  const within = (t: number) =>
    (errors.filter((e) => e <= t).length / Math.max(1, errors.length)) * 100;

  console.log(
    JSON.stringify(
      {
        짝지은구간: errors.length,
        평균오차초: Number(mean.toFixed(2)),
        중앙값초: Number((errors[Math.floor(errors.length / 2)] ?? 0).toFixed(2)),
        "±1초": `${within(1).toFixed(0)}%`,
        "±3초": `${within(3).toFixed(0)}%`,
        최대오차초: Number((errors[errors.length - 1] ?? 0).toFixed(2)),
        원속도끝: base[base.length - 1]?.end,
        되돌린끝: scaled[scaled.length - 1]?.end,
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
