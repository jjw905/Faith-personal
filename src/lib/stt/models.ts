export const STT_MODELS = [
  "gpt-transcribe",
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "whisper-1",
] as const;

export type SttModel = (typeof STT_MODELS)[number];

export const DEFAULT_STT_MODEL: SttModel = "gpt-4o-mini-transcribe";

export const STT_MODEL_LABELS: Record<SttModel, string> = {
  "gpt-transcribe": "GPT Transcribe",
  "gpt-4o-mini-transcribe": "4o-mini",
  "gpt-4o-transcribe": "4o",
  "whisper-1": "whisper",
};

export function isSttModel(value: string): value is SttModel {
  return (STT_MODELS as readonly string[]).includes(value);
}
