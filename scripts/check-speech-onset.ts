/**
 * 줄 시작 시각이 실제 발화 시작점에 붙었는지 본다.
 *
 * 시간을 글자 수로 보간하면 문장 사이 침묵이 계산에 안 들어간다.
 * 줄이 시작되는 자리가 바로 그 침묵 뒤라, 추정값이 침묵 앞에 떨어져
 * 눌러 들으면 앞 문장 끝소리부터 나온다.
 * whisper 구간 머리까지의 거리를 재서 얼마나 어긋나는지 확인한다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-speech-onset.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  alignDialogueToTimedSegments,
  type TimedSegment,
} from "../src/lib/stt/timed-segments";

const CACHE = join(
  process.cwd(),
  ".data",
  "stt-bench",
  "assembly__timed-segments.json",
);

function main(): void {
  const raw = JSON.parse(readFileSync(CACHE, "utf8")) as {
    segments?: TimedSegment[];
  };
  const timed = (raw.segments ?? []).filter((s) => Boolean(s.text?.trim()));
  if (!timed.length) throw new Error("실측 시각 캐시가 없습니다.");
  const durationSec = timed.at(-1)!.endSec;

  // 실측 구간 본문을 그대로 줄로 삼아, 정답이 구간 머리인 상황을 만든다.
  const dialogue = timed
    .filter((s) => s.text.trim().length >= 8)
    .map((s) => ({ startSec: 0, text: s.text.trim() }));
  const truth = timed
    .filter((s) => s.text.trim().length >= 8)
    .map((s) => s.startSec);

  const aligned = alignDialogueToTimedSegments(dialogue, timed, durationSec);

  const diffs = aligned.map((line, i) => line.startSec - truth[i]!);
  const abs = diffs.map(Math.abs);
  const mean = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const meanAbs = abs.reduce((a, b) => a + b, 0) / abs.length;
  const early = diffs.filter((d) => d < -0.05).length;
  const exact = abs.filter((d) => d <= 0.05).length;

  console.log(`줄 ${diffs.length}개, ${(durationSec / 60).toFixed(1)}분`);
  console.log(`  치우침 ${mean >= 0 ? "+" : ""}${mean.toFixed(2)}s`);
  console.log(`  절대 오차 ${meanAbs.toFixed(2)}s`);
  console.log(
    `  발화 머리에 정확히 붙은 줄 ${exact}개 (${Math.round((exact / diffs.length) * 100)}%)`,
  );
  console.log(
    `  앞 문장 꼬리로 떨어진 줄 ${early}개 (${Math.round((early / diffs.length) * 100)}%)`,
  );
}

main();
