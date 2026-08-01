/**
 * 언론사 이름을 미리 알려 주면 제대로 받는지 잰다.
 *
 * KTV 브리핑에서 모든 모델이 "뉴시스"를 "유시스"로 받았다. 초성 ㄴ이 앞말에
 * 먹혀 소리만으로는 가릴 수 없는 자리다. 참석자 사전에는 없는 이름이라
 * 회의별 사전으로는 못 잡는다.
 *
 * 같은 오디오를 사전 없이/있이 돌려 적중과 환각을 함께 본다. 사전에 넣은 말이
 * 하지도 않은 자리에 끼어들면 적중이 올라도 글은 나빠진다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-media-glossary.ts <clip.mp3>
 */
import { config } from "dotenv";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

config({ path: ".env.local" });
config();

import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";
import { MEDIA_OUTLET_TERMS } from "../src/lib/stt/media-outlets";

const CLIP = process.argv[2] ?? "/tmp/ktv-newsis.mp3";
const MODEL = process.env.STT_MODEL ?? "gpt-4o-mini-transcribe";

/** 이 구간에서 실제로 나오는 말. */
const SPOKEN = ["뉴시스"];
/** 사전에 있지만 이 구간에 없는 말. 끼어들면 환각이다. */
const NOT_SPOKEN = MEDIA_OUTLET_TERMS.filter((term) => !SPOKEN.includes(term));

async function run(glossary: string[]): Promise<string> {
  const workDir = mkdtempSync(join(tmpdir(), "faith-media-glossary-"));
  const result = await chunkedTranscribe({
    audioPath: CLIP,
    workDir,
    model: MODEL,
    glossary,
    wordTimestamps: false,
  });
  return result.text;
}

async function main(): Promise<void> {
  for (const [label, glossary] of [
    ["사전 없음", [] as string[]],
    ["언론사 사전", MEDIA_OUTLET_TERMS],
  ] as const) {
    const text = await run(glossary);
    const hit = SPOKEN.filter((term) => text.includes(term));
    const ghost = NOT_SPOKEN.filter((term) => text.includes(term));
    console.log(`\n=== ${label} ===`);
    console.log(text.trim());
    console.log(`적중 ${hit.length}/${SPOKEN.length} · 환각 ${ghost.length}`);
    if (ghost.length > 0) console.log(`끼어든 말: ${ghost.join(", ")}`);
  }
}

void main();
