"use client";

import { useSyncExternalStore } from "react";

const MD_UP_QUERY = "(min-width: 768px)";
const DESIGN_STAGE = "[data-faith-design-viewport]";

/**
 * md 이상 여부.
 * 디자인 랩·미리보기 스테이지가 있으면 브라우저 창이 아니라
 * `data-faith-design-width` / 스테이지 폭을 본다 (@container 와 맞춤).
 */
function designStageWidth(): number | null {
  if (typeof document === "undefined") return null;
  const stage = document.querySelector(DESIGN_STAGE);
  if (!(stage instanceof HTMLElement)) return null;
  const attr = stage.getAttribute("data-faith-design-width");
  const fromAttr = attr ? Number(attr) : NaN;
  if (Number.isFinite(fromAttr) && fromAttr > 0) return fromAttr;
  return stage.clientWidth || null;
}

function readMdUp(): boolean {
  const w = designStageWidth();
  if (w != null) return w >= 768;
  return window.matchMedia(MD_UP_QUERY).matches;
}

function subscribeMdUp(onChange: () => void) {
  const mq = window.matchMedia(MD_UP_QUERY);
  const onMq = () => onChange();
  mq.addEventListener("change", onMq);

  const stage = document.querySelector(DESIGN_STAGE);
  let ro: ResizeObserver | null = null;
  if (stage instanceof HTMLElement) {
    ro = new ResizeObserver(() => onChange());
    ro.observe(stage);
  }

  const onStorage = (e: StorageEvent) => {
    if (e.key === "faith.design-viewport") onChange();
  };
  window.addEventListener("storage", onStorage);

  // 뷰포트 피커 클릭 직후 attribute 반영
  const onAttr = () => onChange();
  if (stage) {
    const mo = new MutationObserver(onAttr);
    mo.observe(stage, { attributes: true, attributeFilter: ["data-faith-design-width"] });
    return () => {
      mq.removeEventListener("change", onMq);
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }

  return () => {
    mq.removeEventListener("change", onMq);
    ro?.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

export function useMdUp(): boolean {
  return useSyncExternalStore(subscribeMdUp, readMdUp, () => false);
}

/** max-md (폭 < 768) — 디자인 스테이지 우선. */
export function useMaxMd(): boolean {
  return !useMdUp();
}
