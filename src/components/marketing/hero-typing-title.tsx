"use client";

import { Fragment } from "react";

/** 열 폭·큰 글씨에서도 끝글자가 잘리지 않게 줄을 짧게 고정. */
const LINES = [
  "말만 하면 회의록,",
  "받아쓰기부터",
  "요약까지",
  "AI가.",
] as const;

/**
 * 히어로 타이틀.
 * 글자 단위 타이핑은 백그라운드 타이머/하이드레이션에서 멈추며
 * 큰 빈 영역만 남는 문제가 있어, 전체 문구를 바로 렌더한다.
 */
export function HeroTypingTitle() {
  return (
    <h1 className="text-hero grid w-full break-keep text-5xl font-bold text-foreground xl:text-7xl">
      <span className="block" aria-label={LINES.join(" ")}>
        {LINES.map((line, i) => (
          <Fragment key={i}>
            {i > 0 ? <br /> : null}
            {line}
          </Fragment>
        ))}
      </span>
    </h1>
  );
}
