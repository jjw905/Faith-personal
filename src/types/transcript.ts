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

/** 잘못 받아쓴 것으로 보이는 낱말과 추천. 본문은 고치지 않는다. */
export type TranscriptCorrection = {
  /** 본문에 있는 그대로의 구간 */
  wrong: string;
  suggestion: string;
  reason?: string;
  /** 발음 유사도 0~1 */
  similarity?: number;
  /** 원문 줄에서 추천 대상이 시작하고 끝나는 UTF-16 offset */
  startOffset?: number;
  endOffset?: number;
  /** 원문 후보가 사전 또는 사용자가 확인한 용어 관문을 통과했는지 */
  dictionaryVerified?: boolean;
  /** STT 토큰 logprob 평균. 파일 전사처럼 값이 없으면 생략 */
  sttLogprob?: number;
  /** 추천 후보 출처 */
  source?: "glossary" | "ourmalsam" | "second-pass";
};

/** 단어 하나의 실측 시각과, 본문(text) 안에서 그 단어가 있는 자리. */
export type TranscriptWordTiming = {
  text: string;
  startSec: number;
  endSec: number;
  /** 원문 줄에서 이 단어가 시작하고 끝나는 UTF-16 offset */
  startOffset: number;
  endOffset: number;
};

/** 회의 다시보기용 대화 한 줄. */
export type TranscriptLine = {
  id: string;
  /** 경과 시각 (예: 00:12, 01:05:20) */
  time: string;
  /**
   * 소수점까지 살린 시작 시각(초). 재생 동기화는 이 값을 쓴다.
   * time은 초 단위로 내림한 표시용이라 늘 0~1초 먼저 넘어간다.
   */
  startSec?: number;
  speaker: string;
  /** 본문. 첨부만 있는 줄은 비울 수 있음. */
  text?: string;
  attachment?: TranscriptAttachment;
  /** 타임라인 구간 id — 점프 연동용 */
  segmentId?: string;
  /** 오인식 보정 추천 (표시만) */
  corrections?: TranscriptCorrection[];
  /** 이 대사에 남긴 메모 */
  memo?: string;
  /** 단어 단위 실측 시각 (있으면 재생 중 단어 하이라이트에 쓴다) */
  words?: TranscriptWordTiming[];
};

export type MeetingTranscript = {
  meetingId: string;
  lines: TranscriptLine[];
};
