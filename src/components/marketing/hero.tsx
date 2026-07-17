import { ChatMock } from "@/components/marketing/chat-mock";
import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";

/** 랜딩 히어로 — 큰 헤드라인 + CTA + 채팅 목업. */
export function Hero() {
  return (
    <section className="pt-16 pb-24 sm:pt-24">
      <Container className="grid items-center gap-14 lg:grid-cols-2 lg:gap-10">
        <div className="max-w-xl">
          <h1 className="text-hero text-4xl font-bold text-foreground sm:text-5xl lg:text-6xl">
            팀 회의를 안전하게,
            <br />
            민감정보는 자동으로.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted">
            Faith는 채팅과 회의록에서 개인정보를 감지, 마스킹합니다. 규칙과 NER
            하이브리드로 더 정확하게.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <CtaButton href="/">무료로 시작</CtaButton>
            <CtaButton href="/meetings/live-mask" variant="ghost">
              데모 둘러보기
            </CtaButton>
          </div>
        </div>

        <div className="lg:pl-6">
          <ChatMock />
        </div>
      </Container>
    </section>
  );
}
