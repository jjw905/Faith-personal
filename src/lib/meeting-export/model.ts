import { maskPii, type MaskStyle } from "@/lib/masking";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";

import type {
  MeetingExportCue,
  MeetingExportLine,
  MeetingExportModel,
} from "./types";

function parseClockToSec(time: string): number | undefined {
  const parts = time.trim().split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return undefined;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  return undefined;
}

function estimateEndSec(startSec: number, text: string, nextStart?: number) {
  if (nextStart != null && nextStart > startSec) return nextStart;
  const chars = Math.max(1, text.replace(/\s+/g, "").length);
  // ~10자/초 기준, 최소 1.2초
  return startSec + Math.max(1.2, Math.min(12, chars / 10));
}

function buildCues(lines: MeetingExportLine[]): MeetingExportCue[] {
  const withStarts = lines.map((line, i) => {
    const startSec =
      line.startSec ??
      parseClockToSec(line.time) ??
      i * 2;
    return { ...line, startSec };
  });

  return withStarts.map((line, i) => {
    const next = withStarts[i + 1]?.startSec;
    const endSec =
      line.endSec ?? estimateEndSec(line.startSec, line.text, next);
    const body = line.text.replace(/-->/g, "→").trim() || "(첨부)";
    return {
      index: i + 1,
      startSec: line.startSec,
      endSec: Math.max(line.startSec + 0.4, endSec),
      text: `${line.speaker}: ${body}`,
      speaker: line.speaker,
    };
  });
}

const EXPORT_TURN_MAX_CHARS = 260;
const EXPORT_TURN_MAX_SPAN_SEC = 30;

/** 기존의 문장별 기록도 내보낼 때는 같은 화자의 한 호흡 단위로 읽히게 한다. */
function groupLinesForReading(lines: MeetingExportLine[]): MeetingExportLine[] {
  const grouped: MeetingExportLine[] = [];
  for (const line of lines) {
    const previous = grouped[grouped.length - 1];
    const combined = previous
      ? `${previous.text.trim()} ${line.text.trim()}`.trim()
      : line.text;
    const previousStart = previous?.startSec ?? parseClockToSec(previous?.time ?? "");
    const currentStart = line.startSec ?? parseClockToSec(line.time);
    if (
      previous &&
      previous.speaker === line.speaker &&
      combined.length <= EXPORT_TURN_MAX_CHARS &&
      previousStart != null &&
      currentStart != null &&
      currentStart - previousStart <= EXPORT_TURN_MAX_SPAN_SEC
    ) {
      previous.text = combined;
      previous.endSec = line.endSec ?? previous.endSec;
      continue;
    }
    grouped.push({ ...line });
  }
  return grouped;
}

/** 회의 데이터 → 포맷 공통 모델. 섹션 순서는 TXT와 동일. */
export function buildMeetingExportModel(payload: {
  meeting: Meeting;
  timeline?: MeetingTimeline;
  transcript?: MeetingTranscript;
  summary?: string;
}): MeetingExportModel {
  const { meeting, timeline, transcript, summary } = payload;
  const sourceLines: MeetingExportLine[] = (transcript?.lines ?? []).map((l) => ({
    time: l.time,
    speaker: l.speaker,
    text: (l.text ?? "").trim(),
    startSec: l.startSec,
    endSec: l.words?.length
      ? Math.max(...l.words.map((w) => w.endSec))
      : undefined,
  }));
  const lines = groupLinesForReading(sourceLines);

  return {
    meetingId: meeting.id,
    title: meeting.title,
    date: meeting.date,
    duration: meeting.duration,
    summary: (summary || timeline?.overallSummary || "").trim(),
    decisions: [...(timeline?.decisions ?? [])],
    actions: (timeline?.actions ?? []).map((a) => ({
      owner: a.owner?.trim() ?? "",
      task: a.task,
      due: a.due,
    })),
    segments: (timeline?.segments ?? []).map((s) => ({
      start: s.start,
      end: s.end,
      title: s.title,
      summary: s.summary ?? "",
    })),
    lines,
    // 자막은 원래의 세밀한 문장 경계를 유지하고, 읽기 문서만 묶는다.
    cues: buildCues(sourceLines),
  };
}

/**
 * 내보내기용 모델에만 개인정보 가림을 적용한다.
 * 원본 회의·대화 데이터와 화면 상태는 변경하지 않는다.
 */
export function maskMeetingExportModel(
  model: MeetingExportModel,
  style: MaskStyle,
  names: string[] = [],
): MeetingExportModel {
  if (style === "off") return model;

  const redact = (value: string | undefined) =>
    value == null ? value : maskPii(value, { names, style }).masked;

  return {
    ...model,
    title: redact(model.title) ?? model.title,
    summary: redact(model.summary) ?? model.summary,
    decisions: model.decisions.map((decision) => redact(decision) ?? decision),
    actions: model.actions.map((action) => ({
      ...action,
      owner: redact(action.owner) ?? action.owner,
      task: redact(action.task) ?? action.task,
      due: redact(action.due),
    })),
    segments: model.segments.map((segment) => ({
      ...segment,
      title: redact(segment.title) ?? segment.title,
      summary: redact(segment.summary) ?? segment.summary,
    })),
    lines: model.lines.map((line) => ({
      ...line,
      speaker: redact(line.speaker) ?? line.speaker,
      text: redact(line.text) ?? line.text,
    })),
    cues: model.cues.map((cue) => ({
      ...cue,
      speaker: redact(cue.speaker) ?? cue.speaker,
      text: redact(cue.text) ?? cue.text,
    })),
  };
}

export function safeExportFileName(title: string) {
  return title.replace(/[^\w가-힣.\-]+/g, "_").slice(0, 80) || "meeting";
}
