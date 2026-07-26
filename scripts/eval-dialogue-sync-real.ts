/**
 * 실데이터 정렬 오차 측정 (다화자 180초 고정 클립).
 *
 * 대사 텍스트: gpt-4o-transcribe-diarize 발화 (모델 A)
 * 실측 시각원: faster-whisper large-v3 세그먼트 (모델 B)
 * 정답: diarize API가 준 발화 start (같은 오디오 기준)
 *
 * 즉 "서로 다른 모델의 전사끼리 붙이는" 실제 업로드 파이프라인 상황이다.
 */
import { readFileSync } from "fs";
import { join } from "path";

import {
  alignDialogueToTimedSegments,
  type TimedSegment,
} from "../src/lib/stt/timed-segments";
import type { SemanticDialogueLine } from "../src/lib/stt/semantic-structure";

const RUN = join(
  __dirname,
  "..",
  ".data/stt-bench/multi-speaker-run-20260727",
);

function tokenizeOld(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
}

function overlapOld(a: string, b: string): number {
  const A = tokenizeOld(a);
  const B = tokenizeOld(b);
  if (A.size === 0 || B.size === 0) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit += 1;
  return hit / Math.sqrt(A.size * B.size);
}

function alignOld(
  dialogue: SemanticDialogueLine[],
  timed: TimedSegment[],
  durationSec: number,
): SemanticDialogueLine[] {
  const dur = Math.max(1, durationSec);
  let cursor = 0;
  let prevSec = 0;
  return dialogue.map((d) => {
    let bestIdx = -1;
    let best = -1;
    for (let i = Math.max(0, cursor - 2); i < timed.length; i++) {
      const sc = overlapOld(d.text, timed[i]!.text);
      const near = 1 / (1 + Math.abs(i - cursor) * 0.15);
      const score = sc * near;
      if (score > best) {
        best = score;
        bestIdx = i;
      }
    }
    let startSec: number;
    if (bestIdx >= 0 && best >= 0.08) {
      startSec = timed[bestIdx]!.startSec;
      cursor = bestIdx;
    } else {
      startSec = timed[Math.min(cursor, timed.length - 1)]!.startSec;
    }
    startSec = Math.max(prevSec, Math.min(dur, startSec));
    prevSec = startSec;
    return { ...d, startSec };
  });
}

function stats(errors: number[]) {
  const sorted = [...errors].sort((a, b) => a - b);
  const mean = errors.reduce((s, e) => s + e, 0) / (errors.length || 1);
  const p = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const within = (t: number) =>
    (errors.filter((e) => e <= t).length / (errors.length || 1)) * 100;
  return `평균 ${mean.toFixed(2)}s / p50 ${p(0.5).toFixed(2)}s / p90 ${p(0.9).toFixed(2)}s / 최대 ${(sorted.at(-1) ?? 0).toFixed(1)}s / ±1s ${within(1).toFixed(0)}% / ±3s ${within(3).toFixed(0)}%`;
}

function main() {
  const timedFile = JSON.parse(
    readFileSync(join(RUN, "upload__faster-whisper-large-v3.json"), "utf8"),
  ) as { segments?: TimedSegment[] };
  const timed = (timedFile.segments ?? []).filter((s) => s.text?.trim());

  const diarize = JSON.parse(
    readFileSync(join(RUN, "upload__gpt-4o-transcribe-diarize.json"), "utf8"),
  ) as {
    segments?: Array<{ text?: string; start?: number; speaker?: string }>;
  };
  const all = (diarize.segments ?? []).filter(
    (s) => s.text?.trim() && typeof s.start === "number",
  );
  // 이 모델은 후반부에서 환각(영어, 일본어)이 심해 정답으로 쓸 수 없다.
  const limit = Number(process.env.LIMIT || 0);
  const truthSegs = limit > 0 ? all.slice(0, limit) : all;

  if (timed.length === 0 || truthSegs.length === 0) {
    throw new Error("입력 데이터 부족");
  }

  const dur = Math.max(
    timed.at(-1)!.endSec,
    truthSegs.at(-1)!.start ?? 0,
  );
  const dialogue: SemanticDialogueLine[] = truthSegs.map((s) => ({
    startSec: 0,
    text: s.text!.trim(),
    ...(s.speaker ? { speaker: s.speaker } : {}),
  }));
  const truth = truthSegs.map((s) => s.start!);

  console.log(
    `대사 ${dialogue.length}줄(4o-diarize) ↔ 실측 ${timed.length}구간(whisper-1), 길이 ${(dur / 60).toFixed(1)}분`,
  );

  const oldRes = alignOld(dialogue, timed, dur);
  const newRes = alignDialogueToTimedSegments(dialogue, timed, dur);
  console.log(`  기존: ${stats(oldRes.map((d, i) => Math.abs(d.startSec - truth[i]!)))}`);
  console.log(`  신규: ${stats(newRes.map((d, i) => Math.abs(d.startSec - truth[i]!)))}`);

  if (process.env.DEBUG_WORST) {
    const errs = newRes
      .map((d, i) => ({ e: Math.abs(d.startSec - truth[i]!), i }))
      .sort((a, b) => b.e - a.e)
      .slice(0, 5);
    for (const w of errs) {
      console.log(
        `    #${w.i} 오차 ${w.e.toFixed(1)}s 정답 ${truth[w.i]!.toFixed(1)} 예측 ${newRes[w.i]!.startSec.toFixed(1)} :: ${dialogue[w.i]!.text.slice(0, 40)}`,
      );
    }
  }
}

main();
