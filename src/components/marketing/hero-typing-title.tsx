"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";

/** 열 폭·큰 글씨에서도 끝글자가 잘리지 않게 줄을 짧게 고정. */
const LINES = [
  "말만 하면 회의록,",
  "받아쓰기부터",
  "요약까지",
  "AI가.",
] as const;

const FULL = LINES.join("\n");
const START_MS = 280;
const STEP_MS = 55;

/**
 * 히어로 타이틀 — 마운트마다 한 글자씩 타이핑.
 * 레이아웃은 전체 문구로 높이를 고정하고, 타이핑은 absolute 오버레이로 올린다.
 * 백그라운드 탭에서 끊기면 빈 영역이 남지 않게 전체 문구로 복구한다.
 */
export function HeroTypingTitle() {
  const reduceMotion = usePrefersReducedMotion();
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);
  const startedAtRef = useRef(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (reduceMotion) {
      setCount(FULL.length);
      setDone(true);
      doneRef.current = true;
      return;
    }

    let cancelled = false;
    let raf = 0;
    let finishTimer = 0;
    startedAtRef.current = 0;
    doneRef.current = false;
    setCount(0);
    setDone(false);

    const finish = () => {
      if (cancelled || doneRef.current) return;
      doneRef.current = true;
      setCount(FULL.length);
      setDone(true);
    };

    const tick = (now: number) => {
      if (cancelled || doneRef.current) return;
      if (document.visibilityState === "hidden") {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      if (!startedAtRef.current) {
        startedAtRef.current = now;
      }
      const elapsed = now - startedAtRef.current;
      if (elapsed < START_MS) {
        raf = window.requestAnimationFrame(tick);
        return;
      }
      const next = Math.min(
        FULL.length,
        Math.floor((elapsed - START_MS) / STEP_MS) + 1,
      );
      setCount((prev) => (prev === next ? prev : next));
      if (next >= FULL.length) {
        finishTimer = window.setTimeout(finish, 180);
        return;
      }
      raf = window.requestAnimationFrame(tick);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      // 탭 전환으로 프레임이 끊기면 빈 히어로가 남지 않게 바로 완성한다.
      if (startedAtRef.current > 0) finish();
    };

    raf = window.requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.clearTimeout(finishTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reduceMotion]);

  const typedLines = FULL.slice(0, count).split("\n");

  return (
    <h1 className="text-hero relative grid w-full break-keep text-5xl font-bold text-foreground xl:text-7xl">
      <span className="invisible block" aria-hidden>
        {LINES.map((line, i) => (
          <Fragment key={i}>
            {i > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))}
      </span>
      <span className="absolute inset-0 block" aria-label={LINES.join(" ")}>
        {typedLines.map((line, i) => (
          <Fragment key={i}>
            {i > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))}
        {!done ? <span className="hero-caret" aria-hidden>|</span> : null}
      </span>
    </h1>
  );
}
