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
  /** 소수점까지 살린 경계(초). start, end는 내림한 표시용이다. */
  startSec?: number;
  endSec?: number;
  title: string;
  summary: string;
  kind: TimelineSegmentKind;
  speakers?: string[];
  /** 구간 핵심 짚기. */
  points?: string[];
  /** 이 구간에서 화자가 무엇을 말했는지. */
  speakerNotes?: Array<{ name: string; said: string }>;
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
