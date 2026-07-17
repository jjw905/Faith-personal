import { FileText, Lock, Mic, Shield, type LucideIcon } from "lucide-react";

import { Container } from "@/components/marketing/container";

type Step = {
  step: string;
  title: string;
  desc: string;
  icon: LucideIcon;
};

const STEPS: Step[] = [
  {
    step: "01",
    title: "실시간 음성 텍스트 추출",
    desc: "회의 음성을 실시간으로 받아써 텍스트로 변환합니다. 화자별로 구분해 기록합니다.",
    icon: Mic,
  },
  {
    step: "02",
    title: "개인정보 자동 마스킹",
    desc: "주민번호, 전화, 이메일, 카드번호를 규칙과 NER로 감지해 자동으로 가립니다.",
    icon: Shield,
  },
  {
    step: "03",
    title: "회의 내용 자동 요약",
    desc: "핵심 안건, 결정사항, 후속 조치를 자동으로 정리해 한눈에 확인합니다.",
    icon: FileText,
  },
  {
    step: "04",
    title: "안전한 회의록 관리",
    desc: "암호화 저장, 역할 기반 접근 권한, 활동 로그로 회의록을 안전하게 보관합니다.",
    icon: Lock,
  },
];

/** 세로 타임라인 형태의 기능 소개. */
export function FeatureTimeline() {
  return (
    <section
      id="features"
      className="scroll-mt-20 bg-surface pt-12 pb-24 sm:pt-16 sm:pb-32"
    >
      <Container className="max-w-3xl">
        <h2 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          회의 전 과정을
          <br />
          하나의 흐름으로.
        </h2>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
          기록까지 안전하게, Faith가 자동으로 이어줍니다.
        </p>

        <ol className="mt-16">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isLast = i === STEPS.length - 1;
            const isDark = i % 2 === 0;
            return (
              <li key={s.step} className="flex gap-5 sm:gap-7">
                {/* 레일 + 노드 (검-흰 교차) */}
                <div className="flex flex-col items-center">
                  <span
                    className={
                      isDark
                        ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#252d52] to-[#0b0f1e] text-white shadow-[0_10px_24px_rgba(17,24,46,0.28)] ring-1 ring-white/10"
                        : "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card text-primary shadow-soft ring-1 ring-border-strong"
                    }
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} />
                  </span>
                  {!isLast && (
                    <span className="my-2 w-px flex-1 bg-gradient-to-b from-border-strong to-border" />
                  )}
                </div>

                {/* 내용 */}
                <div className={isLast ? "pt-1" : "pb-20 pt-1"}>
                  <span className="text-xs font-semibold tracking-widest text-muted-2">
                    STEP {s.step}
                  </span>
                  <h3 className="mt-1 text-xl font-semibold text-foreground">
                    {s.title}
                  </h3>
                  <p className="mt-2 max-w-lg text-base leading-relaxed text-muted">
                    {s.desc}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
