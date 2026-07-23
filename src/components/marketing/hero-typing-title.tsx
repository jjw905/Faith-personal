"use client";

import { useEffect, useRef, useState } from "react";

const LINE1 = "안전한 회의진행,";
const LINE2 = "음성 텍스트 추출도 알아서.";
const FULL = `${LINE1}\n${LINE2}`;

const START_MS = 300;
const STEP_MS = 60;

/**
 * 히어로 타이틀 — 마운트(새로고침)마다 한 글자씩 타이핑.
 * 채팅 목업도 마운트마다 재생되므로 새로고침 시 함께 다시 시작한다.
 */
export function HeroTypingTitle() {
  const [count, setCount] = useState(0);
  const [done, setDone] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setCount(FULL.length);
      setDone(true);
      return;
    }

    setCount(0);
    setDone(false);
    for (let i = 1; i <= FULL.length; i++) {
      timers.current.push(
        window.setTimeout(() => setCount(i), START_MS + i * STEP_MS),
      );
    }
    timers.current.push(
      window.setTimeout(
        () => setDone(true),
        START_MS + FULL.length * STEP_MS + 250,
      ),
    );

    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, []);

  const typed = FULL.slice(0, count);
  const [t1, t2 = ""] = typed.split("\n");
  const inSecondLine = typed.includes("\n");

  return (
    <h1 className="text-hero relative text-5xl font-bold text-foreground xl:text-7xl">
      {/* 높이 고정용 (레이아웃 흔들림 방지) */}
      <span className="invisible block" aria-hidden>
        {LINE1}
        <br />
        {LINE2}
      </span>
      {/* 실제 타이핑 텍스트 */}
      <span className="absolute inset-0 block" aria-label={`${LINE1} ${LINE2}`}>
        {t1}
        {inSecondLine ? <br /> : null}
        {t2}
        {!done ? <span className="hero-caret" aria-hidden>|</span> : null}
      </span>
    </h1>
  );
}
