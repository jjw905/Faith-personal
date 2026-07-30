export type RealtimeUtterance = {
  itemId: string;
  text: string;
  /** 스트림상 시작(초). server_vad면 발화 감지 시각, 아니면 커밋 창 시작. */
  startSec: number;
  /** 발화 끝(초). server_vad에서만 실측값이 들어온다. */
  endSec?: number;
  meanLogprob?: number;
  confidence?: number;
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
  /** 전사 결과를 못 받고 버린 발화 수. 0이 아니면 뒷부분이 빠졌다는 뜻. */
  droppedTurns: number;
  /** 과금 대상으로 전송한 오디오 초. 무음 스킵 시 durationSec보다 작다. */
  billedAudioSec: number;
};

export const REALTIME_SESSION_MODEL = "gpt-realtime-2.1" as const;
/** 스트리밍 전용 모델. 지연은 낮지만 단가가 높다. */
export const REALTIME_STT_WHISPER = "gpt-realtime-whisper" as const;
/** server_vad 턴 감지로 쓰는 저비용 모델. */
export const REALTIME_STT_MINI = "gpt-4o-mini-transcribe" as const;

export type RealtimeSttModel =
  | typeof REALTIME_STT_WHISPER
  | typeof REALTIME_STT_MINI;

/** 추정 단가 USD/분. */
export const REALTIME_STT_USD_PER_MINUTE: Record<RealtimeSttModel, number> = {
  [REALTIME_STT_WHISPER]: 0.017,
  [REALTIME_STT_MINI]: 0.003,
};

export const DEFAULT_REALTIME_STT_MODEL: RealtimeSttModel = REALTIME_STT_MINI;

/** 이전 이름 호환. */
export const REALTIME_STT_MODEL = REALTIME_STT_WHISPER;
export const REALTIME_STT_MODEL_VAD = REALTIME_STT_MINI;
