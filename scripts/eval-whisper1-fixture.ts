/**
 * 고정 180초 구간에서 whisper-1 단독 성능 확인.
 * 업로드 경로는 지금 mini(글자) + whisper-1(시각) 두 번을 부른다.
 * whisper-1 하나로 줄이면 분당 비용이 3분의 1 줄어든다. 그 대가가 얼마인지 본다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-whisper1-fixture.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { config } from "dotenv";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const FIXTURE_DIR = join(process.cwd(), ".data/stt-bench/fixtures");
const CLIP = join(FIXTURE_DIR, "assembly3-dense-180.wav");
const REFERENCE = join(FIXTURE_DIR, "assembly3-dense-180.reference.txt");
const OUT = join(
  process.cwd(),
  ".data/stt-bench/multi-speaker-run-20260727/upload__whisper-1.txt",
);

function compact(s: string) {
  return s.replace(/\s+/g, "").replace(/[^\w가-힣]/g, "");
}

function cer(ref: string, hyp: string) {
  const R = compact(ref);
  const H = compact(hyp);
  let prev = Array.from({ length: H.length + 1 }, (_, i) => i);
  for (let i = 1; i <= R.length; i++) {
    const cur = [i];
    for (let j = 1; j <= H.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + (R[i - 1] === H[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return { cer: prev[H.length]! / R.length, refChars: R.length, hypChars: H.length };
}

async function main() {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const bytes = readFileSync(CLIP);

  const started = Date.now();
  const res = await client.audio.transcriptions.create({
    file: await toFile(bytes, "clip.wav"),
    model: "whisper-1",
    language: "ko",
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
  const wallMs = Date.now() - started;

  const text = res.text ?? "";
  writeFileSync(OUT, text, "utf8");

  const ref = readFileSync(REFERENCE, "utf8");
  const score = cer(ref, text);
  const segments = (res as unknown as { segments?: unknown[] }).segments ?? [];

  console.log(
    JSON.stringify(
      {
        model: "whisper-1",
        wallSec: Number((wallMs / 1000).toFixed(1)),
        chars: text.length,
        segments: segments.length,
        cer: Number(score.cer.toFixed(3)),
        길이비: Number((score.hypChars / score.refChars).toFixed(3)),
        분당USD: 0.006,
      },
      null,
      2,
    ),
  );
  console.log("\n앞부분:", text.slice(0, 200));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
