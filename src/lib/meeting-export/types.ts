/** 회의 내보내기 포맷 (1·2차). */
export type MeetingExportFormat =
  | "txt"
  | "md"
  | "json"
  | "csv"
  | "srt"
  | "vtt"
  | "docx"
  | "pdf";

export type MeetingExportCue = {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  speaker: string;
};

export type MeetingExportLine = {
  time: string;
  speaker: string;
  text: string;
  startSec?: number;
  endSec?: number;
};

export type MeetingExportSegment = {
  start: string;
  end: string;
  title: string;
  summary: string;
};

export type MeetingExportAction = {
  owner: string;
  task: string;
  due?: string;
};

/** 모든 포맷이 공유하는 정규화 모델. */
export type MeetingExportModel = {
  meetingId: string;
  title: string;
  date: string;
  duration: string;
  summary: string;
  decisions: string[];
  actions: MeetingExportAction[];
  segments: MeetingExportSegment[];
  lines: MeetingExportLine[];
  cues: MeetingExportCue[];
};
