import type { UserMeetingRecord } from "@/lib/user-meetings-store";
import type { MeetingTimeline, TimelineSegment } from "@/types/timeline";
import type { TranscriptLine } from "@/types/transcript";

export type TranscriptLineEditResult =
  | { ok: true; record: UserMeetingRecord }
  | { ok: false; message: string };

function findLineIndex(lines: TranscriptLine[], lineId: string): number {
  return lines.findIndex((line) => line.id === lineId);
}

/**
 * 오인식 보정 추천을 실제 대사에 반영한다. 사용자가 알약(pill)을 눌렀을 때만
 * 호출된다 — 모델이나 에이전트가 자동으로 본문을 바꾸는 경로는 아니다.
 */
export function applyLineCorrection(
  record: UserMeetingRecord,
  params: {
    lineId: string;
    wrong: string;
    suggestion: string;
    startOffset?: number;
    endOffset?: number;
  },
): TranscriptLineEditResult {
  const lines = record.transcript.lines;
  const idx = findLineIndex(lines, params.lineId);
  if (idx < 0) {
    return { ok: false, message: "대화 줄을 찾을 수 없습니다." };
  }
  const line = lines[idx]!;
  const text = line.text ?? "";

  let nextText: string | null = null;
  if (
    typeof params.startOffset === "number" &&
    typeof params.endOffset === "number" &&
    text.slice(params.startOffset, params.endOffset) === params.wrong
  ) {
    nextText =
      text.slice(0, params.startOffset) +
      params.suggestion +
      text.slice(params.endOffset);
  } else {
    const at = text.indexOf(params.wrong);
    if (at >= 0) {
      nextText =
        text.slice(0, at) +
        params.suggestion +
        text.slice(at + params.wrong.length);
    }
  }

  if (nextText === null) {
    return { ok: false, message: "원문이 바뀌어 반영할 수 없습니다." };
  }

  const nextCorrections = (line.corrections ?? []).filter(
    (c) => !(c.wrong === params.wrong && c.suggestion === params.suggestion),
  );

  const nextLines = lines.slice();
  nextLines[idx] = {
    ...line,
    text: nextText,
    corrections: nextCorrections.length > 0 ? nextCorrections : undefined,
  };

  return {
    ok: true,
    record: {
      ...record,
      transcript: { ...record.transcript, lines: nextLines },
    },
  };
}

/** 말풍선 본문 전체를 사용자 입력으로 교체한다. */
export function setLineText(
  record: UserMeetingRecord,
  lineId: string,
  textRaw: string,
): TranscriptLineEditResult {
  const lines = record.transcript.lines;
  const idx = findLineIndex(lines, lineId);
  if (idx < 0) {
    return { ok: false, message: "대화 줄을 찾을 수 없습니다." };
  }
  const text = textRaw.trim();
  if (!text) {
    return { ok: false, message: "대사 내용이 필요합니다." };
  }
  const line = lines[idx]!;
  const prev = line.text ?? "";
  const nextLines = lines.slice();
  const clearWords =
    !line.words?.length ||
    Math.abs(text.length - prev.length) >
      Math.max(8, Math.floor(prev.length * 0.2));
  nextLines[idx] = {
    ...line,
    text,
    words: clearWords ? undefined : line.words,
    corrections: undefined,
  };

  return {
    ok: true,
    record: {
      ...record,
      transcript: { ...record.transcript, lines: nextLines },
    },
  };
}

/** 말풍선 메모를 저장/삭제한다. 본문(text)은 건드리지 않는다. */
export function setLineMemo(
  record: UserMeetingRecord,
  lineId: string,
  memoRaw: string,
): TranscriptLineEditResult {
  const lines = record.transcript.lines;
  const idx = findLineIndex(lines, lineId);
  if (idx < 0) {
    return { ok: false, message: "대화 줄을 찾을 수 없습니다." };
  }
  const memo = memoRaw.trim();
  const line = lines[idx]!;
  const nextLines = lines.slice();
  nextLines[idx] = { ...line, memo: memo || undefined };

  return {
    ok: true,
    record: {
      ...record,
      transcript: { ...record.transcript, lines: nextLines },
    },
  };
}

export type TimelinePatchInput = {
  overallSummary?: string;
  decisions?: string[];
  actions?: MeetingTimeline["actions"];
  segments?: Array<{ id: string; title?: string; summary?: string }>;
};

export type TimelinePatchResult =
  | { ok: true; timeline: MeetingTimeline }
  | { ok: false; message: string };

/** 사용자가 요약·타임라인 구간을 고친다. */
export function applyTimelinePatch(
  timeline: MeetingTimeline,
  patch: TimelinePatchInput,
): TimelinePatchResult {
  let next: MeetingTimeline = { ...timeline };

  if (typeof patch.overallSummary === "string") {
    next = { ...next, overallSummary: patch.overallSummary.trim() };
  }
  if (Array.isArray(patch.decisions)) {
    next = {
      ...next,
      decisions: patch.decisions.map((d) => d.trim()).filter(Boolean),
    };
  }
  if (Array.isArray(patch.actions)) {
    next = {
      ...next,
      actions: patch.actions
        .map((a) => ({
          owner: a.owner.trim(),
          task: a.task.trim(),
          ...(a.due?.trim() ? { due: a.due.trim() } : {}),
        }))
        .filter((a) => a.task),
    };
  }
  if (Array.isArray(patch.segments) && patch.segments.length > 0) {
    const byId = new Map(patch.segments.map((s) => [s.id, s]));
    const segments: TimelineSegment[] = timeline.segments.map((seg) => {
      const hit = byId.get(seg.id);
      if (!hit) return seg;
      return {
        ...seg,
        ...(typeof hit.title === "string"
          ? { title: hit.title.trim() || seg.title }
          : {}),
        ...(typeof hit.summary === "string"
          ? { summary: hit.summary.trim() }
          : {}),
      };
    });
    next = { ...next, segments };
  }

  return { ok: true, timeline: next };
}
