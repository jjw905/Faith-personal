/**
 * 무음 기준 분할 적용 후, 청크 경계에서 말이 잘리는지 실제 전사로 확인.
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-chunk-boundary-text.ts
 */
import { config } from "dotenv";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const AUDIO =
  process.argv[2] ||
  join(process.cwd(), ".data/stt-bench/assembly-envlabor-20250425.mp3");
const WORK = join(process.cwd(), ".data/tmp-chunk-boundary");
const OUT = join(
  process.cwd(),
  ".data/stt-bench/assembly__gpt-4o-mini-transcribe__chunked-silencecut.txt",
);

async function main() {
  mkdirSync(WORK, { recursive: true });
  try {
    const res = await chunkedTranscribe({
      audioPath: AUDIO,
      workDir: WORK,
      model: "gpt-4o-mini-transcribe",
    });
    writeFileSync(OUT, `${res.text}\n`);
    console.log(
      `청크 ${res.chunkCount}개, ${res.text.length}자, 실측 ${res.timedSegments.length}구간, $${res.usage.estimatedUsd.toFixed(4)}`,
    );
    for (let i = 0; i < res.parts.length - 1; i++) {
      console.log(`--- 경계 ${i} -> ${i + 1}`);
      console.log(`  앞끝: ${JSON.stringify(res.parts[i]!.slice(-60))}`);
      console.log(`  뒤앞: ${JSON.stringify(res.parts[i + 1]!.slice(0, 60))}`);
    }
  } finally {
    rmSync(WORK, { recursive: true, force: true });
  }
}

void main();
