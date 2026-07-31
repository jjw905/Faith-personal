import type { SttModel } from "@/lib/stt/models";

export const ANALYSIS_MODES = ["standard", "precision"] as const;
export type AnalysisMode = (typeof ANALYSIS_MODES)[number];

export const DEFAULT_ANALYSIS_MODE: AnalysisMode = "standard";
export const PRECISION_USAGE_MULTIPLIER = 1.5;

export type AnalysisModePolicy = {
  model: SttModel;
  usageMultiplier: number;
  speakerSplit: boolean;
  forcedAlignment: boolean;
};

export const ANALYSIS_MODE_POLICY: Record<
  AnalysisMode,
  AnalysisModePolicy
> = {
  standard: {
    model: "gpt-4o-mini-transcribe",
    usageMultiplier: 1,
    speakerSplit: false,
    forcedAlignment: false,
  },
  precision: {
    model: "gpt-transcribe",
    usageMultiplier: PRECISION_USAGE_MULTIPLIER,
    speakerSplit: true,
    forcedAlignment: true,
  },
};

export function parseAnalysisMode(value: unknown): AnalysisMode {
  return value === "precision" ? "precision" : DEFAULT_ANALYSIS_MODE;
}

export function chargedUsageSec(
  durationSec: number,
  mode: AnalysisMode,
): number {
  const safeDuration = Number.isFinite(durationSec)
    ? Math.max(0, durationSec)
    : 0;
  return Math.ceil(
    safeDuration * ANALYSIS_MODE_POLICY[mode].usageMultiplier,
  );
}
