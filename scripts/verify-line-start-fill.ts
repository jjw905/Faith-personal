/**
 * 앞머리 토큰 시각 보간이 줄 시작 지연을 줄이는지 확인한다.
 *
 * 저장된 KTV 대화기록의 줄 텍스트를 그대로 쓰고, 실측 단어열(whisper 캐시)에
 * 다시 맞춰 줄 시작 시각을 새로 계산한다. 그 값을 클로바 정답 타임스탬프와
 * 비교해 보정 전(저장값)과 보정 후(재계산값)의 오차를 나란히 본다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/verify-line-start-fill.ts
 */
import { readFileSync } from "node:fs";

import { alignDialogueToWordTimings } from "../src/lib/stt/timed-segments";
import type { WordTiming } from "../src/lib/stt/timed-segments";

const MEETING = process.env.MEETING ?? "mtg-up-8c414061";
const WORDS_CACHE =
  process.env.WORDS_CACHE ?? ".data/stt-bench/ktv__fresh-stt-word-timings.json";
const REFERENCE =
  process.env.REFERENCE ??
  "/Users/905jjw/Downloads/ktv-briefing-20251231 (1).txt";

type Line = { time: string; startSec: number; speaker: string; text: string };
type RefTurn = { atSec: number; text: string };

function parseReference(raw: string): RefTurn[] {
  const turns: RefTurn[] = [];
  let current: RefTurn | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    const marker = t.match(/^참석자\s+(\d+)\s+(\d{2}):(\d{2})$/);
    if (marker) {
      if (current?.text.trim()) turns.push(current);
      current = {
        atSec: Number(marker[2]) * 60 + Number(marker[3]),
        text: "",
      };
      continue;
    }
    if (current && t) current.text = `${current.text} ${t}`.trim();
  }
  if (current?.text.trim()) turns.push(current);
  return turns;
}

function norm(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function recall(part: string, whole: string): number {
  const a = norm(part);
  const b = norm(whole);
  if (a.length < 2) return 0;
  let total = 0;
  let hit = 0;
  const counts = new Map<string, number>();
  for (let i = 0; i + 1 < b.length; i += 1) {
    const g = b.slice(i, i + 2);
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  for (let i = 0; i + 1 < a.length; i += 1) {
    const g = a.slice(i, i + 2);
    total += 1;
    const left = counts.get(g) ?? 0;
    if (left > 0) {
      hit += 1;
      counts.set(g, left - 1);
    }
  }
  return total > 0 ? hit / total : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function errorsAgainst(
  starts: number[],
  texts: string[],
  turns: RefTurn[],
): Array<{ atSec: number; ourSec: number; delta: number; text: string }> {
  const out: Array<{ atSec: number; ourSec: number; delta: number; text: string }> =
    [];
  for (const turn of turns) {
    const head = turn.text.slice(0, 40);
    let bestIndex = -1;
    let bestScore = 0;
    for (let i = 0; i < texts.length; i += 1) {
      if (Math.abs(starts[i]! - turn.atSec) > 25) continue;
      const score = recall(texts[i]!.slice(0, 40), head);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0 && bestScore >= 0.55) {
      out.push({
        atSec: turn.atSec,
        ourSec: starts[bestIndex]!,
        delta: starts[bestIndex]! - turn.atSec,
        text: texts[bestIndex]!.slice(0, 34),
      });
    }
  }
  return out;
}

function summarize(
  label: string,
  rows: Array<{ delta: number }>,
): void {
  const values = rows.map((r) => r.delta);
  const abs = values.map((v) => Math.abs(v));
  console.log(
    `  ${label.padEnd(12)} 매칭 ${String(rows.length).padStart(2)}건 · 중앙 ${median(values) >= 0 ? "+" : ""}${median(values).toFixed(2)}초 · 절대중앙 ${median(abs).toFixed(2)}초 · 1초이내 ${abs.filter((v) => v <= 1).length}건 · 3초초과 ${abs.filter((v) => v > 3).length}건`,
  );
}

function main() {
  const meeting = JSON.parse(
    readFileSync(`.data/user-meetings/${MEETING}.json`, "utf8"),
  ) as { transcript: { lines: Line[] } };
  const lines = meeting.transcript.lines;

  const cache = JSON.parse(readFileSync(WORDS_CACHE, "utf8")) as {
    durationSec: number;
    words: WordTiming[];
  };
  const turns = parseReference(readFileSync(REFERENCE, "utf8"));

  const texts = lines.map((line) => line.text);
  const storedStarts = lines.map((line) => line.startSec);

  const recomputed = alignDialogueToWordTimings(
    lines.map((line) => ({ speaker: line.speaker, text: line.text })) as never,
    cache.words,
    cache.durationSec,
  ) as unknown as Array<{ startSec: number }>;
  const newStarts = recomputed.map((line) => line.startSec);

  console.log(`회의 ${MEETING} · 줄 ${lines.length} · 실측 단어 ${cache.words.length}`);
  console.log(`정답 턴 ${turns.length} (클로바, 초 단위 내림이라 ±1초는 잡음)\n`);

  const before = errorsAgainst(storedStarts, texts, turns);
  const after = errorsAgainst(newStarts, texts, turns);
  summarize("보정 전(저장)", before);
  summarize("보정 후(신규)", after);

  console.log("\n  턴별 비교 (정답 / 전 / 후):");
  const afterByAt = new Map(after.map((r) => [r.atSec, r]));
  for (const row of before) {
    const post = afterByAt.get(row.atSec);
    if (!post) continue;
    const improved = Math.abs(post.delta) < Math.abs(row.delta) - 0.05;
    const worse = Math.abs(post.delta) > Math.abs(row.delta) + 0.05;
    console.log(
      `    ${clock(row.atSec).padStart(5)}  ${row.delta >= 0 ? "+" : ""}${row.delta.toFixed(2)} → ${post.delta >= 0 ? "+" : ""}${post.delta.toFixed(2)}  ${improved ? "개선" : worse ? "악화" : "  · "}  ${row.text}`,
    );
  }
}

main();
