import { FileText, Lock, Mic, Shield, type LucideIcon } from "lucide-react";

import { Container } from "@/components/marketing/container";
import { HeroChatShapesHost } from "@/components/marketing/hero-chat-shapes-host";
import { cn } from "@/lib/utils";

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
    desc: "유출될 수 있는 개인정보를 감지해 자동으로 마스킹 합니다.",
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

function StepNode({
  Icon,
  isDark,
}: {
  Icon: LucideIcon;
  isDark: boolean;
}) {
  return (
    <span
      className={
        isDark
          ? "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#252d52] to-[#0b0f1e] text-white shadow-[0_10px_24px_rgba(17,24,46,0.28)] ring-1 ring-white/10"
          : "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card text-primary shadow-soft ring-1 ring-border-strong"
      }
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </span>
  );
}

function StepCopy({
  step,
  title,
  desc,
  align,
}: {
  step: string;
  title: string;
  desc: string;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        align === "right" ? "text-right" : "text-left",
        align === "right" ? "pr-1" : "pl-1",
      )}
    >
      <span className="text-xs font-semibold tracking-widest text-muted-2">
        STEP {step}
      </span>
      <h3 className="mt-1 text-lg font-semibold text-foreground sm:text-xl xl:text-2xl">
        {title}
      </h3>
      <p
        className={cn(
          "mt-2 text-sm leading-relaxed text-muted sm:text-base xl:mt-3",
          align === "right" ? "ml-auto max-w-md" : "max-w-md",
        )}
      >
        {desc}
      </p>
    </div>
  );
}

/** 좌우 교차 기능 소개 — 가운데 스파인(sm+) / 엣지 지그재그(폰만). */
export function FeatureTimeline() {
  return (
    <section
      id="features"
      className="scroll-mt-20 bg-surface pb-20 pt-0 lg:pb-28"
    >
      <Container>
        <div className="flex flex-col items-center">
          {/* 히어로에서 내려온 세로선 — 헤드라인 바로 위에서 끊김 */}
          <div
            aria-hidden
            className="mb-8 h-12 w-px bg-[color-mix(in_srgb,var(--foreground)_16%,transparent)] sm:mb-10 sm:h-14 lg:mb-12"
          />

          <div className="mx-auto flex w-fit max-w-full flex-col items-center justify-center gap-[50px] text-center xl:flex-row xl:items-center xl:text-left">
            <div className="max-w-xl shrink-0">
              <h2 className="text-4xl font-bold tracking-tight text-foreground lg:text-5xl">
                회의 전 과정을
                <br />
                하나의 흐름으로.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-muted">
                기록까지 안전하게, Faith가 자동으로 이어줍니다.
              </p>
            </div>
            <div className="flex shrink-0 justify-center">
              <HeroChatShapesHost />
            </div>
          </div>
        </div>

        <ol className="relative mt-16 space-y-12 sm:mt-20 sm:space-y-0">
          <span
            aria-hidden
            className="pointer-events-none absolute top-[3.5rem] bottom-[3.5rem] left-1/2 hidden w-px -translate-x-1/2 bg-gradient-to-b from-border-strong via-border to-border-strong sm:block xl:top-[4.25rem] xl:bottom-[4.25rem]"
          />

          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isDark = i % 2 === 0;
            const isLeft = i % 2 === 0;

            return (
              <li
                key={s.step}
                className="relative sm:grid sm:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] sm:items-start sm:gap-x-4 sm:py-10 xl:gap-x-10 xl:py-14"
              >
                {/* 폰만: 좌우 엣지 교차 */}
                <div
                  className={cn(
                    "flex gap-4 sm:hidden",
                    isLeft ? "flex-row" : "flex-row-reverse text-right",
                  )}
                >
                  <StepNode Icon={Icon} isDark={isDark} />
                  <div className="min-w-0 flex-1 pt-1">
                    <span className="text-xs font-semibold tracking-widest text-muted-2">
                      STEP {s.step}
                    </span>
                    <h3 className="mt-1 text-xl font-semibold text-foreground">
                      {s.title}
                    </h3>
                    <p className="mt-2 text-base leading-relaxed text-muted">
                      {s.desc}
                    </p>
                  </div>
                </div>

                {/* sm+: 텍스트 | 가운데 아이콘 | 텍스트 */}
                {isLeft ? (
                  <>
                    <div className="hidden sm:block">
                      <StepCopy
                        step={s.step}
                        title={s.title}
                        desc={s.desc}
                        align="right"
                      />
                    </div>
                    <div className="relative z-10 hidden justify-center sm:flex">
                      <StepNode Icon={Icon} isDark={isDark} />
                    </div>
                    <div className="hidden sm:block" aria-hidden />
                  </>
                ) : (
                  <>
                    <div className="hidden sm:block" aria-hidden />
                    <div className="relative z-10 hidden justify-center sm:flex">
                      <StepNode Icon={Icon} isDark={isDark} />
                    </div>
                    <div className="hidden sm:block">
                      <StepCopy
                        step={s.step}
                        title={s.title}
                        desc={s.desc}
                        align="left"
                      />
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      </Container>
    </section>
  );
}
