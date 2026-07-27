/**
 * 시각 패스를 로컬 모델로 바꿨을 때 대화기록 시각이 얼마나 달라지는지.
 *
 * 구간끼리 견주면 나누는 단위가 달라 과장된다. 실제 화면에 찍히는 값은
 * 정렬을 거친 대화기록 시각이므로, 같은 대화기록을 두 시각 스트림에 각각
 * 정렬해 결과 차이를 잰다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/eval-local-timing-dialogue.ts /tmp/timing-large.json
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { alignDialogueToTimedSegments } from "../src/lib/stt/timed-segments";

const BASE_CACHE = join(
  process.cwd(),
  ".data/stt-bench/fixtures/assembly3-dense-180.whisper1-segments.json",
);
const MINI_TEXT = join(
  process.cwd(),
  ".data/stt-bench/multi-speaker-run-20260727/upload__gpt-4o-mini-transcribe.txt",
);
const DURATION = 180;

type Seg = { start: number; end: number; text: string };

function toTimed(segs: Seg[]) {
  return segs.map((s) => ({
    startSec: s.start,
    endSec: s.end,
    text: s.text,
  }));
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
}

function main() {
  const candidatePath = process.argv[2];
  if (!candidatePath || !existsSync(candidatePath) || !existsSync(BASE_CACHE)) {
    console.error("기준 또는 후보 시각 파일이 없습니다.");
    process.exit(1);
  }

  const base = JSON.parse(readFileSync(BASE_CACHE, "utf8")) as Seg[];
  const local = JSON.parse(readFileSync(candidatePath, "utf8")) as {
    model: string;
    segments: Seg[];
  };

  const dialogue = splitSentences(readFileSync(MINI_TEXT, "utf8")).map(
    (text, i) => ({ startSec: (i / 20) * DURATION, text }),
  );

  const withBase = alignDialogueToTimedSegments(
    dialogue.map((d) => ({ ...d })),
    toTimed(base),
    DURATION,
  );
  const withLocal = alignDialogueToTimedSegments(
    dialogue.map((d) => ({ ...d })),
    toTimed(local.segments),
    DURATION,
  );

  const errors: number[] = [];
  for (let i = 0; i < withBase.length; i++) {
    const a = withBase[i]?.startSec;
    const b = withLocal[i]?.startSec;
    if (typeof a !== "number" || typeof b !== "number") continue;
    errors.push(Math.abs(a - b));
  }
  errors.sort((x, y) => x - y);
  const mean = errors.reduce((a, b) => a + b, 0) / Math.max(1, errors.length);
  const within = (t: number) =>
    (errors.filter((e) => e <= t).length / Math.max(1, errors.length)) * 100;

  console.log(
    JSON.stringify(
      {
        로컬모델: local.model,
        대화줄: dialogue.length,
        평균차이초: Number(mean.toFixed(2)),
        중앙값초: Number((errors[Math.floor(errors.length / 2)] ?? 0).toFixed(2)),
        "±1초": `${within(1).toFixed(0)}%`,
        "±2초": `${within(2).toFixed(0)}%`,
        "±3초": `${within(3).toFixed(0)}%`,
        최대차이초: Number((errors[errors.length - 1] ?? 0).toFixed(2)),
      },
      null,
      2,
    ),
  );
}

main();
