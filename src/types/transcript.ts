/** 대화에 올라온 첨부파일. */
export type TranscriptAttachmentKind =
  | "audio"
  | "pdf"
  | "doc"
  | "sheet"
  | "image"
  | "slide"
  | "archive"
  | "code"
  | "file";

export type TranscriptAttachment = {
  name: string;
  sizeLabel: string;
  /** 표시용 종류. 없으면 확장자로 추론 */
  kind?: TranscriptAttachmentKind;
};

/** 회의 다시보기용 대화 한 줄. */
export type TranscriptLine = {
  id: string;
  /** 경과 시각 (예: 00:12, 01:05:20) */
  time: string;
  speaker: string;
  /** 본문. 첨부만 있는 줄은 비울 수 있음. */
  text?: string;
  attachment?: TranscriptAttachment;
  /** 타임라인 구간 id — 점프 연동용 */
  segmentId?: string;
};

export type MeetingTranscript = {
  meetingId: string;
  lines: TranscriptLine[];
};
