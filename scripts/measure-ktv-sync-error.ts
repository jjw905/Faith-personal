/**
 * KTV 재생 싱크 오차 실측.
 *
 * 클로바 녹취에는 턴마다 MM:SS 타임스탬프가 있다. 우리 대화기록 줄을
 * 그 턴에 텍스트로 매칭한 뒤 시작 시각 차이를 잰다.
 * 양수면 우리 줄이 늦다(형광펜이 뒤늦게 붙는다), 음수면 이르다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/measure-ktv-sync-error.ts
 */
import { readFileSync } from "node:fs";

type Word = { text: string; startSec: number; endSec: number };
type Line = {
  time: string;
  startSec: number;
  speaker: string;
  text: string;
  words?: Word[];
};

const REFERENCE =
  process.env.REFERENCE ??
  "/Users/905jjw/Downloads/ktv-briefing-20251231 (1).txt";

const TARGETS = [
  { id: "mtg-up-8c414061", label: "빠른 분석 (mini 본문 + whisper 단어시각)" },
  { id: "mtg-up-311a76ad", label: "고급 분석 (gpt-transcribe + 강제정렬)" },
];

type RefTurn = { speaker: string; atSec: number; text: string };

function parseReference(raw: string): RefTurn[] {
  const turns: RefTurn[] = [];
  let current: RefTurn | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    const marker = t.match(/^참석자\s+(\d+)\s+(\d{2}):(\d{2})$/);
    if (marker) {
      if (current?.text.trim()) turns.push(current);
      current = {
        speaker: `참석자 ${marker[1]}`,
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

function bigrams(text: string): Map<string, number> {
  const v = norm(text);
  const m = new Map<string, number>();
  for (let i = 0; i + 1 < v.length; i += 1) {
    const g = v.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** 짧은 줄이 긴 턴의 일부여도 잡히도록 줄 기준 recall. */
function recall(part: string, whole: string): number {
  const a = bigrams(part);
  const b = bigrams(whole);
  let total = 0;
  let hit = 0;
  for (const [g, c] of a) {
    total += c;
    hit += Math.min(c, b.get(g) ?? 0);
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

function analyze(id: string, label: string, turns: RefTurn[]) {
  const raw = JSON.parse(
    readFileSync(`.data/user-meetings/${id}.json`, "utf8"),
  ) as { transcript: { lines: Line[] } };
  const lines = raw.transcript.lines;

  console.log(`\n${"=".repeat(70)}`);
  console.log(`${label}`);
  console.log("=".repeat(70));

  /**
   * 턴의 첫 문장과 가장 잘 맞는 우리 줄을 찾는다. 턴 시작 시각과 비교해야
   * 하므로 턴 전체가 아니라 앞부분(최대 40자)만 쓴다.
   */
  const deltas: Array<{ turn: RefTurn; line: Line; delta: number; score: number }> =
    [];
  for (const turn of turns) {
    const head = turn.text.slice(0, 40);
    let best: Line | null = null;
    let bestScore = 0;
    for (const line of lines) {
      // 턴 시작 ±25초 안에서만 후보를 본다. 반복어로 먼 곳에 붙는 걸 막는다.
      if (Math.abs(line.startSec - turn.atSec) > 25) continue;
      const score = recall(line.text.slice(0, 40), head);
      if (score > bestScore) {
        bestScore = score;
        best = line;
      }
    }
    if (best && bestScore >= 0.55) {
      deltas.push({
        turn,
        line: best,
        delta: best.startSec - turn.atSec,
        score: bestScore,
      });
    }
  }

  if (deltas.length === 0) {
    console.log("매칭된 턴이 없다.");
    return;
  }

  const values = deltas.map((d) => d.delta);
  const abs = values.map((v) => Math.abs(v));
  console.log(
    `매칭 턴 ${deltas.length} / ${turns.length}  (클로바 타임스탬프는 초 단위 내림이라 ±1초는 잡음)`,
  );
  console.log(`  중앙 오차   ${median(values).toFixed(2)}초  (양수=우리가 늦음)`);
  console.log(
    `  평균 오차   ${(values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)}초`,
  );
  console.log(`  절대 중앙값 ${median(abs).toFixed(2)}초`);
  console.log(`  최대 |오차| ${Math.max(...abs).toFixed(2)}초`);
  console.log(
    `  1초 이내 ${abs.filter((v) => v <= 1).length}건, 3초 초과 ${abs.filter((v) => v > 3).length}건`,
  );

  console.log("\n  턴별:");
  for (const d of deltas) {
    const flag = Math.abs(d.delta) > 3 ? "  ← 큼" : "";
    console.log(
      `    정답 ${clock(d.turn.atSec).padStart(5)} / 우리 ${clock(d.line.startSec).padStart(5)}  ${d.delta >= 0 ? "+" : ""}${d.delta.toFixed(2)}초  ${d.line.speaker.slice(0, 12).padEnd(12)} ${d.line.text.slice(0, 34)}${flag}`,
    );
  }
}

function main() {
  const turns = parseReference(readFileSync(REFERENCE, "utf8"));
  console.log(`정답 턴 ${turns.length}개 (클로바 녹취 타임스탬프)`);
  for (const target of TARGETS) {
    try {
      analyze(target.id, target.label, turns);
    } catch (err) {
      console.error(target.id, err instanceof Error ? err.message : err);
    }
  }
}

main();
