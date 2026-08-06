/**
 * 히어로 타이틀 타이핑 — 순수 로직 (시나리오 테스트용).
 * UI/rAF와 분리해 임베드·탭 전환·모션 감소를 같은 규칙으로 검증한다.
 */

export const HERO_TITLE_LINES = [
  "말만 하면 회의록,",
  "받아쓰기부터",
  "요약까지",
  "AI가.",
] as const;

export const HERO_TITLE_FULL = HERO_TITLE_LINES.join("\n");

export const HERO_TYPE_START_MS = 280;
export const HERO_TYPE_STEP_MS = 55;
/** 마지막 글자 후 커서 유지 시간 */
export const HERO_TYPE_HOLD_MS = 180;

export type HeroTypingPhase = "idle" | "typing" | "done";

export type HeroTypingSnapshot = {
  count: number;
  done: boolean;
  phase: HeroTypingPhase;
  showCaret: boolean;
  visibleText: string;
};

/** 경과 시간 → 표시할 글자 수 (모션 허용 시). */
export function heroTypedCountAt(
  elapsedMs: number,
  fullLength = HERO_TITLE_FULL.length,
): number {
  if (elapsedMs < HERO_TYPE_START_MS) return 0;
  const steps =
    Math.floor((elapsedMs - HERO_TYPE_START_MS) / HERO_TYPE_STEP_MS) + 1;
  return Math.min(fullLength, Math.max(0, steps));
}

/** 타이핑이 논리적으로 끝나는 경과 시각. */
export function heroTypingDoneAtMs(
  fullLength = HERO_TITLE_FULL.length,
): number {
  if (fullLength <= 0) return HERO_TYPE_START_MS + HERO_TYPE_HOLD_MS;
  return (
    HERO_TYPE_START_MS +
    (fullLength - 1) * HERO_TYPE_STEP_MS +
    HERO_TYPE_HOLD_MS
  );
}

/**
 * 스냅샷 계산.
 * - reduceMotion / forceComplete → 즉시 완성 (커서 없음)
 * - 그 외 elapsed 기반
 */
export function heroTypingSnapshot(opts: {
  elapsedMs: number;
  reduceMotion?: boolean;
  forceComplete?: boolean;
  full?: string;
}): HeroTypingSnapshot {
  const full = opts.full ?? HERO_TITLE_FULL;

  if (opts.reduceMotion || opts.forceComplete) {
    return {
      count: full.length,
      done: true,
      phase: "done",
      showCaret: false,
      visibleText: full,
    };
  }

  const count = heroTypedCountAt(opts.elapsedMs, full.length);
  const doneAt = heroTypingDoneAtMs(full.length);

  if (opts.elapsedMs >= doneAt) {
    return {
      count: full.length,
      done: true,
      phase: "done",
      showCaret: false,
      visibleText: full,
    };
  }

  if (count === 0) {
    return {
      count: 0,
      done: false,
      phase: "idle",
      showCaret: true,
      visibleText: "",
    };
  }

  return {
    count,
    done: false,
    phase: "typing",
    showCaret: true,
    visibleText: full.slice(0, count),
  };
}

/** 화면에 그릴 줄 배열. */
export function heroTypingLines(visibleText: string): string[] {
  if (visibleText.length === 0) return [""];
  return visibleText.split("\n");
}
