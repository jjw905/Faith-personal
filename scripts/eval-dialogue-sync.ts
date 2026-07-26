/**
 * 대화기록 ↔ STT 실측 시각 정렬 오차 측정.
 *
 * 실제 whisper 세그먼트(.data/stt-bench/assembly__timed-segments.json)로
 * "구조화 모델이 다시 나눈 대화기록"을 합성해 정답 시각을 알고 있는 상태로
 * 기존 알고리즘(greedy)과 신규 알고리즘(bigram DP + 보간)의 오차를 비교한다.
 */
import { readFileSync } from "fs";
import { join } from "path";

import {
  alignDialogueToTimedSegments,
  type TimedSegment,
} from "../src/lib/stt/timed-segments";
import type { SemanticDialogueLine } from "../src/lib/stt/semantic-structure";

const BENCH = join(__dirname, "..", ".data/stt-bench");

/** 교체 전 알고리즘 (비교용 사본). */
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
    const from = Math.max(0, cursor - 2);
    for (let i = from; i < timed.length; i++) {
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

function loadTimed(file: string): TimedSegment[] {
  const raw = JSON.parse(readFileSync(join(BENCH, file), "utf8")) as {
    segments?: TimedSegment[];
  };
  return (raw.segments ?? []).filter((s) => Boolean(s.text?.trim()));
}

/** 결정적 난수 (재현용). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const HANGUL = "가나다라마바사아자차카타파하은는이가을를에서도만";

/** 다른 모델 전사처럼 흔들기: 치환, 삭제, 띄어쓰기 변형. */
function perturb(text: string, rate: number, rand: () => number): string {
  let out = "";
  for (const ch of text) {
    const r = rand();
    if (r < rate * 0.4) continue;
    if (r < rate * 0.8) {
      out += HANGUL[Math.floor(rand() * HANGUL.length)];
      continue;
    }
    if (r < rate) {
      out += ch === " " ? "" : `${ch} `;
      continue;
    }
    out += ch;
  }
  return out.trim();
}

type Case = {
  name: string;
  dialogue: SemanticDialogueLine[];
  truth: number[];
};

/** 세그먼트 경계와 무관하게 글자 수로 다시 자른 대화기록. */
function buildCase(
  timed: TimedSegment[],
  opts: { name: string; minChars: number; maxChars: number; noise: number; seed: number },
): Case {
  const rand = rng(opts.seed);
  const stream: Array<{ ch: string; sec: number }> = [];
  for (const seg of timed) {
    const chars = [...seg.text];
    const span = Math.max(0, seg.endSec - seg.startSec);
    chars.forEach((ch, i) => {
      stream.push({
        ch,
        sec: seg.startSec + (chars.length > 1 ? (i / chars.length) * span : 0),
      });
    });
    stream.push({ ch: " ", sec: seg.endSec });
  }

  const dialogue: SemanticDialogueLine[] = [];
  const truth: number[] = [];
  let i = 0;
  while (i < stream.length) {
    const len =
      opts.minChars +
      Math.floor(rand() * Math.max(1, opts.maxChars - opts.minChars));
    const slice = stream.slice(i, i + len);
    const text = slice
      .map((s) => s.ch)
      .join("")
      .trim();
    if (text) {
      dialogue.push({
        startSec: 0,
        text: opts.noise > 0 ? perturb(text, opts.noise, rand) : text,
      });
      truth.push(slice[0]!.sec);
    }
    i += len;
  }
  return { name: opts.name, dialogue, truth };
}

function stats(errors: number[]) {
  const sorted = [...errors].sort((a, b) => a - b);
  const mean = errors.reduce((s, e) => s + e, 0) / (errors.length || 1);
  const p = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const within = (t: number) =>
    (errors.filter((e) => e <= t).length / (errors.length || 1)) * 100;
  return {
    mean,
    p50: p(0.5),
    p90: p(0.9),
    max: sorted.at(-1) ?? 0,
    within1: within(1),
    within3: within(3),
  };
}

function run(label: string, c: Case, timed: TimedSegment[], dur: number) {
  const oldRes = alignOld(c.dialogue, timed, dur);
  const newRes = alignDialogueToTimedSegments(c.dialogue, timed, dur);
  const oldErr = oldRes.map((d, i) => Math.abs(d.startSec - c.truth[i]!));
  const newErr = newRes.map((d, i) => Math.abs(d.startSec - c.truth[i]!));
  const o = stats(oldErr);
  const n = stats(newErr);
  const fmt = (s: ReturnType<typeof stats>) =>
    `평균 ${s.mean.toFixed(2)}s / p50 ${s.p50.toFixed(2)}s / p90 ${s.p90.toFixed(2)}s / 최대 ${s.max.toFixed(1)}s / ±1s ${s.within1.toFixed(0)}% / ±3s ${s.within3.toFixed(0)}%`;
  console.log(`\n[${label}] 줄 ${c.dialogue.length}개`);
  console.log(`  기존: ${fmt(o)}`);
  console.log(`  신규: ${fmt(n)}`);

  if (process.env.DEBUG_WORST) {
    const worst = newErr
      .map((e, i) => ({ e, i }))
      .sort((a, b) => b.e - a.e)
      .slice(0, 3);
    for (const w of worst) {
      console.log(
        `    #${w.i} 오차 ${w.e.toFixed(1)}s 정답 ${c.truth[w.i]!.toFixed(1)} 예측 ${newRes[w.i]!.startSec.toFixed(1)} :: ${c.dialogue[w.i]!.text.slice(0, 40)}`,
      );
    }
  }
}

function main() {
  const timed = loadTimed("assembly__timed-segments.json");
  if (timed.length === 0) throw new Error("timed segments 없음");
  const dur = timed.at(-1)!.endSec;
  console.log(
    `세그먼트 ${timed.length}개, 길이 ${(dur / 60).toFixed(1)}분`,
  );

  const cases = [
    buildCase(timed, { name: "동일 전사, 재분할", minChars: 40, maxChars: 120, noise: 0, seed: 1 }),
    buildCase(timed, { name: "타모델 전사(오차 15%)", minChars: 40, maxChars: 120, noise: 0.15, seed: 2 }),
    buildCase(timed, { name: "타모델 전사(오차 30%)", minChars: 40, maxChars: 120, noise: 0.3, seed: 3 }),
    buildCase(timed, { name: "짧은 줄(15~45자)", minChars: 15, maxChars: 45, noise: 0.15, seed: 4 }),
  ];

  for (const c of cases) run(c.name, c, timed, dur);
}

main();
