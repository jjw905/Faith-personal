/**
 * 긴 회의에서 구조화, 정렬이 끝까지 커버되는지 확인.
 *
 * 입력: assembly 전체 전사(gpt-4o-mini-transcribe 청크 결과) + whisper-1 실측 세그먼트
 * 출력: 대화기록 줄 수, 커버 구간, 원문 대비 글자 비율
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-structure-coverage.ts
 */
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildSemanticStructure } from "../src/lib/stt/semantic-structure";
import {
  alignDialogueToTimedSegments,
  type TimedSegment,
} from "../src/lib/stt/timed-segments";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const BENCH = join(process.cwd(), ".data/stt-bench");

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

async function main() {
  const text = readFileSync(
    join(BENCH, "assembly__gpt-4o-mini-transcribe__chunked.txt"),
    "utf8",
  ).trim();
  const timedFile = JSON.parse(
    readFileSync(join(BENCH, "assembly__timed-segments.json"), "utf8"),
  ) as { segments?: TimedSegment[] };
  const timed = (timedFile.segments ?? []).filter((s) => s.text?.trim());
  const durationSec = timed.at(-1)!.endSec;

  console.log(`입력 ${text.length}자, 실측 ${timed.length}구간, ${clock(durationSec)}`);

  const { structure, usage, dialogueCoverage } = await buildSemanticStructure(
    text,
    durationSec,
  );
  console.log(`커버리지 지표 ${(dialogueCoverage * 100).toFixed(0)}%`);
  const dialogueChars = structure.dialogue.reduce(
    (s, d) => s + d.text.length,
    0,
  );
  console.log(
    `대화기록 ${structure.dialogue.length}줄, ${dialogueChars}자 (원문 대비 ${((dialogueChars / text.length) * 100).toFixed(0)}%)`,
  );
  console.log(
    `구간 ${structure.timeline.length}개, 결정 ${structure.decisions.length}, 액션 ${structure.actions.length}, 토큰 ${usage.totalTokens}, $${usage.estimatedUsd.toFixed(4)}`,
  );

  const aligned = alignDialogueToTimedSegments(
    structure.dialogue,
    timed,
    durationSec,
  );
  console.log(
    `정렬 결과 ${clock(aligned[0]!.startSec)} ~ ${clock(aligned.at(-1)!.startSec)} (녹음 끝 ${clock(durationSec)})`,
  );

  let maxGap = 0;
  let gapAt = 0;
  for (let i = 1; i < aligned.length; i++) {
    const gap = aligned[i]!.startSec - aligned[i - 1]!.startSec;
    if (gap > maxGap) {
      maxGap = gap;
      gapAt = aligned[i - 1]!.startSec;
    }
  }
  console.log(`가장 큰 공백 ${maxGap.toFixed(0)}초 (${clock(gapAt)} 부근)`);
  console.log(`요약: ${structure.overallSummary}`);
  console.log(`키워드: ${structure.keywords.join(", ")}`);
}

void main();
