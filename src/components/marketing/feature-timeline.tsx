"use client";

import {
  FileText,
  Lock,
  Mic,
  PlayCircle,
  Shield,
  type LucideIcon,
} from "lucide-react";
import {
  type ComponentType,
  useEffect,
  useRef,
  useState,
} from "react";

import { Container } from "@/components/marketing/container";
import { FeaturesHeadline } from "@/components/marketing/features-headline";
import {
  MockAutoMask,
  MockAutoSummary,
  MockLiveTranscribe,
  MockReplayHighlight,
  MockSecureVault,
} from "@/components/marketing/feature-showcase-mocks";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

type Step = {
  step: string;
  title: string;
  desc: string;
  icon: LucideIcon;
  mock: ComponentType;
};

const STEPS: Step[] = [
  {
    step: "01",
    title: REALTIME_FEATURE_ENABLED
      ? "업로드 또는 실시간, 화자 구분 받아쓰기"
      : "음성 업로드, 화자 구분 받아쓰기",
    desc: REALTIME_FEATURE_ENABLED
      ? "파일을 올리거나 실시간으로 녹음하면 음성을 텍스트로 바꾸고, 누가 말했는지 나눠 대화처럼 보여 줍니다."
      : "음성 파일을 올리면 음성을 텍스트로 바꾸고, 누가 말했는지 나눠 대화처럼 보여 줍니다.",
    icon: Mic,
    mock: MockLiveTranscribe,
  },
  {
    step: "02",
    title: "요약과 타임라인 정리",
    desc: "안건, 논의, 결정, 후속 조치를 구간별 타임라인으로 정리해 다시 듣지 않아도 흐름이 보입니다.",
    icon: FileText,
    mock: MockAutoSummary,
  },
  {
    step: "03",
    title: "다시 듣기와 메모",
    desc: "재생하면 지금 말하는 단어가 형광펜처럼 따라갑니다. 필요한 부분에는 메모를 남깁니다.",
    icon: PlayCircle,
    mock: MockReplayHighlight,
  },
  {
    step: "04",
    title: "민감정보 자동 마스킹",
    desc: "전화번호나 주민번호 같은 민감정보를 자동으로 가려 공유 전 검토를 돕습니다.",
    icon: Shield,
    mock: MockAutoMask,
  },
  {
    step: "05",
    title: "암호화 보관과 권한 관리",
    desc: "암호화 저장, 역할 기반 접근 권한, 활동 로그로 회의록을 보관합니다.",
    icon: Lock,
    mock: MockSecureVault,
  },
];

function StepNode({ Icon }: { Icon: LucideIcon }) {
  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#252d52] to-[#0b0f1e] text-white shadow-[0_10px_24px_rgba(17,24,46,0.28)] ring-1 ring-white/10">
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </span>
  );
}

function FeatureStep({
  step,
  index,
  visible,
  reduced,
}: {
  step: Step;
  index: number;
  visible: boolean;
  reduced: boolean;
}) {
  const Icon = step.icon;
  const Mock = step.mock;

  return (
    <li
      data-feature-step={step.step}
      className={cn(
        "relative transition-all duration-700 ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
      )}
      style={{
        transitionDelay:
          visible && !reduced ? `${Math.min(index, 4) * 70}ms` : "0ms",
      }}
    >
      <div className="mx-auto flex max-w-xl flex-col items-center text-center">
        <StepNode Icon={Icon} />

        <div data-feature-sentinel={step.step} className="mt-5 w-full">
          <span className="text-sm font-semibold tracking-widest text-muted-2">
            STEP {step.step}
          </span>
          <h3 className="mt-1.5 text-xl font-semibold text-foreground sm:text-2xl">
            {step.title}
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-muted">
            {step.desc}
          </p>
        </div>

        <div className="mt-6 w-full lg:mt-8">
          <Mock />
        </div>
      </div>

      {index < STEPS.length - 1 ? (
        <div
          aria-hidden
          className="mx-auto mt-10 flex h-16 w-px justify-center bg-gradient-to-b from-border-strong via-border to-transparent sm:mt-12 sm:h-20 lg:mt-14 lg:h-24"
        />
      ) : null}
    </li>
  );
}

/** 왼쪽부터 일자 나열. 스크롤 시 순서대로 등장, 모든 폭에서 데모 재생. */
export function FeatureTimeline() {
  const listRef = useRef<HTMLOListElement>(null);
  const reduced = usePrefersReducedMotion();
  const [revealedThrough, setRevealedThrough] = useState(-1);

  useEffect(() => {
    if (reduced) return;
    const root = listRef.current;
    if (!root || typeof IntersectionObserver === "undefined") {
      setRevealedThrough(STEPS.length - 1);
      return;
    }

    const sentinels = [...root.querySelectorAll<HTMLElement>("[data-feature-sentinel]")];
    const io = new IntersectionObserver(
      (entries) => {
        let maxIdx = -1;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const key = entry.target.getAttribute("data-feature-sentinel");
          const idx = STEPS.findIndex((s) => s.step === key);
          if (idx > maxIdx) maxIdx = idx;
        }
        if (maxIdx >= 0) {
          setRevealedThrough((prev) => Math.max(prev, maxIdx));
        }
      },
      { threshold: 0, rootMargin: "0px 0px -12% 0px" },
    );
    sentinels.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [reduced]);

  return (
    <section
      id="features"
      className="scroll-mt-20 bg-background pb-24 pt-0 xl:pb-32"
    >
      <Container>
        <FeaturesHeadline />

        <ol ref={listRef} className="mt-20 space-y-0 sm:mt-24 lg:mt-28">
          {STEPS.map((s, i) => (
            <FeatureStep
              key={s.step}
              step={s}
              index={i}
              visible={reduced || i <= revealedThrough}
              reduced={reduced}
            />
          ))}
        </ol>
      </Container>
    </section>
  );
}
