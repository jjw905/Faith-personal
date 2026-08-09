/**
 * 사이드바 레이아웃·핀 규칙.
 *
 * - rail: 본문은 레일(4.5rem)만 예약. 아이콘만.
 * - pinned(>>): aside 가 static in-flow w-60 으로 본문을 밀어 가리지 않음.
 * - mobile: 터치·좁은 뷰에서만. 헤더 햄버거 드로어.
 * - 정밀 포인터(데스크톱): 창이 좁아도 레일/핀 유지 (셸 min-width + 가로 스크롤).
 * - 호버로 임시 펼침(peek) 없음. 펼침/접음은 상단 핀 버튼만.
 */

export const SIDEBAR_RAIL_WIDTH_REM = 4.5;
export const SIDEBAR_EXPANDED_WIDTH_REM = 15; // w-60

/** Tailwind `md` — 터치 환경에서 이 이상이면 레일/핀, 미만은 모바일 드로어 */
export const SIDEBAR_RAIL_MIN_WIDTH_PX = 768;

/** 데스크톱 셸 바닥 (lg / 1024px). `.faith-desktop-shell` 과 동일. */
export const DESKTOP_SHELL_MIN_WIDTH_PX = 1024;

export const DESKTOP_POINTER_QUERY = "(pointer: fine)";
export const MD_UP_QUERY = `(min-width: ${SIDEBAR_RAIL_MIN_WIDTH_PX}px)`;

/**
 * 데스크톱 크롬(레일/핀·md+ 레이아웃)을 쓸지.
 * - 디자인 랩 스테이지 폭이 있으면 그 폭 ≥ md
 * - 아니면 정밀 포인터면 true (창 폭과 무관)
 * - 아니면 뷰포트 ≥ md
 */
export function preferDesktopChrome(input?: {
  designStageWidthPx?: number | null;
  pointerFine?: boolean;
  viewportWidthPx?: number;
}): boolean {
  const stage = input?.designStageWidthPx;
  if (stage != null && Number.isFinite(stage) && stage > 0) {
    return stage >= SIDEBAR_RAIL_MIN_WIDTH_PX;
  }
  if (input?.pointerFine != null) {
    if (input.pointerFine) return true;
    const vw = input.viewportWidthPx ?? 0;
    return vw >= SIDEBAR_RAIL_MIN_WIDTH_PX;
  }
  if (typeof window === "undefined") return false;
  if (window.matchMedia(DESKTOP_POINTER_QUERY).matches) return true;
  return window.matchMedia(MD_UP_QUERY).matches;
}

export type SidebarVisualMode = "mobile" | "rail" | "pinned";

export type SidebarContentOffset = "none" | "rail" | "expanded";

export type SidebarVisualState = {
  mode: SidebarVisualMode;
  /** 본문이 비워 두는 왼쪽 폭 */
  contentOffset: SidebarContentOffset;
  /** 라벨·브랜드 등 펼침 크롬 */
  showExpandedChrome: boolean;
  /** flex in-flow 로 w-60 (pinned — 본문을 밀어 간섭 없음) */
  inFlowExpanded: boolean;
};

/**
 * collapsed=true → 레일(접힘)
 * collapsed=false → 핀 고정(본문 확보 + 펼침 유지)
 * isRailLayout=false → 모바일 드로어(오프셋 없음)
 */
export function resolveSidebarVisual(input: {
  isRailLayout: boolean;
  collapsed: boolean;
}): SidebarVisualState {
  const { isRailLayout, collapsed } = input;

  if (!isRailLayout) {
    return {
      mode: "mobile",
      contentOffset: "none",
      showExpandedChrome: true,
      inFlowExpanded: false,
    };
  }

  if (!collapsed) {
    return {
      mode: "pinned",
      contentOffset: "expanded",
      showExpandedChrome: true,
      inFlowExpanded: true,
    };
  }

  return {
    mode: "rail",
    contentOffset: "rail",
    showExpandedChrome: false,
    inFlowExpanded: false,
  };
}

/** 핀 토글: true=레일 선호, false=펼침 고정 */
export function nextCollapsedAfterPinToggle(collapsed: boolean): boolean {
  return !collapsed;
}

/** 본문과 사이드바 시각 영역이 겹치면 간섭 (모바일 드로어·레일·핀은 겹치지 않음) */
export function sidebarOverlapsMainContent(state: SidebarVisualState): boolean {
  if (state.mode === "mobile") return false;
  if (state.mode === "pinned") {
    return !state.inFlowExpanded || state.contentOffset !== "expanded";
  }
  // rail
  return state.contentOffset !== "rail" || state.inFlowExpanded;
}

/**
 * pinned 가 본문을 가리지 않는지 (in-flow + expanded offset).
 */
export function pinnedDoesNotCoverContent(state: SidebarVisualState): boolean {
  if (state.mode !== "pinned") return true;
  return state.inFlowExpanded && state.contentOffset === "expanded";
}
