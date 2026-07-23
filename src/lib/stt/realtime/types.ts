export type RealtimeUtterance = {
  itemId: string;
  text: string;
  /** 스트림상 대략 시작(초). 커밋 시점 기준. */
  startSec: number;
  completedAtMs: number;
};

export type RealtimeTranscribeProgress = {
  partialText: string;
  utterances: RealtimeUtterance[];
  audioSentSec: number;
};

export type RealtimeTranscribeResult = {
  model: string;
  language: string;
  durationSec: number;
  utterances: RealtimeUtterance[];
  text: string;
  firstDeltaMs: number | null;
  wallMs: number;
  estimatedUsd: number;
  eventCounts: Record<string, number>;
};

export const REALTIME_SESSION_MODEL = "gpt-realtime-2.1" as const;
export const REALTIME_STT_MODEL = "gpt-realtime-whisper" as const;
/** VAD 지원 대안 (intent=transcription + server_vad). */
export const REALTIME_STT_MODEL_VAD = "gpt-4o-mini-transcribe" as const;
/** 추정 단가 USD/분 (공식 가이드 근사). */
export const REALTIME_STT_USD_PER_MINUTE = 0.017;
