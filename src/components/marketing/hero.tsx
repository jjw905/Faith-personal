import { ChatMock } from "@/components/marketing/chat-mock";
import { Container } from "@/components/marketing/container";
import { HeroIntro } from "@/components/marketing/hero-intro";
import { VoiceStage } from "@/components/marketing/voice-stage";

/** 랜딩 히어로 — 큰 화면(xl+) 2열 / 그 아래는 1열로만 전환. */
export function Hero() {
  return (
    <section className="relative -mt-16 flex min-h-[100dvh] flex-col overflow-hidden pt-16 xl:-mt-[4.5rem] xl:pt-[4.5rem]">
      <VoiceStage />

      <Container className="relative z-10 my-auto grid w-full items-center gap-10 py-8 xl:grid-cols-2 xl:gap-20 xl:py-10">
        <HeroIntro />

        <div className="relative w-full xl:justify-self-end">
          <ChatMock />
        </div>
      </Container>

      {/* 하단 → 기능 섹션으로 이어지는 세로 가이드 */}
      <div
        aria-hidden
        className="relative z-10 mx-auto h-16 w-px shrink-0 bg-[color-mix(in_srgb,var(--foreground)_16%,transparent)] sm:h-20"
      />
    </section>
  );
}
