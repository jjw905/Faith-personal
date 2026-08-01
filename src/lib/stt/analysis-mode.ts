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

/**
 * 분석 방식 UI 카피.
 * 모드 라벨은 짧은 제품어("화자 구분"), 보조 문구에서 결과(누가 말했는지)를 설명한다.
 */
export const ANALYSIS_MODE_COPY: Record<
  AnalysisMode,
  { label: string; costHint: string; benefit: string }
> = {
  standard: {
    label: "빠른 정리",
    costHint: "1분 → 1분",
    benefit: "요약과 타임라인으로 빠르게 정리합니다.",
  },
  precision: {
    label: "화자 구분",
    costHint: "1분 → 1.5분",
    benefit: "누가 말했는지 나눠 말풍선처럼 기록합니다.",
  },
};

export const ANALYSIS_MODE_ARIA_LABEL = "정리 방식";
