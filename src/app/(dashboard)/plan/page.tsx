"use client";

import { ArrowUpRight, Check, Gift } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PAID_PLANS_ENABLED } from "@/lib/feature-flags";
import {
  PLAN_CATALOG,
  TOPUP_PACKS,
  formatPlanMinutes,
  formatPlanWon,
  planMonthlyFeeLabel,
  type CatalogPlanId,
} from "@/lib/plans";
import { buildSupportMailto } from "@/lib/support-email";
import {
  formatQuotaRemainingLabel,
  formatSurveyCta,
  monthlyMinutesFromSeconds,
} from "@/lib/usage-copy";
import { cn } from "@/lib/utils";
import type { AccountTier } from "@/types/user";

const CARD_SHADOW =
  "rounded-3xl shadow-[0_1px_3px_rgba(17,22,46,0.1),0_8px_20px_rgba(17,22,46,0.12),0_22px_48px_-16px_rgba(17,22,46,0.24)] ring-1 ring-border";

const TIER_BADGE: Record<AccountTier, string> = {
  FREE: "bg-surface-2 text-muted",
  PRO: "bg-primary-soft text-primary",
  ADMIN: "bg-foreground/10 text-foreground",
};

function resolveTier(
  role?: string | null,
  plan?: string | null,
): AccountTier {
  if (role === "ADMIN") return "ADMIN";
  if (plan === "PRO") return "PRO";
  return "FREE";
}

function catalogIdForTier(tier: AccountTier): CatalogPlanId {
  return tier === "FREE" ? "FREE" : "PRO";
}

function tierDisplayName(tier: AccountTier) {
  if (tier === "ADMIN") return "Admin";
  if (tier === "PRO") return "Pro";
  return "Free";
}

type QuotaStatus = {
  ok: boolean;
  usedSec: number;
  limitSec: number;
  remainingSec: number;
  monthlyLimitSec?: number;
  creditRemainingSec?: number;
  graceRemainingSec?: number;
  surveyCompleted: boolean;
  resetsAtLabel?: string;
  enforced?: boolean;
};

function useUploadQuota() {
  const [status, setStatus] = useState<QuotaStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/usage/quota", { cache: "no-store" });
        const data = (await res.json()) as QuotaStatus;
        if (!cancelled && data.ok) setStatus(data);
      } catch {
        // 실패해도 화면은 유지. 실제 한도는 업로드 시 서버가 다시 확인.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, loading };
}

