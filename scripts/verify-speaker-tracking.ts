import {
  alignDialogueToWordTimings,
  assignWordTimingsToLines,
  type WordTiming,
} from "../src/lib/stt/timed-segments";
import {
  glueBoundaryFragmentSpeakers,
  prunePhantomSpeakers,
  type DiarizationResult,
} from "../src/lib/stt/diarization";
import {
  activeLineIndexAt,
  lineStartSec,
} from "../src/lib/transcript-time";
import {
  repairShortTurnProtocols,
  stabilizeSpeakerTurnsWithAcoustics,
} from "../src/lib/stt/speaker-turns";
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

// 2026-07-30 KTV 저장본 재현: 줄 시작값은 109.27초였지만 실제 첫 단어는
// 119.58초였다. 오래된 분석도 단어 실측값이 있으면 약 10초 먼저 재생하지 않는다.
assert(
  lineStartSec({
    time: "01:49",
    startSec: 109.27,
    words: [{ startSec: 119.58 }],
  }) === 119.58,
  "저장된 줄 시작보다 실제 첫 단어 시각을 우선하지 않음",
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

/**
 * KTV 01:55 재현: 진행자 호명은 1.47초뿐이고 한 번의 발화가 두 조각으로
 * 나뉘지만, 다음 기자와 다른 실제 목소리이므로 제거하거나 glue하면 안 된다.
 */
const diarization: DiarizationResult = {
  model: "pyannote-segmentation-3.0+3D-Speaker(sherpa-onnx)",
  device: "cpu",
  durationSec: 704,
  wallMs: 0,
  speakerCount: 3,
  segments: [
    { startSec: 104.1, endSec: 109.45, speaker: "HOST" },
    { startSec: 115.27, endSec: 115.59, speaker: "CALLER" },
    { startSec: 117.23, endSec: 118.38, speaker: "CALLER" },
    { startSec: 119.02, endSec: 137.26, speaker: "REPORTER" },
  ],
};
const cleaned = glueBoundaryFragmentSpeakers(
  prunePhantomSpeakers(diarization),
);
assert(
  cleaned.segments.some((segment) => segment.speaker === "CALLER"),
  "짧지만 독립된 진행자 호명 화자를 보존하지 못함",
);
assert(
  cleaned.speakerCount === 3,
  `진행자 호명과 다음 기자가 합쳐짐: 화자 ${cleaned.speakerCount}명`,
);

// 의미 모델이 질문의 마지막 블록만 진행자로 보낸 경우, 같은 음성 cluster의
// 앞 두 블록을 따라 기자로 복구한다. 다음 답변은 cluster가 바뀌어 유지된다.
const stabilized = stabilizeSpeakerTurnsWithAcoustics(
  [
    { startSec: 118.9, endSec: 121.6, speaker: "C", text: "예, 한국일보 이성택입니다." },
    { startSec: 122.4, endSec: 131.9, speaker: "C", text: "예시를 몇 개 들어주시고요." },
    { startSec: 132.8, endSec: 137.2, speaker: "C", text: "1호를 알려 주십시오." },
    { startSec: 137.4, endSec: 144.4, speaker: "A", text: "각 부처에서 신청할 겁니다." },
  ],
  [
    { startSec: 118.9, endSec: 132.7, speaker: "기자", text: "기자 질문" },
    { startSec: 132.8, endSec: 144.4, speaker: "진행자", text: "질문 끝과 답변" },
  ],
);
assert(
  stabilized[0]?.speaker === "기자" &&
    stabilized[0]?.text.includes("1호를 알려 주십시오"),
  "동일 음성 cluster의 질문 마지막 문장을 기자에게 복구하지 못함",
);
assert(
  stabilized[1]?.speaker === "진행자" &&
    stabilized[1]?.text.includes("각 부처에서 신청"),
  "다른 음성 cluster의 답변까지 기자에게 합침",
);

// 음성 cluster가 우연히 같아도 호명과 자기소개는 강한 문맥 경계로 보존한다.
const sameClusterBoundary = stabilizeSpeakerTurnsWithAcoustics(
  [
    { startSec: 115.7, endSec: 118.9, speaker: "X", text: "네, 이성택 기자님." },
    { startSec: 118.9, endSec: 121.6, speaker: "X", text: "예, 한국일보 이성택입니다." },
  ],
  [
    { startSec: 115.7, endSec: 118.9, speaker: "진행자", text: "호명" },
    { startSec: 118.9, endSec: 121.6, speaker: "기자", text: "자기소개" },
  ],
);
assert(
  sameClusterBoundary.length === 2 &&
    sameClusterBoundary[0]?.speaker === "진행자" &&
    sameClusterBoundary[1]?.speaker === "기자",
  "같은 cluster의 진행자 호명과 기자 자기소개 경계를 보존하지 못함",
);

const repairedHostCall = repairShortTurnProtocols([
  {
    startSec: 0,
    endSec: 100,
    speaker: "진행자",
    text: "정부 정책과 운영 방침을 충분히 길게 설명하는 진행자의 본 발언입니다.",
  },
  {
    startSec: 115.7,
    endSec: 118.9,
    // 음향 임시 cluster를 자기소개 이름으로 잘못 붙인 회귀를 재현한다.
    speaker: "이성택",
    text: "네, 이성택 기자님.",
  },
  {
    startSec: 118.9,
    endSec: 121.6,
    speaker: "이성택",
    text: "예, 한국일보 이성택입니다.",
  },
]);
assert(
  repairedHostCall[1]?.speaker === "진행자" &&
    repairedHostCall[2]?.speaker === "이성택",
  "기자 호명 줄을 진행자에게 되돌리지 못함",
);

const splitReporter = stabilizeSpeakerTurnsWithAcoustics(
  [
    { startSec: 419, endSec: 424, speaker: "E", text: "YTN 홍민기입니다. 인사 관련해서 여쭙고 싶은데요." },
    { startSec: 424.1, endSec: 438, speaker: "F", text: "최근 인사를 기대해도 되는지 여쭤봅니다." },
    { startSec: 438.1, endSec: 449, speaker: "A", text: "네, 대통령의 인사 철학은 이렇습니다." },
    { startSec: 449.2, endSec: 458, speaker: "A", text: "같은 진행자의 이어지는 답변입니다." },
    { startSec: 500, endSec: 510, speaker: "A", text: "기존 진행자 답변입니다." },
    { startSec: 520, endSec: 530, speaker: "A", text: "다른 진행자 답변입니다." },
  ],
  [
    { startSec: 419, endSec: 424, speaker: "기자-1", text: "자기소개" },
    { startSec: 424.1, endSec: 449, speaker: "기자-2", text: "질문과 답변이 잘못 합쳐짐" },
    { startSec: 449.2, endSec: 458, speaker: "기자-2", text: "이어지는 답변도 잘못 분리됨" },
    { startSec: 500, endSec: 510, speaker: "진행자", text: "진행자" },
    { startSec: 520, endSec: 530, speaker: "진행자", text: "진행자" },
  ],
);
assert(
  splitReporter[0]?.speaker === "기자-1" &&
    splitReporter[0]?.text.includes("최근 인사"),
  "자기소개 뒤 이어지는 질문의 음성 과분리를 합치지 못함",
);
assert(
  splitReporter[1]?.speaker === "진행자" &&
    splitReporter[1]?.text.includes("대통령의 인사 철학"),
  "질문 종결 뒤 다른 음성 cluster의 답변을 분리하지 못함",
);

console.log(
  JSON.stringify({
    ok: true,
    starts: assigned.map((line) => line.startSec),
    firstWords: assigned.map((line) => line.words?.[0]?.text ?? null),
  }),
);
