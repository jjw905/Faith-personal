import {
  assignSpeakersToTimedSegments,
  type DiarizationResult,
} from "@/lib/stt/diarization";
import {
  alignDialogueToTimedSegments,
  type TimedSegment,
} from "@/lib/stt/timed-segments";

/**
 * 전사 본문에 화자를 붙여 구조화 모델 입력을 만든다.
 *
 * 실측 시각(timedSegments)의 본문은 시각을 재려고 돌린 whisper 결과라
 * 품질이 본전사보다 낮다. 그 본문을 그대로 쓰면 화자는 얻지만 글이 나빠진다.
 * 그래서 본전사 문장을 시간축에 얹은 뒤, 화자분리 구간과 겹쳐 보고 화자를 붙인다.
 *
 * 문장을 나누는 것은 모델에 넘길 입력을 만들기 위해서다.
 * 화면에 나가는 대화기록은 여전히 구조화 모델이 나눈다.
 */

/** 한국어 문장 끝. 종결어미 뒤 마침표가 없는 경우가 많아 줄바꿈도 경계로 본다. */
function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 너무 짧은 조각은 앞 문장에 붙인다. 한두 글자로는 화자를 가릴 수 없다. */
const MIN_SENTENCE_CHARS = 6;

/**
 * 한 블록 목표 길이.
 * 구조화 모델은 입력 줄 단위를 그대로 따라가는 성향이 있다. 한 사람이 5분을
 * 말했다고 한 덩어리로 넘기면 대화기록도 한 줄이 되어 채팅으로 못 읽는다.
 */
const MAX_BLOCK_CHARS = 200;

function mergeShort(sentences: string[]): string[] {
  const out: string[] = [];
  for (const s of sentences) {
    if (out.length > 0 && s.replace(/\s/g, "").length < MIN_SENTENCE_CHARS) {
      out[out.length - 1] = `${out[out.length - 1]} ${s}`;
      continue;
    }
    out.push(s);
  }
  return out;
}

export type SpeakerBlock = {
  startSec: number;
  endSec: number;
  speaker: string;
  text: string;
};

/**
 * 본전사 + 실측 시각 + 화자분리 → 화자별 발언 블록.
 * 같은 화자가 이어 말하면 한 블록으로 묶는다.
 */
export function attachSpeakersToText(params: {
  text: string;
  timedSegments: TimedSegment[];
  diarization: DiarizationResult;
  durationSec: number;
}): SpeakerBlock[] {
  const sentences = mergeShort(splitSentences(params.text));
  if (sentences.length === 0 || params.timedSegments.length === 0) return [];

  const aligned = alignDialogueToTimedSegments(
    sentences.map((text) => ({ startSec: 0, text })),
    params.timedSegments,
    params.durationSec,
  );

  const timed = aligned.map((line, i) => ({
    startSec: line.startSec,
    endSec: aligned[i + 1]?.startSec ?? params.durationSec,
    text: line.text,
  }));

  const labeled = assignSpeakersToTimedSegments({
    timed,
    diarization: params.diarization,
  });

  const blocks: SpeakerBlock[] = [];
  for (const row of labeled) {
    const last = blocks[blocks.length - 1];
    if (
      last &&
      last.speaker === row.speaker &&
      last.text.length + row.text.length <= MAX_BLOCK_CHARS
    ) {
      last.text = `${last.text} ${row.text}`.trim();
      last.endSec = row.endSec;
      continue;
    }
    blocks.push({
      startSec: row.startSec,
      endSec: row.endSec,
      speaker: row.speaker,
      text: row.text,
    });
  }
  return blocks;
}

export function formatSpeakerBlocks(blocks: SpeakerBlock[]): string {
  return blocks
    .map((b) => `[${b.startSec.toFixed(2)}s][${b.speaker}] ${b.text}`)
    .join("\n");
}
