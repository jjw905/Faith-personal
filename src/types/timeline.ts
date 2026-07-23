export type TimelineSegmentKind =
  | "agenda"
  | "discussion"
  | "decision"
  | "action"
  | "risk"
  | "report"
  | "vote";

export type TimelineSegment = {
  id: string;
  start: string;
  end: string;
  title: string;
  summary: string;
  kind: TimelineSegmentKind;
  speakers?: string[];
  tags?: string[];
};

export type MeetingTimeline = {
  meetingId: string;
  durationLabel: string;
  /** 회의 한 줄 개요 (부드러운 문장). */
  overallSummary: string;
  /** 결정·의결 목록. */
  decisions?: string[];
  /** 후속 액션. */
  actions?: Array<{
    owner: string;
    task: string;
    due?: string;
  }>;
  segments: TimelineSegment[];
};
