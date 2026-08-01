/**
 * KTV 재생 싱크·화자 배정 진단.
 *
 * 사용자가 보고한 증상을 산출물 데이터에서 직접 확인한다.
 * 1) 줄 안의 단어 시각이 시간순인가 (UI activeWordAt은 시간순을 전제한다)
 * 2) line.startSec과 words[0].startSec이 같은가 (클릭 seek 기준점)
 * 3) 줄 사이 시간 역전·겹침이 있는가
 * 4) 보고된 구간의 화자 라벨
 *
 * npx tsx --tsconfig tsconfig.json scripts/diagnose-ktv-sync.ts
 */
import { readFileSync } from "node:fs";

type Word = {
  text: string;
  startSec: number;
  endSec: number;
  startOffset: number;
  endOffset: number;
};
type Line = {
  id: string;
  time: string;
  startSec: number;
  speaker: string;
  text: string;
  words?: Word[];
};

const TARGETS = [
  { id: "mtg-up-8c414061", label: "빠른 분석 (standard)" },
  { id: "mtg-up-311a76ad", label: "고급 분석 (precision)" },
];

/** 사용자가 지목한 구간. 초 단위. */
const REPORTED: Array<{ from: number; to: number; note: string }> = [
  { from: 110, to: 135, note: "1:55~2:12 이성택 기자가 둘로 갈림(고급)" },
  { from: 170, to: 200, note: "2:54~3:15 '활동한거 고생많으셨습니다' 누락(빠른)" },
  { from: 186, to: 215, note: "3:06~3:32 같은 이성택 기자인데 수석으로 섞임" },
  { from: 190, to: 225, note: "3:10, 3:18~3:41 같은 사람인데 섞임(고급)" },
  { from: 608, to: 625, note: "10:08~10:25 김한진 기자 SBS BJ 오인식" },
];

function clock(sec: number): string {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function analyze(id: string, label: string) {
  const raw = JSON.parse(
    readFileSync(`.data/user-meetings/${id}.json`, "utf8"),
  ) as {
    analysisMode?: string;
    model?: string;
    meeting?: { duration?: string };
    transcript: { lines: Line[] };
  };
  const lines = raw.transcript.lines;

  console.log(`\n${"=".repeat(72)}`);
  console.log(`${label}  (${id})`);
  console.log(`모델 ${raw.model} / 모드 ${raw.analysisMode} / 줄 ${lines.length}`);
  console.log("=".repeat(72));

  // 1) 줄 안 단어 시각 역전
  let linesWithWords = 0;
  let nonMonotonicLines = 0;
  let nonMonotonicPairs = 0;
  let worstBack = 0;
  const examples: string[] = [];
  for (const line of lines) {
    const words = line.words ?? [];
    if (words.length < 2) continue;
    linesWithWords += 1;
    let bad = 0;
    for (let i = 1; i < words.length; i += 1) {
      const back = words[i - 1]!.startSec - words[i]!.startSec;
      if (back > 0) {
        bad += 1;
        nonMonotonicPairs += 1;
        if (back > worstBack) worstBack = back;
        if (examples.length < 6) {
          examples.push(
            `    [${clock(line.startSec)}] "${words[i - 1]!.text}"(${words[i - 1]!.startSec.toFixed(2)}s) → "${words[i]!.text}"(${words[i]!.startSec.toFixed(2)}s) : ${back.toFixed(2)}s 역행`,
          );
        }
      }
    }
    if (bad > 0) nonMonotonicLines += 1;
  }
  console.log(`\n[1] 줄 안 단어 시각 역전 (UI는 시간순 정렬을 전제)`);
  console.log(`  단어 있는 줄: ${linesWithWords} / ${lines.length}`);
  console.log(
    `  역전 있는 줄: ${nonMonotonicLines} (${((nonMonotonicLines / Math.max(1, linesWithWords)) * 100).toFixed(1)}%), 역전 쌍 ${nonMonotonicPairs}, 최대 ${worstBack.toFixed(2)}초`,
  );
  examples.forEach((e) => console.log(e));

  // 2) line.startSec vs words[0].startSec
  let mismatch = 0;
  let worstMismatch = 0;
  let startAfterFirstWord = 0;
  const mismatchExamples: string[] = [];
  for (const line of lines) {
    const words = line.words ?? [];
    if (words.length === 0) continue;
    const first = Math.min(...words.map((w) => w.startSec));
    const diff = line.startSec - first;
    if (Math.abs(diff) > 0.05) {
      mismatch += 1;
      if (Math.abs(diff) > Math.abs(worstMismatch)) worstMismatch = diff;
      if (diff > 0) startAfterFirstWord += 1;
      if (mismatchExamples.length < 6) {
        mismatchExamples.push(
          `    [${clock(line.startSec)}] line.startSec=${line.startSec.toFixed(2)} vs 첫 단어=${first.toFixed(2)} (${diff > 0 ? "+" : ""}${diff.toFixed(2)}s) "${line.text.slice(0, 28)}"`,
        );
      }
    }
  }
  console.log(`\n[2] 클릭 seek 기준점 (line.startSec vs 첫 단어 시각)`);
  console.log(
    `  어긋난 줄: ${mismatch} / ${lines.length}, 그중 seek이 첫 단어보다 뒤: ${startAfterFirstWord}, 최대 ${worstMismatch.toFixed(2)}초`,
  );
  mismatchExamples.forEach((e) => console.log(e));

  // 3) 줄 순서 역전·겹침
  let lineBack = 0;
  let overlap = 0;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]!.startSec < lines[i - 1]!.startSec) lineBack += 1;
    const prevWords = lines[i - 1]!.words ?? [];
    const prevEnd = prevWords.length
      ? Math.max(...prevWords.map((w) => w.endSec))
      : lines[i - 1]!.startSec;
    if (prevEnd > lines[i]!.startSec + 0.05) overlap += 1;
  }
  console.log(`\n[3] 줄 순서`);
  console.log(`  시작 시각 역전: ${lineBack}, 앞줄 끝이 다음 줄 시작을 넘음: ${overlap}`);

  // 4) 보고 구간 화자
  console.log(`\n[4] 보고 구간 화자 배정`);
  for (const range of REPORTED) {
    const hit = lines.filter(
      (line) => line.startSec >= range.from && line.startSec <= range.to,
    );
    if (hit.length === 0) continue;
    console.log(`\n  · ${range.note}`);
    for (const line of hit) {
      console.log(
        `    [${clock(line.startSec)}] ${line.speaker} :: ${line.text.slice(0, 70)}`,
      );
    }
  }

  // 5) 화자 라벨 목록
  const speakers = new Map<string, number>();
  for (const line of lines) {
    speakers.set(line.speaker, (speakers.get(line.speaker) ?? 0) + 1);
  }
  console.log(`\n[5] 화자 라벨 ${speakers.size}종`);
  [...speakers.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([name, count]) => console.log(`    ${count.toString().padStart(3)}줄  ${name}`));

  // 6) 사용자가 지목한 누락 문구
  const full = lines.map((l) => l.text).join(" ");
  for (const needle of ["고생", "활동", "BJ", "김영록", "녹음록"]) {
    const at = full.indexOf(needle);
    console.log(
      `\n[6] "${needle}" ${at >= 0 ? `있음 → ...${full.slice(Math.max(0, at - 40), at + 40)}...` : "없음"}`,
    );
  }
}

for (const target of TARGETS) {
  try {
    analyze(target.id, target.label);
  } catch (err) {
    console.error(`${target.id} 실패:`, err instanceof Error ? err.message : err);
  }
}
