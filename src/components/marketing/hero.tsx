import { ChatMock } from "@/components/marketing/chat-mock";
import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";
import { VoiceStage } from "@/components/marketing/voice-stage";

/** 랜딩 히어로 — 풀 높이 3D 보이스 배경 위에 카피/채팅 오버레이. */
export function Hero() {
  return (
    <section className="relative -mt-16 flex min-h-[100dvh] items-center overflow-hidden pt-16 sm:-mt-[4.5rem] sm:pt-[4.5rem]">
      {/* 섹션 전체 높이를 채우는 인터랙티브 3D 배경 (그레이 톤) */}
      <VoiceStage />

      <Container className="relative z-10 grid w-full items-center gap-12 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24 xl:gap-20">
        <div className="max-w-2xl">
          <h1 className="text-hero text-5xl font-bold text-foreground sm:text-6xl lg:text-7xl">
            안전한 회의진행,
            <br />
            음성 텍스트 추출도 알아서.
          </h1>
          <p className="mt-8 max-w-xl text-xl leading-relaxed text-muted">
            개인정보 누출 걱정없이 회의를 진행해보세요.
            <br />
            회의록 기록 관리도 안전하게.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <CtaButton href="/" className="px-6 py-3 text-base">
              무료로 시작
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

        <div className="w-full lg:justify-self-end">
          <ChatMock />
        </div>
      </Container>
    </section>
  );
}
