import { ChatMock } from "@/components/marketing/chat-mock";
import { HeroIntro } from "@/components/marketing/hero-intro";
import { HeroLayout } from "@/components/marketing/hero-layout";
import { VoiceStage } from "@/components/marketing/voice-stage";

/** 랜딩 히어로 — xl+ 2열 / 그 아래 1열. 배치 전환만 FLIP으로 부드럽게. */
export function Hero() {
  return (
    <section className="relative -mt-16 flex flex-col overflow-x-clip bg-background pt-16">
      <VoiceStage />

      <HeroLayout intro={<HeroIntro />} chat={<ChatMock />} />

      {/* 기능 헤드라인까지 한 줄로 이어지는 세로선 */}
      <div
        aria-hidden
        className="relative z-10 mx-auto -mb-12 h-[7.5rem] w-px shrink-0 bg-[color-mix(in_srgb,var(--foreground)_16%,transparent)]"
      />
    </section>
  );
}
