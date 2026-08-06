"use client";

import { Fragment, useEffect, useRef, useState } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  HERO_TITLE_FULL,
  HERO_TITLE_LINES,
  heroTypingLines,
  heroTypingSnapshot,
} from "@/lib/marketing/hero-typing";
import { cn } from "@/lib/utils";

/**
 * 히어로 타이틀 — 마운트마다 「… AI가.」까지 한 글자씩 타이핑.
 * 레이아웃은 전체 문구로 높이를 고정하고, 타이핑은 absolute 오버레이.
 * 탭 숨김·임베드 끊김 시 빈 "|"만 남지 않게 즉시 완성한다.
 */
export function HeroTypingTitle() {
  const reduceMotion = usePrefersReducedMotion();
  const [visibleText, setVisibleText] = useState(
    reduceMotion ? HERO_TITLE_FULL : "",
  );
  const [showCaret, setShowCaret] = useState(!reduceMotion);
  const startedAtRef = useRef(0);
  const doneRef = useRef(reduceMotion);

  useEffect(() => {
    if (reduceMotion) {
      doneRef.current = true;
      setVisibleText(HERO_TITLE_FULL);
      setShowCaret(false);
      return;
    }

    let cancelled = false;
    let raf = 0;
    startedAtRef.current = 0;
    doneRef.current = false;
    setVisibleText("");
    setShowCaret(true);

    const apply = (snap: ReturnType<typeof heroTypingSnapshot>) => {
      setVisibleText(snap.visibleText);
      setShowCaret(snap.showCaret);
      if (snap.done) doneRef.current = true;
    };

    const finish = () => {
      if (cancelled || doneRef.current) return;
      apply(heroTypingSnapshot({ elapsedMs: 0, forceComplete: true }));
    };

    const tick = (now: number) => {
      if (cancelled || doneRef.current) return;
      if (document.visibilityState === "hidden") {
        // 백그라운드에서 프레임이 끊겨도 빈 히어로가 남지 않게 다음 틱에서 이어감
        raf = window.requestAnimationFrame(tick);
        return;
      }
      if (!startedAtRef.current) startedAtRef.current = now;
      const elapsed = now - startedAtRef.current;
      const snap = heroTypingSnapshot({ elapsedMs: elapsed });
      apply(snap);
      if (snap.done) return;
      raf = window.requestAnimationFrame(tick);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible" || cancelled) return;
      // 탭 전환으로 타이밍이 어긋나면 빈 "|" 방지 — 바로 완성
      if (startedAtRef.current > 0 && !doneRef.current) finish();
    };

    raf = window.requestAnimationFrame(tick);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisible);
      // 언마운트·HMR 도중 빈 커서만 남지 않게
      if (!doneRef.current) {
        doneRef.current = true;
      }
    };
  }, [reduceMotion]);

  const typedLines = heroTypingLines(visibleText);

  return (
    <h1
      className={cn(
        "faith-hero-title relative grid w-full break-keep text-4xl font-bold text-foreground sm:text-5xl xl:text-7xl",
        reduceMotion && "hero-title-enter",
      )}
      aria-label={HERO_TITLE_LINES.join(" ")}
    >
      <span className="invisible col-start-1 row-start-1 block" aria-hidden>
        {HERO_TITLE_LINES.map((line, i) => (
          <Fragment key={`s-${i}`}>
            {i > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))}
      </span>
      <span className="col-start-1 row-start-1 block" aria-hidden>
        {typedLines.map((line, i) => (
          <Fragment key={`t-${i}`}>
            {i > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))}
        {showCaret ? (
          <span className="hero-caret" aria-hidden>
            |
          </span>
        ) : null}
      </span>
    </h1>
  );
}
