/**
 * 말풍선 인플레이스 편집 — 클릭 시 크기 고정 규칙.
 * UI는 이 값으로 width/height/min/max 를 한꺼번에 잠근다.
 */

export type BubbleEditLockSize = {
  w: number;
  h: number;
};

export function lockBubbleEditSize(rect: {
  width: number;
  height: number;
}): BubbleEditLockSize {
  // ceil 하면 354.3→355 처럼 눈에 띄게 커질 수 있어 반올림 유지
  return {
    w: Math.max(1, Math.round(rect.width)),
    h: Math.max(1, Math.round(rect.height)),
  };
}

/** 편집 중 inline style — 늘어남 방지용 전방위 잠금 */
export function bubbleEditLockStyle(
  lock: BubbleEditLockSize,
): {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
  boxSizing: "border-box";
} {
  return {
    width: lock.w,
    height: lock.h,
    minWidth: lock.w,
    minHeight: lock.h,
    maxWidth: lock.w,
    maxHeight: lock.h,
    boxSizing: "border-box",
  };
}

export function canStartBubbleTextEdit(input: {
  canEditText: boolean;
  hasText: boolean;
  playing: boolean;
  editingMemo: boolean;
}): boolean {
  return Boolean(
    input.canEditText &&
      input.hasText &&
      !input.playing &&
      !input.editingMemo,
  );
}

/** 잠금 크기가 유지되는지 (허용 오차 0 — 정수 px 잠금) */
export function bubbleEditSizeUnchanged(
  before: BubbleEditLockSize,
  after: { width: number; height: number },
): boolean {
  return (
    Math.ceil(after.width) === before.w &&
    Math.ceil(after.height) === before.h
  );
}
