export type TimelineSegmentKind =
  | "agenda"
  | "discussion"
  | "decision"
  | "action"
  | "risk";

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
  overallSummary: string;
  segments: TimelineSegment[];
};
