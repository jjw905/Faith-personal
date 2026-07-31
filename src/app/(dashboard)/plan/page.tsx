"use client";

import { ArrowUpRight, Check, ChevronDown, Gift } from "lucide-react";
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
  PLAN_OVERAGE_NOTE,
  TOPUP_PACKS,
  formatPlanMinutes,
  formatPlanWon,
  planMonthlyFeeLabel,
  type CatalogPlanId,
} from "@/lib/plans";
import { SURVEY_UNLOCKED_MONTHLY_MINUTES } from "@/lib/stt/survey";
import { buildSupportMailto } from "@/lib/support-email";
import { cn } from "@/lib/utils";
import type { AccountTier } from "@/types/user";

const CARD_SHADOW =
  "rounded-3xl shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

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

  return (
    <Card className={CARD_SHADOW}>
      <CardContent className="px-6 py-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold text-muted">
            사용량
          </p>
          <span
            className={cn(
              "inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold",
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
              한도 없음
            </p>
            <p className="text-base font-medium text-muted">
              지금은 분석 시간 한도를 적용하지 않습니다.
            </p>
          </div>
        ) : (
          <>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-4xl font-bold tracking-tight text-foreground tabular-nums">
                {Math.floor(status.usedSec / 60)}차감분
              </span>
              <span className="text-lg font-medium text-muted">
                / {Math.round((status.monthlyLimitSec ?? status.limitSec) / 60)}차감분
              </span>
            </div>

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
                  초기화
                </p>
              ) : (
                <span />
              )}
              {status.surveyCompleted ? (
                <span className="text-base font-semibold text-primary">
                  설문 참여로 한도 확장 적용 중
                </span>
              ) : (
                <Button
                  asChild
                  size="sm"
                  className="h-10 rounded-full px-4 text-sm"
                >
                  <Link href="/survey">
                    <Gift className="h-4 w-4" strokeWidth={1.75} />
                    설문 참여하고 {SURVEY_UNLOCKED_MONTHLY_MINUTES}분까지
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

/** 추가 분 팩. 결제 연동 전이라 안내만 한다. */
function TopupPacksCard() {
  const locked = !PAID_PLANS_ENABLED;

  return (
    <Card className={CARD_SHADOW}>
      <CardHeader className="space-y-0 px-6 pb-0 pt-6">
        <CardTitle className="text-xl font-bold tracking-tight">
          추가 차감분 구매
        </CardTitle>
        <p className="mt-1.5 text-base font-medium text-muted">
          선불 차감분, 유효기간 12개월
        </p>
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-4">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {TOPUP_PACKS.map((pack) => (
            <div key={pack.id} className="relative rounded-xl bg-surface px-3.5 py-3">
              {pack.badge ? (
                <span className="absolute right-2.5 top-2.5 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                  {pack.badge}
                </span>
              ) : null}
              <p className="text-base font-bold tabular-nums text-foreground">
                {pack.minutes}차감분
              </p>
              <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
                {formatPlanWon(pack.priceWon)}
              </p>
              <button
                type="button"
                disabled={locked}
                aria-disabled={locked}
                title={locked ? "준비 중입니다" : undefined}
                className={cn(
                  "mt-2 min-h-8 w-full rounded-lg text-sm font-semibold transition-colors",
                  locked
                    ? "cursor-not-allowed bg-border/60 text-muted-2"
                    : "bg-foreground text-background hover:bg-foreground/90",
                )}
              >
                {locked ? "준비중" : "구매"}
              </button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
            현재 플랜과 사용량을 확인하세요.
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
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {current.features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-start gap-2.5 rounded-xl bg-surface px-3.5 py-3"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    strokeWidth={2.5}
                  />
                  <span className="text-base leading-snug text-foreground">
                    {feature}
                  </span>
                </div>
              ))}
              {tier === "ADMIN" ? (
                <div className="flex items-start gap-2.5 rounded-xl bg-surface px-3.5 py-3">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    strokeWidth={2.5}
                  />
                  <span className="text-base leading-snug text-foreground">
                    사용자 관리, AI 사용량, 운영 메뉴
                  </span>
                </div>
              ) : null}
            </div>
            {tier !== "ADMIN" ? (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                {PLAN_OVERAGE_NOTE}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {tier !== "ADMIN" ? <TopupPacksCard /> : null}

        <details className={cn(CARD_SHADOW, "group bg-card")}>
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-6 py-4 [&::-webkit-details-marker]:hidden">
            <span className="text-xl font-bold tracking-tight text-foreground">
              다른 요금제
            </span>
            <ChevronDown
              className="h-5 w-5 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
              strokeWidth={1.75}
            />
          </summary>
          <div className="border-t border-border px-6 pb-6 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(["FREE", "PRO", "TEAM"] as const).map((id) => {
                const entry = PLAN_CATALOG[id];
                const active = id === catalogId && tier !== "ADMIN";
                return (
                  <div
                    key={id}
                    className={cn(
                      "relative rounded-2xl px-4 py-3.5",
                      active
                        ? "bg-primary-soft ring-1 ring-primary/30"
                        : "bg-surface",
                    )}
                  >
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
                    <p className="mt-1 text-sm font-medium text-muted">
                      {formatPlanMinutes(entry)}, {entry.storageLabel}
                    </p>
                    <p className="mt-1 text-sm font-medium text-muted">
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
                className="h-11 rounded-full px-5 text-base"
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
                    className="h-11 rounded-full px-5 text-base"
                  >
                    <a href={upgradeMailto}>
                      {tier === "FREE" ? "업그레이드 문의" : "Team 문의"}
                    </a>
                  </Button>
                ) : (
                  <Button
                    disabled
                    variant="outline"
                    className="h-11 cursor-not-allowed rounded-full px-5 text-base text-muted-2"
                    title="준비 중입니다"
                  >
                    {tier === "FREE" ? "업그레이드" : "Team 전환"} · 준비중
                  </Button>
                )
              ) : null}
            </div>
          </div>
        </details>
      </div>
    </PageContainer>
  );
}
