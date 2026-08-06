/**
 * 사이드바 레이아웃·핀 규칙.
 *
 * - rail: 본문은 레일(4.5rem)만 예약. 아이콘만.
 * - pinned(>>): aside 가 static in-flow w-60 으로 본문을 밀어 가리지 않음.
 * - mobile(< md): 레일 없음. 헤더 햄버거로 드로어 오버레이.
 * - 호버로 임시 펼침(peek) 없음. 펼침/접음은 상단 핀 버튼만.
 */

export const SIDEBAR_RAIL_WIDTH_REM = 4.5;
export const SIDEBAR_EXPANDED_WIDTH_REM = 15; // w-60

/** Tailwind `md` — 이 이상에서 레일/핀 유지, 미만은 모바일 드로어 */
export const SIDEBAR_RAIL_MIN_WIDTH_PX = 768;

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
