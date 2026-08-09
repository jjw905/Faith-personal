"use client";

import { useSyncExternalStore } from "react";

import {
  DESKTOP_POINTER_QUERY,
  MD_UP_QUERY,
  preferDesktopChrome,
  SIDEBAR_RAIL_MIN_WIDTH_PX,
} from "@/lib/sidebar-layout";

const DESIGN_STAGE = "[data-faith-design-viewport]";

/**
 * md 이상(데스크톱 크롬) 여부.
 * 디자인 랩 스테이지가 있으면 그 폭을 보고,
 * 없으면 정밀 포인터면 창 폭과 무관하게 true, 터치면 뷰포트 ≥ md.
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
  return preferDesktopChrome({
    designStageWidthPx: designStageWidth(),
  });
}

function subscribeMdUp(onChange: () => void) {
  const widthMq = window.matchMedia(MD_UP_QUERY);
  const pointerMq = window.matchMedia(DESKTOP_POINTER_QUERY);
  const onMq = () => onChange();
  widthMq.addEventListener("change", onMq);
  pointerMq.addEventListener("change", onMq);

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

  const onAttr = () => onChange();
  if (stage) {
    const mo = new MutationObserver(onAttr);
    mo.observe(stage, {
      attributes: true,
      attributeFilter: ["data-faith-design-width"],
    });
    return () => {
      widthMq.removeEventListener("change", onMq);
      pointerMq.removeEventListener("change", onMq);
      ro?.disconnect();
      mo.disconnect();
      window.removeEventListener("storage", onStorage);
    };
  }

  return () => {
    widthMq.removeEventListener("change", onMq);
    pointerMq.removeEventListener("change", onMq);
    ro?.disconnect();
    window.removeEventListener("storage", onStorage);
  };
}

export function useMdUp(): boolean {
  return useSyncExternalStore(subscribeMdUp, readMdUp, () => false);
}

/** max-md — 디자인 스테이지·포인터 규칙 포함. */
export function useMaxMd(): boolean {
  return !useMdUp();
}

export { SIDEBAR_RAIL_MIN_WIDTH_PX };
