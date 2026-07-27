"use client";

import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";

import { getScrollParent } from "@/lib/scroll-in-container";

let spySuspendedUntil = 0;
const scrollNotifiers = new Set<() => void>();

/** 목차 클릭 등 프로그램 스크롤 동안 추적 일시 중지. */
export function suspendDocsSectionSpy(ms = 700) {
  spySuspendedUntil = Math.max(spySuspendedUntil, performance.now() + ms);
}

/** 스크롤 컨테이너 onScroll에서 호출. addEventListener 누락 보완. */
export function notifyDocsSectionScroll() {
  for (const notify of scrollNotifiers) notify();
}

/**
 * 스크롤 뷰포트 상단 기준 마커선 아래에 들어온 마지막 섹션 = 현재 섹션.
 * 항상 정확히 하나. 문서 끝으로 갈수록 마커를 내려 짧은 마지막 섹션도 잡는다.
 */
export function resolveActiveSectionId(
  sectionEls: HTMLElement[],
  options?: { root?: HTMLElement | null; markerRatio?: number },
): string | null {
  if (sectionEls.length === 0) return null;

  const root = options?.root ?? null;
  const baseRatio = options?.markerRatio ?? 0.28;
  const rootTop = root ? root.getBoundingClientRect().top : 0;
  const rootHeight = root ? root.clientHeight : window.innerHeight;
  const scrollTop = root ? root.scrollTop : window.scrollY;
  const scrollHeight = root
    ? root.scrollHeight
    : document.documentElement.scrollHeight;

  const remaining = Math.max(0, scrollHeight - (scrollTop + rootHeight));
  const adaptSpan = Math.max(120, rootHeight * 0.55);
  const t = remaining >= adaptSpan ? 0 : 1 - remaining / adaptSpan;
  // 끝으로 갈수록 0.28 → 0.88 로 마커 하강
  const markerRatio = baseRatio + t * (0.88 - baseRatio);
  const markerY = rootTop + rootHeight * markerRatio;

  let active: HTMLElement | null = null;
  for (const el of sectionEls) {
    if (el.getBoundingClientRect().top <= markerY) {
      active = el;
    } else if (active) {
      break;
    }
  }

  return (active ?? sectionEls[0])!.id;
}

/** 문서 목차 스크롤 추적. 섹션 경계로 activeId를 확정한다. */
export function useDocsSectionSpy(
  sectionIds: string[],
  setActiveId: Dispatch<SetStateAction<string>>,
  enabled: boolean,
  rootRef?: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!enabled || sectionIds.length === 0) return;
    setActiveId((prev) => (sectionIds.includes(prev) ? prev : sectionIds[0]!));
  }, [enabled, sectionIds, setActiveId]);

  useEffect(() => {
    if (!enabled || sectionIds.length === 0) return;

    const nodes = sectionIds
      .map((id) => document.getElementById(id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0) return;

    const root = rootRef?.current ?? getScrollParent(nodes[0]!) ?? null;
    let frame = 0;

    const update = () => {
      frame = 0;
      if (performance.now() < spySuspendedUntil) return;
      const id = resolveActiveSectionId(nodes, { root });
      if (!id) return;
      setActiveId((prev) => (prev === id ? prev : id));
    };

    const onScroll = () => {
      if (performance.now() < spySuspendedUntil) return;
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(update);
    };

    update();
    scrollNotifiers.add(onScroll);
    const target: HTMLElement | Window = root ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollNotifiers.delete(onScroll);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [enabled, rootRef, sectionIds, setActiveId]);
}
