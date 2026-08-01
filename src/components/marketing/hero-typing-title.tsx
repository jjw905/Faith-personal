"use client";

import { Fragment } from "react";

import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

/** 열 폭·큰 글씨에서도 끝글자가 잘리지 않게 줄을 짧게 고정. */
const LINES = [
  "말만 하면 회의록,",
  "받아쓰기부터",
  "요약까지",
  "AI가.",
] as const;

/**
 * 히어로 타이틀.
 * 타이핑 상태머신(rAF/setTimeout)이 임베드·HMR에서 빈 "|"만 남기는 문제가 있어
 * 완성 문구를 바로 두고, 모션은 CSS fade로만 준다.
 */
export function HeroTypingTitle() {
  const reduceMotion = usePrefersReducedMotion();

  return (
    <h1
      className={cn(
        "text-hero w-full break-keep text-5xl font-bold text-foreground xl:text-7xl",
        !reduceMotion && "hero-title-enter",
      )}
    >
      {LINES.map((line, i) => (
        <Fragment key={i}>
          {i > 0 ? <br /> : null}
          {line}
        </Fragment>
      ))}
    </h1>
  );
}
