import { ChatMock } from "@/components/marketing/chat-mock";
import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";
import { VoiceStage } from "@/components/marketing/voice-stage";

/** 랜딩 히어로 — 큰 화면(xl+) 2열 / 그 아래는 1열로만 전환. */
export function Hero() {
  return (
    <section className="relative -mt-16 flex min-h-[100dvh] items-center overflow-hidden pt-16 xl:-mt-[4.5rem] xl:pt-[4.5rem]">
      <VoiceStage />

      <Container className="relative z-10 grid w-full items-center gap-10 py-14 xl:grid-cols-2 xl:gap-20 xl:py-24">
        <div className="max-w-2xl">
          <h1 className="text-hero text-5xl font-bold text-foreground xl:text-7xl">
            안전한 회의진행,
            <br />
            음성 텍스트 추출도 알아서.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted xl:mt-8 xl:text-xl">
            개인정보 누출 걱정없이 회의를 진행해보세요.
            <br />
            회의록 기록 관리도 안전하게.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4 xl:mt-10">
            <CtaButton href="/dashboard" className="px-6 py-3 text-base">
              회의
            </CtaButton>
            <CtaButton
              href="#features"
              variant="ghost"
              className="bg-[#ebe4d8] px-6 py-3 text-base text-foreground hover:bg-[#e0d8c8]"
            >
              데모 둘러보기
            </CtaButton>
          </div>
        </div>

        <div className="w-full xl:justify-self-end">
          <ChatMock />
        </div>
      </Container>
    </section>
  );
}
