"use client";

import { CtaButton } from "@/components/marketing/cta-button";
import { HeroTypingTitle } from "@/components/marketing/hero-typing-title";

/** 히어로 좌측 카피 + CTA. */
export function HeroIntro() {
  return (
    <div className="max-w-2xl">
      <HeroTypingTitle />

      <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted max-md:mt-9 xl:mt-8 xl:text-xl">
        회의의 핵심을 더 빠르게.
        <br />
        화자 구분 받아쓰기부터 요약·타임라인까지 Faith가 자동으로 정리합니다.
      </p>
      <div className="mt-9 flex flex-wrap items-center gap-3 max-md:mt-10 xl:mt-10 xl:gap-5">
        <CtaButton
          href="/signup"
          className="min-h-12 rounded-2xl px-7 py-3.5 text-base shadow-soft xl:min-h-14 xl:rounded-[1.25rem] xl:px-10 xl:py-5 xl:text-xl"
        >
          무료로 시작하기
        </CtaButton>
      </div>
    </div>
  );
}