/** GPT/Claude류 사용량 대시보드처럼: 이번 주기 실사용을 가장 먼저, 가장 크게 보여준다. */
function UsageHeroCard({ tier }: { tier: AccountTier }) {
  const { status, loading } = useUploadQuota();
  const resetLabel = status?.resetsAtLabel;
  const enforced = status?.enforced !== false;
  const monthlyLimitSec = status
    ? (status.monthlyLimitSec ?? status.limitSec)
    : 0;
  const monthlyLimitMin = monthlyMinutesFromSeconds(monthlyLimitSec);
  const remainingMin = status ? Math.floor(status.remainingSec / 60) : 0;

  return (
    <Card className={CARD_SHADOW}>
      <CardContent className="px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-muted">잔여 시간</p>
          <span
            className={cn(
              "inline-flex min-h-10 items-center rounded-full px-3 text-base font-semibold",
              TIER_BADGE[tier],
            )}
          >
            {tierDisplayName(tier)}
          </span>
        </div>

        {loading || !status ? (
          <div className="mt-4 space-y-3">
            <div className="h-10 w-40 animate-pulse rounded-lg bg-surface-2" />
            <div className="h-2.5 w-full animate-pulse rounded-full bg-surface-2" />
          </div>
        ) : !enforced ? (
          <div className="mt-4 space-y-2">
            <p className="text-2xl font-bold tracking-tight text-foreground">
              이용 제한 없음
            </p>
            <p className="text-base font-medium text-muted">
              현재 잔여 시간 제한을 적용하지 않습니다.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
                {remainingMin}분
              </span>
              <span className="text-lg font-medium text-muted">
                / {monthlyLimitMin}분
              </span>
            </div>
            <p className="mt-1 text-base font-medium text-muted">
              {formatQuotaRemainingLabel(status.remainingSec, monthlyLimitSec)}
            </p>

            <Progress
              value={
                status.limitSec > 0
                  ? (status.usedSec / status.limitSec) * 100
                  : 0
              }
              className="mt-4 h-2.5"
            />

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5">
              {resetLabel ? (
                <p className="text-base font-medium text-muted">
                  <span className="font-semibold tabular-nums text-foreground">
                    {resetLabel}
                  </span>{" "}
                  다시 사용할 수 있습니다.
                </p>
              ) : (
                <span />
              )}
              {status.surveyCompleted ? (
                <span className="whitespace-nowrap text-base font-semibold text-primary">
                  설문으로 {monthlyLimitMin}분 적용 중
                </span>
              ) : (
                <Button
                  asChild
                  size="sm"
                  className="min-h-12 shrink-0 rounded-full px-4 text-base md:h-10 md:min-h-10 md:text-sm"
                >
                  <Link href="/survey" className="inline-flex items-center gap-1.5 whitespace-nowrap">
                    <Gift className="h-4 w-4" strokeWidth={1.75} />
                    {formatSurveyCta(monthlyLimitMin)}
                  </Link>
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** 추가 시간. 결제 연동 전이라 안내만 한다. */
function TopupPacksCard() {
  const inert = !PAID_PLANS_ENABLED;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          추가 시간 구매
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {TOPUP_PACKS.map((pack) => {
          const featured = Boolean(pack.badge);
          const durationLabel =
            pack.minutes >= 60 && pack.minutes % 60 === 0
              ? `${pack.minutes / 60}시간`
              : `${pack.minutes}분`;
          return (
            <div
              key={pack.id}
              className={cn(
                "flex h-full flex-col rounded-3xl bg-card p-5",
                CARD_SHADOW,
                featured && "ring-2 ring-primary",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 text-lg font-bold tracking-tight text-foreground">
                  {durationLabel}
                </p>
                {pack.badge ? (
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-primary px-3 py-1 text-base font-semibold text-primary-foreground">
                    {pack.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-base font-medium text-muted">
                {pack.minutes.toLocaleString("ko-KR")}분 추가
              </p>
              <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
                {formatPlanWon(pack.priceWon)}
              </p>
              <span
                aria-disabled={inert || undefined}
                className={cn(
                  "mt-auto inline-flex min-h-12 w-full cursor-default select-none items-center justify-center rounded-xl text-base font-semibold",
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

      <p className="text-base font-medium leading-snug text-muted-2">
        사용 시간을 다 썼을 때 고르는 선불 이용 시간입니다.
        {" "}
        유효기간 12개월 · 구독과 별도 · 잔여 시간에 합산
      </p>
    </div>
  );
}

export default function PlanPage() {
  const { data: session } = useSession();
  const plan = session?.user?.plan ?? "FREE";
  const role = session?.user?.role ?? "USER";
  const tier = resolveTier(role, plan);
  const catalogId = catalogIdForTier(tier);
  const current = PLAN_CATALOG[catalogId];

  const upgradeMailto = buildSupportMailto({
    subject:
      tier === "FREE" ? "Faith Pro 업그레이드 문의" : "Faith Team 플랜 문의",
    body: [
      "안녕하세요,",
      "",
      tier === "FREE"
        ? "Pro 플랜 업그레이드를 문의합니다."
        : "Team 플랜 도입을 문의합니다.",
      "",
      `현재 플랜: ${tierDisplayName(tier)}`,
      `이메일: ${session?.user?.email ?? ""}`,
      "",
      "---",
    ].join("\n"),
  });

  return (
    <PageContainer soft>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
            플랜
          </h1>
          <p className="mt-2 text-base font-medium text-muted">
            현재 플랜과 잔여 시간을 확인하세요.
          </p>
        </header>

        <UsageHeroCard tier={tier} />

        <Card className={CARD_SHADOW}>
          <CardHeader className="space-y-0 px-6 pb-0 pt-6">
            <CardTitle className="text-xl font-bold tracking-tight">
              포함 기능
            </CardTitle>
            <p className="mt-1.5 text-base font-medium text-muted">
              {tierDisplayName(tier)} 플랜에 포함된 기능입니다.
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-6 pt-4">
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {current.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    strokeWidth={2.5}
                  />
                  <span className="text-base leading-snug text-foreground">
                    {feature}
                  </span>
                </li>
              ))}
              {tier === "ADMIN" ? (
                <li className="flex items-start gap-2.5">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    strokeWidth={2.5}
                  />
                  <span className="text-base leading-snug text-foreground">
                    사용자 관리, AI 사용량, 운영 메뉴
                  </span>
                </li>
              ) : null}
            </ul>

            <div className="mt-6 border-t border-border/50 pt-5">
              <p className="text-base font-semibold text-foreground">
                다른 요금제
              </p>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-3">
                {(["FREE", "PRO", "TEAM"] as const).map((id) => {
                  const entry = PLAN_CATALOG[id];
                  const active = id === catalogId && tier !== "ADMIN";
                  return (
                    <div key={id} className="min-w-0">
                      <p
                        className={cn(
                          "text-base font-bold",
                          active ? "text-primary" : "text-foreground",
                        )}
                      >
                        {entry.name}
                        {active ? " · 현재" : ""}
                      </p>
                      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
                        {planMonthlyFeeLabel(entry)}
                      </p>
                      <p className="mt-1 text-base font-medium text-muted">
                        {formatPlanMinutes(entry)} · 보관함 {entry.storageLabel}
                      </p>
                      <p className="mt-1 text-base font-medium text-muted">
                        {entry.tagline}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  asChild
                  variant="outline"
                  className="min-h-12 rounded-full px-5 text-base md:h-11"
                >
                  <Link href="/pricing">
                    요금제 자세히
                    <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                  </Link>
                </Button>
                {tier !== "ADMIN" ? (
                  PAID_PLANS_ENABLED ? (
                    <Button
                      asChild
                      variant="outline"
                      className="min-h-12 rounded-full px-5 text-base md:h-11"
                    >
                      <a href={upgradeMailto}>
                        {tier === "FREE" ? "업그레이드 문의" : "Team 문의"}
                      </a>
                    </Button>
                  ) : (
                    <span
                      aria-disabled="true"
                      className="inline-flex min-h-12 cursor-default select-none items-center justify-center rounded-full border border-border bg-transparent px-5 text-base font-semibold text-foreground md:h-11"
                    >
                      {tier === "FREE" ? "업그레이드 문의" : "Team 문의"}
                    </span>
                  )
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        {tier !== "ADMIN" ? <TopupPacksCard /> : null}
      </div>
    </PageContainer>
  );
}
