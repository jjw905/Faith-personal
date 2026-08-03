import type { SttModel } from "@/lib/stt/models";

export const ANALYSIS_MODES = ["standard", "precision"] as const;
export type AnalysisMode = (typeof ANALYSIS_MODES)[number];

export const DEFAULT_ANALYSIS_MODE: AnalysisMode = "standard";
/**
 * 정밀 모드는 본 전사+단어 시각+화자 분리를 함께 쓴다. KTV 실측 원가
 * $0.01317/오디오분과 연간 플랜의 최저 분당 매출을 함께 감안해 2배 차감한다.
 */
export const PRECISION_USAGE_MULTIPLIER = 2;

export type AnalysisModePolicy = {
  model: SttModel;
  usageMultiplier: number;
  speakerSplit: boolean;
  forcedAlignment: boolean;
  /** 재생 중 단어 단위 강조. 빠른 정리는 문장 시각만 받아 원가/지연을 줄인다. */
  wordTimestamps: boolean;
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
    wordTimestamps: false,
  },
  precision: {
    model: "gpt-transcribe",
    usageMultiplier: PRECISION_USAGE_MULTIPLIER,
    speakerSplit: true,
    // 단어 시각은 병렬 whisper 타이밍 패스에서 이미 받는다. CPU WhisperX가
    // 같은 오디오를 다시 훑어 결과를 덮는 경로는 지연만 크게 늘려 끈다.
    forcedAlignment: false,
    wordTimestamps: true,
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
    costHint: "1분 → 2분",
    benefit: "누가 말했는지 나눠 말풍선처럼 기록합니다.",
  },
};

export const ANALYSIS_MODE_ARIA_LABEL = "정리 방식";
