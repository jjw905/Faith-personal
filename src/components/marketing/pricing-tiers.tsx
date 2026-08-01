"use client";

import { Check } from "lucide-react";
import { useState } from "react";

import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";
import { PAID_PLANS_ENABLED, TEAM_FEATURE_ENABLED } from "@/lib/feature-flags";
import {
  PLAN_CATALOG,
  TOPUP_PACKS,
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

/** Pro/Team·추가 구매는 결제 연동 전이라 라벨만 두고 반응 없음. */
const TIER_LOCKED: Record<CatalogPlanId, boolean> = {
  FREE: false,
  PRO: !PAID_PLANS_ENABLED,
  TEAM: !PAID_PLANS_ENABLED || !TEAM_FEATURE_ENABLED,
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
        className="flex w-full rounded-full bg-card p-0.5 shadow-[0_1px_4px_rgba(17,22,46,0.08),0_6px_16px_-8px_rgba(17,22,46,0.16)] ring-1 ring-border"
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
        연 결제 시 2개월 무료
      </p>
    </div>
  );
}

function TierCard({
  tier,
  billing,
  cta,
  locked,
}: {
  tier: PlanCatalogEntry;
  billing: Billing;
  cta: TierCta;
  locked: boolean;
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
    !tier.featured && "bg-surface",
    !locked && !tier.featured && "hover:bg-surface-2",
  );

  const badges = tier.badges ?? [];

  return (
    <div
      className={cn(
        "relative flex h-full flex-col rounded-3xl bg-card p-6 sm:p-7 xl:p-8",
        tier.featured
          ? "shadow-[0_2px_6px_rgba(17,22,46,0.1),0_12px_28px_rgba(17,22,46,0.16),0_28px_64px_-18px_rgba(17,22,46,0.32)] ring-2 ring-primary"
          : "shadow-[0_1px_3px_rgba(17,22,46,0.1),0_8px_20px_rgba(17,22,46,0.12),0_22px_48px_-16px_rgba(17,22,46,0.24)] ring-1 ring-border",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xl font-bold tracking-tight text-foreground">
          {tier.name}
        </p>
        {badges.length > 0 ? (
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            {badges.map((label) => (
              <span
                key={label}
                className="whitespace-nowrap rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <p className="mt-1 min-h-12 text-base font-medium text-muted">
        {tier.tagline}
      </p>

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

      {locked ? (
        <span
          aria-disabled="true"
          className={cn(
            "inline-flex cursor-default select-none items-center justify-center rounded-xl px-5 text-base font-semibold",
            tier.featured
              ? "bg-primary text-primary-foreground"
              : "text-foreground",
            ctaClass,
          )}
        >
          {cta.label}
        </span>
      ) : cta.contact ? (
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

/** 사용 시간을 다 썼을 때 고르는 추가 시간. 결제 연동 전이라 안내만 한다. */
function formatTopupDuration(minutes: number) {
  if (minutes >= 60 && minutes % 60 === 0) {
    return `${minutes / 60}시간`;
  }
  return `${minutes}분`;
}

const TIER_CARD_SHADOW =
  "shadow-[0_1px_3px_rgba(17,22,46,0.1),0_8px_20px_rgba(17,22,46,0.12),0_22px_48px_-16px_rgba(17,22,46,0.24)] ring-1 ring-border";
const TIER_CARD_SHADOW_FEATURED =
  "shadow-[0_2px_6px_rgba(17,22,46,0.1),0_12px_28px_rgba(17,22,46,0.16),0_28px_64px_-18px_rgba(17,22,46,0.32)] ring-2 ring-primary";

function TopupPacks() {
  const inert = !PAID_PLANS_ENABLED;

  return (
    <div className="mx-auto mt-10 w-full max-w-lg lg:max-w-5xl">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          필요할 때 추가하는 시간
        </h2>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:mt-8 sm:grid-cols-3 sm:gap-5">
        {TOPUP_PACKS.map((pack) => {
          const featured = Boolean(pack.badge);
          return (
            <div
              key={pack.id}
              className={cn(
                "flex h-full flex-col rounded-3xl bg-card p-6 sm:p-7",
                featured ? TIER_CARD_SHADOW_FEATURED : TIER_CARD_SHADOW,
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-xl font-bold tracking-tight text-foreground">
                  {formatTopupDuration(pack.minutes)}
                </p>
                {pack.badge ? (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-sm font-semibold text-primary-foreground">
                    {pack.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-base font-medium text-muted">
                {pack.minutes.toLocaleString("ko-KR")}분 추가
              </p>

              <div className="mt-5 flex items-baseline gap-1.5 sm:mt-6">
                <span className="text-3xl font-bold tracking-tight tabular-nums text-foreground">
                  {formatPlanWon(pack.priceWon)}
                </span>
              </div>

              <span
                aria-disabled={inert || undefined}
                className={cn(
                  "mt-auto inline-flex min-h-12 w-full cursor-default select-none items-center justify-center rounded-xl px-5 text-base font-semibold sm:mt-6",
                  featured
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-foreground",
                )}
              >
                구매
              </span>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-sm font-medium leading-snug text-muted-2">
        사용 시간을 다 썼을 때 고르는 선불 이용 시간입니다.
        {" "}
        유효기간 12개월 · 구독과 별도 · 잔여 시간에 합산
      </p>
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
            나의 방식에 맞는 요금제를 골라보세요.
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
                locked={TIER_LOCKED[id]}
              />
            </div>
          ))}
        </div>

        <TopupPacks />
      </Container>
    </section>
  );
}
