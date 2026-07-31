import {
  alignDialogueToWordTimings,
  assignWordTimingsToLines,
  type WordTiming,
} from "../src/lib/stt/timed-segments";
import { activeLineIndexAt } from "../src/lib/transcript-time";
import type { TranscriptLine } from "../src/types/transcript";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const words: WordTiming[] = [
  { text: "그래서", startSec: 397, endSec: 397.4 },
  { text: "봄이", startSec: 398, endSec: 398.3 },
  { text: "되기", startSec: 398.4, endSec: 398.7 },
  { text: "전에는", startSec: 399, endSec: 399.5 },
  { text: "오픈하려고", startSec: 400, endSec: 400.7 },
  { text: "생각하고", startSec: 401, endSec: 401.6 },
  { text: "있습니다", startSec: 402, endSec: 402.7 },
  { text: "안녕하세요", startSec: 420.28, endSec: 420.8 },
  { text: "YTN", startSec: 420.9, endSec: 421.1 },
  { text: "홍민기입니다", startSec: 421.2, endSec: 421.8 },
  { text: "인사", startSec: 422.28, endSec: 422.5 },
  { text: "관련해서", startSec: 422.6, endSec: 423 },
  { text: "여쭙고", startSec: 423.1, endSec: 423.5 },
  { text: "싶은데요", startSec: 423.6, endSec: 424 },
  { text: "최근", startSec: 424.14, endSec: 424.4 },
  { text: "파격", startSec: 425, endSec: 425.3 },
  { text: "인사로", startSec: 425.4, endSec: 425.8 },
  { text: "해석됩니다", startSec: 426, endSec: 426.8 },
  { text: "어제", startSec: 438.34, endSec: 438.7 },
  { text: "국무회의", startSec: 439, endSec: 439.5 },
  { text: "생중계를", startSec: 439.6, endSec: 440.1 },
  { text: "통해서", startSec: 440.2, endSec: 440.6 },
  { text: "공유됐습니다", startSec: 441, endSec: 441.8 },
];

const dialogue = [
  {
    startSec: 397,
    speaker: "화자 A",
    text: "그래서 봄이 되기 전에는 오픈하려고 생각하고 있습니다.",
  },
  {
    // 기존 근사 정렬이 실제 첫 단어보다 약 17초 앞서던 KTV 재현값.
    startSec: 402.82,
    speaker: "화자 B",
    text: "안녕하세요. YTN 홍민기입니다. 인사 관련해서 여쭙고 싶은데요.",
  },
  {
    startSec: 424.14,
    speaker: "화자 B",
    text: "최근 파격 인사로 해석됩니다.",
  },
  {
    startSec: 438.34,
    speaker: "화자 A",
    text: "어제 국무회의 생중계를 통해서 공유됐습니다.",
  },
];

const aligned = alignDialogueToWordTimings(dialogue, words, 704);
assert(
  Math.abs(aligned[1]!.startSec - 420.28) < 0.01,
  `기자 인사 시작이 단어 시각과 다름: ${aligned[1]!.startSec}`,
);
assert(
  Math.abs(aligned[2]!.startSec - 424.14) < 0.01,
  `다음 질문 시작이 단어 시각과 다름: ${aligned[2]!.startSec}`,
);

const lines: TranscriptLine[] = dialogue.map((line, index) => ({
  id: `l${index + 1}`,
  time: "00:00",
  startSec: line.startSec,
  speaker: line.speaker,
  text: line.text,
}));
const assigned = assignWordTimingsToLines(lines, words, 704);
assert(
  assigned[1]!.words?.[0]?.text === "안녕하세요",
  "기자 인사 첫 단어가 해당 말풍선에 배정되지 않음",
);
assert(
  assigned[1]!.startSec === 420.28,
  `말풍선 시작이 첫 단어와 다름: ${assigned[1]!.startSec}`,
);

const starts = assigned.map((line) => line.startSec ?? 0);
assert(
  activeLineIndexAt(starts, 419) === 0,
  "실제 기자 발화 전에 기자 말풍선으로 넘어감",
);
assert(
  activeLineIndexAt(starts, 420.3) === 1,
  "기자 발화가 시작돼도 기자 말풍선으로 넘어가지 않음",
);
assert(
  activeLineIndexAt(starts, 424.2) === 2,
  "다음 질문 말풍선 추적 실패",
);

console.log(
  JSON.stringify({
    ok: true,
    starts: assigned.map((line) => line.startSec),
    firstWords: assigned.map((line) => line.words?.[0]?.text ?? null),
  }),
);
