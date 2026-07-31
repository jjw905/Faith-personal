import {
  assignSpeakersToTimedSegments,
  type DiarizationResult,
} from "@/lib/stt/diarization";
import {
  alignDialogueToTimedSegments,
  alignTextToWordTimings,
  type TimedSegment,
  type WordTiming,
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
  const rough = text
    .split(/\n+|(?<=[.!?。])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // "네, 안녕하세요"처럼 직전 화자 긍정 + 다음 인사 가 한 문장으로 붙으면
  // 화자 경계가 무너진다. 짧은 긍정만 앞에 떼어 앞 문장에 붙일 수 있게 한다.
  const out: string[] = [];
  for (const s of rough) {
    const m = s.match(/^(네|예)([,.…]*)\s+(안녕하.+)$/);
    if (m) {
      out.push(`${m[1]}${m[2] || ""}`.trim());
      out.push(m[3]!.trim());
      continue;
    }
    out.push(s);
  }
  return out;
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
 * 고품질 본전사 단어를 Whisper 실측 단어 시각에 붙인 뒤, Whisper 세그먼트와
 * 음성 화자 경계마다 증거 블록을 만든다.
 *
 * 최종 대화 줄을 휴리스틱으로 나누는 함수가 아니다. 모델이 화자를 다시
 * 검토할 수 있도록 원문을 손실 없이 작은 시간 블록으로 제공한다.
 */
export function attachSpeakersToWordTimings(params: {
  text: string;
  wordTimings: WordTiming[];
  timedSegments: TimedSegment[];
  diarization: DiarizationResult;
}): SpeakerBlock[] {
  if (
    !params.text.trim() ||
    params.wordTimings.length === 0 ||
    params.timedSegments.length === 0
  ) {
    return [];
  }
  const aligned = alignTextToWordTimings(params.text, params.wordTimings);
  const denseLength = params.text.replace(/[^\p{L}\p{N}]/gu, "").length;
  const matchedLength = aligned.reduce(
    (sum, word) => sum + word.text.replace(/[^\p{L}\p{N}]/gu, "").length,
    0,
  );
  // 매칭이 너무 적으면 잘못된 시간 블록보다 기존 문장 정렬 fallback이 안전하다.
  if (aligned.length < 3 || matchedLength / Math.max(1, denseLength) < 0.25) {
    return [];
  }

  const labeledWords = assignSpeakersToTimedSegments({
    timed: aligned.map((word) => ({
      ...word,
      text: word.text,
    })),
    diarization: params.diarization,
    anchor: "start",
  });
  if (labeledWords.length === 0) return [];

  // 화자 경계가 한 단어 끝을 몇백 ms 침범해도 문장 마지막 한두 음절이 다음
  // 사람에게 넘어가지 않도록, 문장을 먼저 잡고 그 안의 정렬 단어 다수결로
  // 음성 화자를 고른다. "진행자 호명. 기자 자기소개."는 문장 끝에서 분리된다.
  const ranges: Array<{ start: number; end: number }> = [];
  let rangeStart = 0;
  for (const match of params.text.matchAll(/[.!?。](?:\s+|$)|\n+/gu)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end > rangeStart) ranges.push({ start: rangeStart, end });
    rangeStart = end;
  }
  if (rangeStart < params.text.length) {
    ranges.push({ start: rangeStart, end: params.text.length });
  }

  return ranges.flatMap(({ start, end }) => {
    const text = params.text.slice(start, end).trim();
    if (!text) return [];
    const words = labeledWords.filter(
      (word) => word.startOffset < end && word.endOffset > start,
    );
    const nearest =
      words[0] ??
      labeledWords.reduce((best, word) =>
        Math.abs(word.startOffset - start) <
        Math.abs(best.startOffset - start)
          ? word
          : best,
      );
    const votes = new Map<string, number>();
    for (const word of words) {
      const weight = Math.max(
        1,
        word.text.replace(/[^\p{L}\p{N}]/gu, "").length,
      );
      votes.set(word.speaker, (votes.get(word.speaker) ?? 0) + weight);
    }
    let speaker = nearest.speaker;
    let bestVote = -1;
    for (const [candidate, vote] of votes) {
      if (vote > bestVote) {
        speaker = candidate;
        bestVote = vote;
      }
    }
    return [
      {
        startSec: words[0]?.startSec ?? nearest.startSec,
        endSec: words[words.length - 1]?.endSec ?? nearest.endSec,
        speaker,
        text,
      },
    ];
  });
}

/**
 * 문장 끝을 "다음 문장 시작"이 아니라 실측 구간이 실제로 이어지는 데까지로
 * 잡는다. 화자 교대 사이 침묵(수 초~수십 초)이 있으면 앞 문장 발언 시간으로
 * 늘어나 그 침묵 뒤에 낀 화자분리 잡음이 화자 판정을 가로챈다.
 */
const SILENCE_GAP_SEC = 1.5;

function realSpanEnd(
  fromSec: number,
  ceilSec: number,
  sortedSegs: TimedSegment[],
): number {
  let i = 0;
  while (i < sortedSegs.length && sortedSegs[i]!.endSec <= fromSec) i += 1;
  if (i >= sortedSegs.length) return Math.min(ceilSec, fromSec);
  if (sortedSegs[i]!.startSec > fromSec + SILENCE_GAP_SEC) {
    return Math.min(ceilSec, fromSec);
  }
  let end = Math.max(fromSec, sortedSegs[i]!.endSec);
  for (let k = i + 1; k < sortedSegs.length; k++) {
    const seg = sortedSegs[k]!;
    if (seg.startSec > end + SILENCE_GAP_SEC || seg.startSec >= ceilSec) break;
    end = Math.max(end, seg.endSec);
  }
  return Math.min(ceilSec, end);
}

/**
 * 화자 전환부의 짧은 인사말("네, 안녕하세요")은 흔히 뒤에 자기소개가
 * 붙는 다음 화자의 것이다. 화자분리는 오디오만 보고 "붙어 있는 쪽"(대개
 * 앞사람)으로 기운다 — 그래서 여기서 본문을 보고 다음 화자 것으로
 * 되돌린다. 다음 문장이 실제로 다른 화자이고 너무 멀리 떨어져 있지 않을
 * 때만 적용한다.
 */
const GREETING_ONLY =
  /^(네|예)?[,.\s]*([가-힣]{1,6}(님|씨))?[,.!?\s]*안녕하(세요|십니까)[,.!?\s]*([가-힣]{1,6}(님|씨))?[.!?]?$/;
const GREETING_REASSIGN_MAX_GAP_SEC = 30;

/**
 * 인사말 뒤 자기소개("YTN 홍민기입니다.")도 화자분리 공백 구간에 있으면
 * 인사말과 같이 앞사람 화자로 잘못 붙는다. 이런 문장은 대개 짧아서, 인사말
 * 뒤로 진짜 다른 화자가 나올 때까지 짧은 문장은 같이 넘긴다. 긴 문장이
 * 나오면(실제 발언 내용) 다리 놓기를 멈춘다 — 잘못 짚었을 때 피해를 줄인다.
 */
const BRIDGE_MAX_CHARS = 24;
const BRIDGE_MAX_ROWS = 3;

function reassignGreetingFragments<
  T extends { startSec: number; endSec: number; text: string; speaker: string },
>(rows: T[]): T[] {
  for (let i = 0; i < rows.length - 1; i++) {
    const row = rows[i]!;
    if (!GREETING_ONLY.test(row.text.trim())) continue;

    let j = i + 1;
    while (
      j < rows.length &&
      j - i <= BRIDGE_MAX_ROWS &&
      rows[j]!.speaker === row.speaker &&
      rows[j]!.text.replace(/\s/g, "").length <= BRIDGE_MAX_CHARS
    ) {
      j += 1;
    }
    if (j >= rows.length || j - i > BRIDGE_MAX_ROWS) continue;

    const boundary = rows[j]!;
    if (boundary.speaker === row.speaker) continue;
    if (boundary.startSec - rows[j - 1]!.endSec > GREETING_REASSIGN_MAX_GAP_SEC)
      continue;

    for (let k = i; k < j; k++) rows[k]!.speaker = boundary.speaker;
  }
  return rows;
}

/**
 * 본전사 + 실측 시각 + 화자분리 → 화자별 발언 블록.
 * 같은 화자가 이어 말하면 한 블록으로 묶는다.
 */
export function attachSpeakersToText(params: {
  text: string;
  timedSegments: TimedSegment[];
  diarization: DiarizationResult;
  durationSec: number;
  /** 화자 일관성 모델에 넘길 때는 문장 단위를 보존한다. 기본은 기존처럼 병합. */
  mergeAdjacent?: boolean;
}): SpeakerBlock[] {
  const sentences = mergeShort(splitSentences(params.text));
  if (sentences.length === 0 || params.timedSegments.length === 0) return [];

  const aligned = alignDialogueToTimedSegments(
    sentences.map((text) => ({ startSec: 0, text })),
    params.timedSegments,
    params.durationSec,
  );

  const sortedSegs = [...params.timedSegments].sort(
    (a, b) => a.startSec - b.startSec,
  );
  const timed = aligned.map((line, i) => {
    const ceil = aligned[i + 1]?.startSec ?? params.durationSec;
    return {
      startSec: line.startSec,
      endSec: Math.max(line.startSec, realSpanEnd(line.startSec, ceil, sortedSegs)),
      text: line.text,
    };
  });

  const labeled = reassignGreetingFragments(
    assignSpeakersToTimedSegments({
      timed,
      diarization: params.diarization,
    }),
  );

  const blocks: SpeakerBlock[] = [];
  for (const row of labeled) {
    const last = blocks[blocks.length - 1];
    if (
      params.mergeAdjacent !== false &&
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
