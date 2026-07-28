"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";
import {
  PLAN_CATALOG,
  formatPlanWon,
  type CatalogPlanId,
  type PlanCatalogEntry,
} from "@/lib/plans";
import { SUPPORT_EMAIL } from "@/lib/support-email";
import { cn } from "@/lib/utils";

type Billing = "monthly" | "yearly";

type TierCta = { label: string; href?: string; contact?: boolean };

const TIER_ORDER: CatalogPlanId[] = ["FREE", "PRO", "TEAM"];

const TIER_CTA: Record<CatalogPlanId, TierCta> = {
  FREE: { label: "무료로 시작", href: "/signup" },
  PRO: { label: "Pro 시작", href: "/signup" },
  TEAM: { label: "Team 시작", href: "/signup?plan=team" },
};

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

function TierCard({
  tier,
  billing,
  cta,
}: {
  tier: PlanCatalogEntry;
  billing: Billing;
  cta: TierCta;
}) {
  const isInquiry = tier.monthlyPrice === null;
  const monthly =
    billing === "yearly"
      ? (tier.yearlyMonthlyPrice ?? tier.monthlyPrice)
      : tier.monthlyPrice;

  const priceLabel = isInquiry ? "문의" : formatPlanWon(monthly ?? 0);

  const note = isInquiry
    ? ""
    : billing === "yearly" && tier.yearlyTotal != null && tier.yearlyTotal > 0
      ? `연 ${formatPlanWon(tier.yearlyTotal)} 청구`
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

      {cta.contact ? (
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className={cn(
            "inline-flex items-center justify-center rounded-xl px-5 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "bg-surface text-foreground hover:bg-surface-2",
            ctaClass,
          )}
        >
          {cta.label}
        </a>
      ) : (
        <CtaButton
          href={cta.href ?? "/signup"}
          variant={tier.featured ? "primary" : "ghost"}
          className={ctaClass}
        >
          {cta.label}
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
          {TIER_ORDER.map((id) => (
            <div key={id} className="min-w-0">
              <TierCard
                tier={PLAN_CATALOG[id]}
                billing={billing}
                cta={TIER_CTA[id]}
              />
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
