"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";
import { SUPPORT_EMAIL } from "@/lib/support-email";
import { cn } from "@/lib/utils";

type Billing = "monthly" | "yearly";

type Tier = {
  name: string;
  tagline: string;
  /** 월 정가. null이면 문의. */
  monthlyPrice: number | null;
  /** 연간 결제 시 월 환산가. */
  yearlyMonthlyPrice?: number | null;
  yearlyTotal?: number | null;
  priceUnit?: string;
  /** 카드 우상단 배지. 추천과 동일 스타일. */
  badges?: string[];
  features: string[];
  cta: { label: string; href?: string; contact?: boolean };
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Free",
    tagline: "개인 시작",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    yearlyTotal: 0,
    features: [
      "회의 월 5회",
      "보관함 500MB",
      "음성 텍스트 추출",
      "개인정보 자동 마스킹",
    ],
    cta: { label: "무료로 시작", href: "/signup" },
  },
  {
    name: "Pro",
    tagline: "개인 회의록",
    monthlyPrice: 19_000,
    yearlyMonthlyPrice: 15_833,
    yearlyTotal: 190_000,
    badges: ["연 결제 시 2개월 무료", "추천"],
    features: [
      "회의 무제한",
      "보관함 20GB",
      "고급 요약, 타임라인",
      "우선 처리 대기열",
      "개인 워크스페이스",
    ],
    cta: { label: "Pro 시작", href: "/signup" },
    featured: true,
  },
  {
    name: "Team",
    tagline: "팀 2명 이상",
    monthlyPrice: 15_200,
    yearlyMonthlyPrice: 15_200,
    priceUnit: "/ 인 / 월",
    badges: ["Pro 월간 대비 20% 할인"],
    features: [
      "팀 워크스페이스, 초대",
      "역할, 기록 열람 권한",
      "온라인 팀 회의",
      "예정 회의, 알림, 팀 공지",
      "감사 로그",
      "팀 보안 정책",
    ],
    cta: { label: "Team 시작", href: "/signup?plan=team" },
  },
];

function formatWon(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}

function BillingSwitch({
  value,
  onChange,
}: {
  value: Billing;
  onChange: (v: Billing) => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[14rem] flex-col items-center gap-1.5">
      <div
        role="group"
        aria-label="결제 주기"
        className="flex w-full rounded-full bg-card p-0.5 shadow-soft ring-1 ring-border/50"
      >
        <button
          type="button"
          aria-pressed={value === "monthly"}
          onClick={() => onChange("monthly")}
          className={cn(
            "min-h-9 flex-1 rounded-full px-3 text-base font-semibold transition-colors duration-200",
            value === "monthly"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/70 hover:text-foreground",
          )}
        >
          월간
        </button>
        <button
          type="button"
          aria-pressed={value === "yearly"}
          onClick={() => onChange("yearly")}
          className={cn(
            "min-h-9 flex-1 rounded-full px-3 text-base font-semibold transition-colors duration-200",
            value === "yearly"
              ? "bg-primary text-primary-foreground"
              : "text-foreground/70 hover:text-foreground",
          )}
        >
          연간
        </button>
      </div>
      <p
        className={cn(
          "min-h-5 text-sm font-semibold transition-opacity",
          value === "yearly" ? "text-primary opacity-100" : "opacity-0",
        )}
      >
        Pro 연간 2개월 무료
      </p>
    </div>
  );
}

function TierCard({ tier, billing }: { tier: Tier; billing: Billing }) {
  const isInquiry = tier.monthlyPrice === null;
  const monthly =
    billing === "yearly"
      ? (tier.yearlyMonthlyPrice ?? tier.monthlyPrice)
      : tier.monthlyPrice;

  const priceLabel = isInquiry ? "문의" : formatWon(monthly ?? 0);

  const note = isInquiry
    ? ""
    : billing === "yearly" && tier.yearlyTotal != null && tier.yearlyTotal > 0
      ? `연 ${formatWon(tier.yearlyTotal)} 청구`
      : billing === "yearly" && tier.monthlyPrice === 0
        ? "항상 무료"
        : "";

  const ctaClass = cn(
    "mt-5 w-full py-3.5 text-base sm:mt-6 sm:py-3",
    tier.featured ? "" : "bg-surface hover:bg-surface-2",
  );

  const badges = tier.badges ?? [];

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-3xl bg-card p-6 sm:p-7 xl:p-8",
        tier.featured
          ? "shadow-[0_10px_40px_rgba(17,24,46,0.16)] ring-2 ring-primary"
          : "shadow-soft ring-1 ring-border/50",
      )}
    >
      {badges.length > 0 ? (
        <div className="absolute right-4 top-4 flex max-w-[min(100%,15rem)] flex-wrap justify-end gap-1.5 sm:right-5 sm:top-5 sm:max-w-[17rem]">
          {badges.map((label) => (
            <span
              key={label}
              className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground"
            >
              {label}
            </span>
          ))}
        </div>
      ) : null}

      <p
        className={cn(
          "text-xl font-bold tracking-tight text-foreground",
          badges.length > 0 && "pr-16",
        )}
      >
        {tier.name}
      </p>
      <p className="mt-1 text-base font-medium text-muted">{tier.tagline}</p>

      <div className="mt-5 flex min-h-[3.25rem] items-baseline gap-1.5 sm:mt-6">
        <span className="text-3xl font-bold tracking-tight text-foreground tabular-nums xl:text-4xl">
          {priceLabel}
        </span>
        {!isInquiry ? (
          <span className="text-base font-medium text-muted-2">
            {tier.priceUnit ?? "/ 월"}
          </span>
        ) : null}
      </div>
      <p className="mt-1.5 min-h-5 text-sm font-medium text-muted-2">{note}</p>

      {tier.cta.contact ? (
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className={cn(
            "inline-flex items-center justify-center rounded-xl px-5 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "bg-surface text-foreground hover:bg-surface-2",
            ctaClass,
          )}
        >
          {tier.cta.label}
        </a>
      ) : (
        <CtaButton
          href={tier.cta.href ?? "/signup"}
          variant={tier.featured ? "primary" : "ghost"}
          className={ctaClass}
        >
          {tier.cta.label}
        </CtaButton>
      )}

      <ul className="mt-6 space-y-3 border-t border-border/50 pt-5 sm:mt-7 sm:pt-6">
        {tier.features.map((f) => (
          <li
            key={f}
            className="flex items-start gap-2.5 text-base text-foreground"
          >
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-primary"
              strokeWidth={2.5}
            />
            <span className="leading-snug">{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 요금제 3단 — 개인 Free/Pro, 협업 Team. 월간/연간 전환. */
export function PricingTiers() {
  const [billing, setBilling] = useState<Billing>("monthly");

  return (
    <section className="py-12 sm:py-16 xl:py-20">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl xl:text-5xl">
            규모에 맞는 요금제
          </h1>
        </div>

        <div className="mx-auto mt-5 sm:mt-6">
          <BillingSwitch value={billing} onChange={setBilling} />
        </div>

        <div className="mx-auto mt-5 grid w-full max-w-lg gap-4 sm:mt-6 sm:gap-5 lg:max-w-5xl lg:grid-cols-3 lg:items-stretch">
          {TIERS.map((tier) => (
            <div key={tier.name} className="min-w-0">
              <TierCard tier={tier} billing={billing} />
            </div>
          ))}
        </div>

      </Container>
    </section>
  );
}
