"use client";

import { CtaButton } from "@/components/marketing/cta-button";
import { HeroTypingTitle } from "@/components/marketing/hero-typing-title";

/** 히어로 좌측 카피 + CTA. */
export function HeroIntro() {
  return (
    <div className="max-w-2xl">
      <HeroTypingTitle />

      <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted xl:mt-8 xl:text-xl">
        개인정보 누출 걱정없이 회의를 진행해보세요.
        <br />
        회의록 기록 관리도 안전하게.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4 xl:mt-10 xl:gap-5">
        <CtaButton
          href="/dashboard"
          className="min-h-12 rounded-2xl px-7 py-3.5 text-base sm:min-h-[3.25rem] sm:px-8 sm:py-4 sm:text-lg xl:min-h-14 xl:rounded-[1.25rem] xl:px-10 xl:py-5 xl:text-xl"
        >
          시작하기
        </CtaButton>
        <CtaButton
          href="#features"
          variant="ghost"
          className="min-h-12 rounded-2xl bg-[#ebe4d8] px-7 py-3.5 text-base text-foreground hover:bg-[#e0d8c8] sm:min-h-[3.25rem] sm:px-8 sm:py-4 sm:text-lg xl:min-h-14 xl:rounded-[1.25rem] xl:px-10 xl:py-5 xl:text-xl"
        >
          둘러보기
        </CtaButton>
      </div>
    </div>
  );
}
