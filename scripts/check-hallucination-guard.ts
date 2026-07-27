/**
 * 환각 가드가 실제 환각 출력만 걸러내는지 확인.
 * 정상 전사는 글자 수가 거의 그대로여야 하고, 환각 출력은 줄어야 한다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-hallucination-guard.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { stripHallucination } from "../src/lib/stt/hallucination-guard";

const BENCH = join(process.cwd(), ".data/stt-bench");
const RUN = join(BENCH, "multi-speaker-run-20260727");

const CASES: Array<{ name: string; file: string; durationSec: number }> = [
  { name: "정상 mini(180초)", file: join(RUN, "upload__gpt-4o-mini-transcribe.txt"), durationSec: 180 },
  { name: "정상 faster-whisper(180초)", file: join(RUN, "upload__faster-whisper-large-v3-recommended.txt"), durationSec: 180 },
  { name: "환각 4o(180초)", file: join(RUN, "upload__gpt-4o-transcribe.txt"), durationSec: 180 },
  { name: "환각 4o-diarize(180초)", file: join(RUN, "upload__gpt-4o-transcribe-diarize.txt"), durationSec: 180 },
  { name: "한국어FT turbo(180초)", file: join(RUN, "upload__faster-whisper-large-v3-turbo-korean.txt"), durationSec: 180 },
  { name: "정상 mini 전체(18.4분)", file: join(BENCH, "assembly__gpt-4o-mini-transcribe__chunked.txt"), durationSec: 1106 },
  { name: "정상 whisper-1 전체(18.4분)", file: join(BENCH, "assembly__whisper-1__raw.txt"), durationSec: 1106 },
];

for (const c of CASES) {
  if (!existsSync(c.file)) {
    console.log(`${c.name.padEnd(26)} 파일 없음`);
    continue;
  }
  const text = readFileSync(c.file, "utf8");
  const r = stripHallucination(text, c.durationSec);
  const keptPct = (r.text.length / Math.max(1, text.length)) * 100;
  console.log(
    `${c.name.padEnd(26)} ${text.length}자 -> ${r.text.length}자 (${keptPct.toFixed(0)}% 유지), ` +
      `제거 ${r.removedSentences}문장, 초당 ${r.charsPerSec.toFixed(1)}자${r.overGenerated ? " [과생성]" : ""}`,
  );
}
