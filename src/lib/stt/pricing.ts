import type { SttModel } from "@/lib/stt/models";

/** STT 분당 추정 단가 (USD). 토큰 usage가 없을 때 사용. */
export const STT_USD_PER_MINUTE: Record<SttModel, number> = {
  "gpt-4o-mini-transcribe": 0.003,
  "gpt-4o-transcribe": 0.006,
  "whisper-1": 0.006,
};

/** 4o-transcribe 계열 토큰 단가 (USD / 1M tokens). */
export const STT_TOKEN_USD_PER_1M: Record<
  Exclude<SttModel, "whisper-1">,
  { input: number; output: number }
> = {
  "gpt-4o-mini-transcribe": { input: 1.25, output: 5.0 },
  "gpt-4o-transcribe": { input: 2.5, output: 10.0 },
};

/** 구조화 고정 모델. */
export const STRUCTURE_MODEL = "gpt-4o-mini" as const;

/** gpt-4o-mini chat (USD / 1M tokens). */
export const STRUCTURE_USD_PER_1M = {
  input: 0.15,
  output: 0.6,
} as const;

export function estimateSttUsdFromMinutes(
  model: SttModel,
  durationSec: number,
): number {
  const minutes = Math.max(0, durationSec) / 60;
  return minutes * STT_USD_PER_MINUTE[model];
}

export function estimateSttUsdFromTokens(
  model: SttModel,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (model === "whisper-1") return null;
  const rate = STT_TOKEN_USD_PER_1M[model];
  return (
    (Math.max(0, inputTokens) / 1_000_000) * rate.input +
    (Math.max(0, outputTokens) / 1_000_000) * rate.output
  );
}

export function estimateStructureUsd(
  inputTokens: number,
  outputTokens: number,
): number {
  return (
    (Math.max(0, inputTokens) / 1_000_000) * STRUCTURE_USD_PER_1M.input +
    (Math.max(0, outputTokens) / 1_000_000) * STRUCTURE_USD_PER_1M.output
  );
}
