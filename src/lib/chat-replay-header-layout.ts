/**
 * 채팅·다시듣기 상단 헤더: 겹치기 전 1줄, 부족하면 2줄+.
 * UI는 ResizeObserver로 실측하고, 이 모듈은 순수 판정·환경별 본문폭만 담당.
 */

import {
  SIDEBAR_EXPANDED_WIDTH_REM,
  SIDEBAR_RAIL_MIN_WIDTH_PX,
  SIDEBAR_RAIL_WIDTH_REM,
} from "@/lib/sidebar-layout";

/** 제목 슬롯이 이보다 좁아지면 1줄로 두지 않음 (truncate만으로 버티지 않음). */
export const CHAT_REPLAY_TITLE_MIN_WIDTH_PX = 140;

/** 스택↔1줄 전환 시 깜빡임 완화 */
export const CHAT_REPLAY_HEADER_HYSTERESIS_PX = 24;

/** PageContainer 좌우 패딩 합(대략 px-4 / sm:px-6). */
export const CHAT_REPLAY_PAGE_PAD_PX = 32;
export const CHAT_REPLAY_PAGE_PAD_SM_PX = 48;

export type ChatReplayHeaderMode = "single" | "stacked";

export type ChatReplayHeaderMeasure = {
  containerWidth: number;
  leadingWidth: number;
  trailingWidth: number;
  /** 기본 CHAT_REPLAY_TITLE_MIN_WIDTH_PX */
  titleMinWidth?: number;
  gapPx?: number;
};

export function chatReplayHeaderNeededWidth(
  m: ChatReplayHeaderMeasure,
): number {
  const titleMin = m.titleMinWidth ?? CHAT_REPLAY_TITLE_MIN_WIDTH_PX;
  const gap = m.gapPx ?? 12;
  return m.leadingWidth + m.trailingWidth + titleMin + gap * 2;
}

/** 실측 폭으로 1줄/스택 판정. */
export function resolveChatReplayHeaderMode(
  m: ChatReplayHeaderMeasure,
  prev?: ChatReplayHeaderMode,
): ChatReplayHeaderMode {
  const needed = chatReplayHeaderNeededWidth(m);
  const w = m.containerWidth;
  if (prev === "stacked") {
    return w >= needed + CHAT_REPLAY_HEADER_HYSTERESIS_PX
      ? "single"
      : "stacked";
  }
  return w >= needed ? "single" : "stacked";
}

export type ChatReplayEnv = {
  id: string;
  viewportWidth: number;
  /** md 미만은 드로어(오프셋 없음) */
  sidebar: "none" | "rail" | "pinned";
};

/** 대표 뷰포트·사이드바 조합 (동적 렌더 판정용). */
export const CHAT_REPLAY_LAYOUT_ENVS: ChatReplayEnv[] = [
  { id: "mobile-375", viewportWidth: 375, sidebar: "none" },
  { id: "mobile-390", viewportWidth: 390, sidebar: "none" },
  { id: "mobile-430", viewportWidth: 430, sidebar: "none" },
  { id: "tablet-768-rail", viewportWidth: 768, sidebar: "rail" },
  { id: "tablet-820-rail", viewportWidth: 820, sidebar: "rail" },
  { id: "laptop-1024-rail", viewportWidth: 1024, sidebar: "rail" },
  { id: "laptop-1024-pinned", viewportWidth: 1024, sidebar: "pinned" },
  { id: "desktop-1280-rail", viewportWidth: 1280, sidebar: "rail" },
  { id: "desktop-1280-pinned", viewportWidth: 1280, sidebar: "pinned" },
  { id: "desktop-1440-rail", viewportWidth: 1440, sidebar: "rail" },
  { id: "desktop-1440-pinned", viewportWidth: 1440, sidebar: "pinned" },
];

function remToPx(rem: number, root = 16): number {
  return rem * root;
}

/** 사이드바·패딩을 뺀 채팅 헤더 컨테이너 폭. */
export function chatReplayContentWidth(env: ChatReplayEnv): number {
  const pad =
    env.viewportWidth >= 640
      ? CHAT_REPLAY_PAGE_PAD_SM_PX
      : CHAT_REPLAY_PAGE_PAD_PX;
  let sidebar = 0;
  if (env.viewportWidth >= SIDEBAR_RAIL_MIN_WIDTH_PX) {
    if (env.sidebar === "rail") {
      sidebar = remToPx(SIDEBAR_RAIL_WIDTH_REM);
    } else if (env.sidebar === "pinned") {
      sidebar = remToPx(SIDEBAR_EXPANDED_WIDTH_REM);
    }
  }
  return Math.max(0, env.viewportWidth - sidebar - pad);
}

/** 도구 줄 대략 폭(아이콘 버튼). md+는 LIVE·포커스 포함. */
export function estimateChatReplayTrailingWidth(opts: {
  viewportWidth: number;
  canEdit: boolean;
}): number {
  const btn = opts.viewportWidth >= 768 ? 40 : 48;
  const gap = 6;
  // 모바일: mask + download + share + more (+ edit)
  // 데스크톱: LIVE + focus + mask + download + share (+ edit)
  const count =
    (opts.viewportWidth >= 768 ? 5 : 4) + (opts.canEdit ? 1 : 0);
  return count * btn + (count - 1) * gap;
}

export const CHAT_REPLAY_LEADING_WIDTH_PX = 112; // 돌아가기
