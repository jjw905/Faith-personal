import { existsSync, readFileSync } from "node:fs";

import {
  repairChunkBoundarySurface,
  suggestConsensusSurfaceCorrections,
} from "../src/lib/stt/surface-accuracy";
import type { ChunkedTranscribeResult } from "../src/lib/stt/chunked-transcribe";
import { applyFixedSpellings } from "../src/lib/stt/term-suggest";
import type { TranscriptLine } from "../src/types/transcript";

const repaired = repairChunkBoundarySurface({
  parts: [
    "국가적 암호 체계 전환도 차질 없이 수행하도록 하겠습니다. 마지막.",
    "하겠습니다. 마지막으로 범국가적 사이버 안보 협력 체계를 강화하겠습니다.",
  ],
  partRanges: [
    { startSec: 0, endSec: 298.026 },
    { startSec: 298.026, endSec: 600 },
  ],
  wordTimings: [
    { text: "수행하도록", startSec: 296.02, endSec: 296.8 },
    { text: "하겠습니다", startSec: 296.8, endSec: 297.18 },
    { text: "마지막으로", startSec: 298.85, endSec: 299.65 },
    {
      text: "범국가적사이버안보협력체계를",
      startSec: 299.65,
      endSec: 302.35,
    },
    { text: "강화하겠습니다", startSec: 302.35, endSec: 303.13 },
  ],
});

const joined = repaired.parts.join(" ");
if (
  repaired.repairs.length !== 1 ||
  joined.includes("마지막. 하겠습니다") ||
  joined !==
    "국가적 암호 체계 전환도 차질 없이 수행하도록 하겠습니다. 마지막으로 범국가적 사이버 안보 협력 체계를 강화하겠습니다."
) {
  throw new Error(
    `청크 경계 표면 오류를 안전하게 제거하지 못했습니다: ${joined}`,
  );
}
const unchanged = repairChunkBoundarySurface({
  parts: ["첫 번째 대책을 설명하겠습니다.", "다음으로 두 번째 대책입니다."],
  partRanges: [
    { startSec: 0, endSec: 10 },
    { startSec: 10, endSec: 20 },
  ],
  wordTimings: [
    { text: "설명하겠습니다", startSec: 8, endSec: 9 },
    { text: "다음으로", startSec: 10.2, endSec: 10.8 },
    { text: "두", startSec: 10.8, endSec: 11 },
    { text: "번째", startSec: 11, endSec: 11.3 },
    { text: "대책입니다", startSec: 11.3, endSec: 12 },
  ],
});
if (
  unchanged.repairs.length !== 0 ||
  unchanged.parts[0] !== "첫 번째 대책을 설명하겠습니다."
) {
  throw new Error("정상 청크 경계를 수정했습니다.");
}

const consensus = suggestConsensusSurfaceCorrections({
  lines: [
    "국가안보실을 중심으로 과기정통부와 협력합니다.",
    "각기 정통부를 포함한 관계 부처는 실행합니다.",
  ],
  timingTexts: [
    "국가안보실을 중심으로 과기정통부 금융위",
    "과기정통부 포함한 관계 부처는",
  ],
});
if (
  consensus.length !== 1 ||
  consensus[0]?.wrong !== "각기 정통부를" ||
  consensus[0]?.suggestion !== "과기정통부를"
) {
  throw new Error(
    `독립 전사 반복 표기 합의에 실패했습니다: ${JSON.stringify(consensus)}`,
  );
}
const correctedLine = applyFixedSpellings(
  [
    {
      id: "l1",
      time: "00:00",
      startSec: 0,
      segmentId: "s1",
      speaker: "화자 A",
      text: consensus[0]!.wrong,
      words: [
        {
          text: "각기",
          startSec: 0,
          endSec: 0.4,
          startOffset: 0,
          endOffset: 2,
        },
        {
          text: "정통부를",
          startSec: 0.4,
          endSec: 1,
          startOffset: 3,
          endOffset: 7,
        },
      ],
    },
  ] satisfies TranscriptLine[],
  [
    {
      ...consensus[0]!,
      lineIndex: 0,
      reason: "독립 전사 합의",
      dictionaryVerified: true,
      source: "glossary",
    },
  ],
  [consensus[0]!.suggestion],
)[0]!;
if (
  correctedLine.text !== "과기정통부를" ||
  correctedLine.words?.length !== 1 ||
  correctedLine.words[0]?.text !== "과기정통부를"
) {
  throw new Error(
    `합의 표기를 본문과 단어 시각에 함께 적용하지 못했습니다: ${JSON.stringify(correctedLine)}`,
  );
}

const unknownName = suggestConsensusSurfaceCorrections({
  lines: ["김의정 의원님 수고하셨습니다."],
  timingTexts: ["김의정 의원님 수고하셨습니다"],
});
if (unknownName.length !== 0) {
  throw new Error("근거가 없는 인명을 자동 교정했습니다.");
}

const hardsetCache =
  ".data/stt-bench/video-hardset/brief-infosec-20251022__gpt-transcribe.json";
let cachedRepairs = 0;
let cachedConsensus: ReturnType<typeof suggestConsensusSurfaceCorrections> = [];
if (existsSync(hardsetCache)) {
  const cached = JSON.parse(
    readFileSync(hardsetCache, "utf8"),
  ) as ChunkedTranscribeResult;
  const actual = repairChunkBoundarySurface({
    parts: cached.parts,
    partRanges: cached.partRanges,
    wordTimings: cached.wordTimings,
  });
  cachedRepairs = actual.repairs.length;
  const text = actual.parts.join("\n");
  if (cachedRepairs !== 1 || text.includes("마지막.\n하겠습니다. 마지막으로")) {
    throw new Error(
      "정보보호 hard-set의 실제 청크 경계 오류를 고치지 못했습니다.",
    );
  }
  cachedConsensus = suggestConsensusSurfaceCorrections({
    lines: cached.parts,
    timingTexts: cached.timedSegments.map((segment) => segment.text),
  });
}

const hearingCache =
  ".data/stt-bench/video-hardset/hearing-kim-minseok-004145-010145__gpt-transcribe.json";
let hearingConsensus = 0;
if (existsSync(hearingCache)) {
  const cached = JSON.parse(
    readFileSync(hearingCache, "utf8"),
  ) as ChunkedTranscribeResult;
  const suggestions = suggestConsensusSurfaceCorrections({
    lines: cached.parts,
    timingTexts: cached.timedSegments.map((segment) => segment.text),
  });
  hearingConsensus = suggestions.length;
  if (suggestions.length !== 0) {
    throw new Error(
      `청문회에서 근거 없는 표면 자동 교정이 생겼습니다: ${JSON.stringify(suggestions)}`,
    );
  }
}

console.log(
  JSON.stringify({
    ok: true,
    repaired: repaired.repairs.length,
    consensus: consensus.length,
    cachedRepairs,
    cachedConsensus,
    hearingConsensus,
  }),
);
