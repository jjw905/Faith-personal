"use client";

import { CtaButton } from "@/components/marketing/cta-button";
import { HeroTypingTitle } from "@/components/marketing/hero-typing-title";

/** 히어로 좌측 카피 + CTA. */
export function HeroIntro() {
  return (
    <div className="max-w-2xl">
      <HeroTypingTitle />

      <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted max-md:mt-9 xl:mt-8 xl:text-xl">
        Faith가 화자 구분 받아쓰기, 요약, 타임라인까지 한 번에.
        <br />
        개인정보 마스킹은 부가로 따라옵니다.
      </p>
      <div className="mt-9 flex flex-wrap items-center gap-3 max-md:mt-10 xl:mt-10 xl:gap-5">
        <CtaButton
          href="/signup"
          className="min-h-12 rounded-2xl px-7 py-3.5 text-base shadow-soft xl:min-h-14 xl:rounded-[1.25rem] xl:px-10 xl:py-5 xl:text-xl"
        >
          시작하기
        </CtaButton>
      </div>
    </div>
  );
}
