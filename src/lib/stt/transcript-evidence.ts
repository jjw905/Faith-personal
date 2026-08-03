import type { SpeakerBlock } from "@/lib/stt/speaker-attach";
import type { SemanticDialogueLine } from "@/lib/stt/semantic-structure";
import {
  alignDialogueToTimedSegments,
  type TimedSegment,
} from "@/lib/stt/timed-segments";

const MAX_LINE_CHARS = 280;
/** Clova Note처럼 한 화자의 연속 문장을 한 호흡으로 읽되 너무 길어지지 않게 한다. */
const TARGET_BUBBLE_CHARS = 180;
const TARGET_BUBBLE_SPAN_SEC = 25;

function dense(text: string) {
  return text.replace(/[^0-9A-Za-z가-힣]/g, "");
}

function splitLong(text: string) {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > MAX_LINE_CHARS) {
    const window = rest.slice(0, MAX_LINE_CHARS + 1);
    const cut = Math.max(
      window.lastIndexOf(" "),
      window.lastIndexOf(","),
      window.lastIndexOf("·"),
    );
    const at = cut >= 120 ? cut + 1 : MAX_LINE_CHARS;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/** Split only at characters already present in the STT source. */
export function splitTranscriptEvidence(text: string) {
  return text
    .split(/\n+|(?<=[.!?。])\s+/)
    .flatMap(splitLong)
    .map((line) => line.trim())
    .filter(Boolean);
}

function groupAdjacentEvidence(
  lines: SemanticDialogueLine[],
): SemanticDialogueLine[] {
  const grouped: SemanticDialogueLine[] = [];
  for (const line of lines) {
    const previous = grouped[grouped.length - 1];
    const combined = previous
      ? `${previous.text.trim()} ${line.text.trim()}`.trim()
      : line.text;
    if (
      previous &&
      previous.speaker === line.speaker &&
      combined.length <= TARGET_BUBBLE_CHARS &&
      line.startSec - previous.startSec <= TARGET_BUBBLE_SPAN_SEC
    ) {
      previous.text = combined;
      continue;
    }
    grouped.push({ ...line });
  }
  return grouped;
}

/**
 * The LLM may choose topics and boundaries, but it may not author transcript
 * text. Every dialogue line returned here is a slice/merge of the primary STT
 * evidence and receives time only from measured tokens/segments.
 */
export function buildEvidenceDialogue(params: {
  text: string;
  timedSegments: TimedSegment[];
  durationSec: number;
  speakerBlocks?: SpeakerBlock[];
}): SemanticDialogueLine[] {
  const sourceDense = dense(params.text);
  if (!sourceDense) return [];

  if (params.speakerBlocks?.length) {
    // 화자 일관성 단계는 같은 사람이 이어 말한 문장들을 긴 블록으로 합친다.
    // 그 블록을 화면 대화 한 줄로 그대로 쓰면 5~7분 발언이 말풍선 하나로
    // 몰린다. 화자는 보존하되, PRIMARY 원문에 이미 있는 문장 경계에서 다시
    // 읽기 단위로 나눈다. 시각은 아래에서 실측 세그먼트에 다시 맞춘다.
    const fromSpeakers = params.speakerBlocks.flatMap((block) =>
      splitTranscriptEvidence(block.text).map((text) => ({
        startSec: block.startSec,
        speaker: block.speaker,
        text,
      })),
    );
    if (dense(fromSpeakers.map((line) => line.text).join(" ")) === sourceDense) {
      return groupAdjacentEvidence(
        alignDialogueToTimedSegments(
          fromSpeakers,
          params.timedSegments,
          params.durationSec,
        ),
      );
    }
  }

  const evidence = splitTranscriptEvidence(params.text).map((text) => ({
    startSec: 0,
    speaker: "발화",
    text,
  }));
  if (dense(evidence.map((line) => line.text).join(" ")) !== sourceDense) {
    throw new Error("원본 전사 근거를 손실 없이 나누지 못했습니다.");
  }
  return groupAdjacentEvidence(
    alignDialogueToTimedSegments(
      evidence,
      params.timedSegments,
      params.durationSec,
    ),
  );
}
