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

/** 회의 데이터 → 포맷 공통 모델. 섹션 순서는 TXT와 동일. */
export function buildMeetingExportModel(payload: {
  meeting: Meeting;
  timeline?: MeetingTimeline;
  transcript?: MeetingTranscript;
  summary?: string;
}): MeetingExportModel {
  const { meeting, timeline, transcript, summary } = payload;
  const lines: MeetingExportLine[] = (transcript?.lines ?? []).map((l) => ({
    time: l.time,
    speaker: l.speaker,
    text: (l.text ?? "").trim(),
    startSec: l.startSec,
    endSec: l.words?.length
      ? Math.max(...l.words.map((w) => w.endSec))
      : undefined,
  }));

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
    cues: buildCues(lines),
  };
}

export function safeExportFileName(title: string) {
  return title.replace(/[^\w가-힣.\-]+/g, "_").slice(0, 80) || "meeting";
}
