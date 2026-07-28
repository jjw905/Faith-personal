"use client";

import { ArrowUpRight, Check } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PLAN_CATALOG,
  PLAN_COMPARE_ROWS,
  planMonthlyFeeLabel,
  type CatalogPlanId,
  type PlanCatalogEntry,
} from "@/lib/plans";
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

const LIMIT_ROWS: { key: keyof PlanCatalogEntry["limits"]; label: string }[] = [
  { key: "meetings", label: "회의" },
  { key: "storage", label: "보관함" },
  { key: "masking", label: "마스킹" },
  { key: "summary", label: "요약" },
  { key: "workspace", label: "워크스페이스" },
  { key: "team", label: "팀" },
  { key: "priority", label: "처리" },
];

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

function PlanRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <p className="shrink-0 text-base font-semibold leading-5 text-foreground">
        {label}
      </p>
      <div className="min-w-0 text-right text-base font-medium text-foreground">
        {children}
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className={CARD_SHADOW}>
      <CardHeader className="space-y-0 px-6 pb-0 pt-6">
        <CardTitle className="text-xl font-bold tracking-tight">
          {title}
        </CardTitle>
        <p className="mt-1.5 text-base font-medium text-muted">{description}</p>
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="divide-y divide-border px-6 pb-5 pt-1">
        {children}
        {footer}
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
  const feeLabel =
    tier === "ADMIN" ? "관리자" : planMonthlyFeeLabel(current);
  const statusLabel =
    tier === "ADMIN" ? "운영 권한" : "이용 중";

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
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-none tracking-tight text-foreground">
            플랜
          </h1>
          <p className="mt-2 text-base font-medium text-muted">
            현재 플랜, 포함 기능, 한도를 확인합니다.
          </p>
        </header>

        <SettingsSection
          title="내 플랜"
          description="구독 상태와 포함 기능을 확인합니다."
          footer={
            <div className="flex flex-wrap gap-2 pt-4">
              {tier === "FREE" ? (
                <>
                  <Button asChild className="h-12 rounded-full px-5 text-base">
                    <Link href="/pricing">
                      Pro로 올리기
                      <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-12 rounded-full px-5 text-base"
                  >
                    <a href={upgradeMailto}>업그레이드 문의</a>
                  </Button>
                </>
              ) : null}
              {tier === "PRO" ? (
                <>
                  <Button asChild className="h-12 rounded-full px-5 text-base">
                    <Link href="/pricing">
                      팀 플랜 보기
                      <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-12 rounded-full px-5 text-base"
                  >
                    <a href={upgradeMailto}>Team 문의</a>
                  </Button>
                </>
              ) : null}
              {tier === "ADMIN" ? (
                <Button asChild className="h-12 rounded-full px-5 text-base">
                  <Link href="/pricing">
                    요금제 보기
                    <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                  </Link>
                </Button>
              ) : null}
            </div>
          }
        >
          <PlanRow label="등급">
            <span
              className={cn(
                "inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold",
                TIER_BADGE[tier],
              )}
            >
              {tierDisplayName(tier)}
            </span>
          </PlanRow>
          <PlanRow label="요금">{feeLabel}</PlanRow>
          <PlanRow label="상태">{statusLabel}</PlanRow>
          <div className="py-4">
            <p className="text-base font-semibold text-foreground">포함</p>
            <ul className="mt-3 space-y-2.5">
              {current.features.map((feature) => (
                <li
                  key={feature}
                  className="flex items-start gap-2.5 text-base text-foreground"
                >
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    strokeWidth={2.5}
                  />
                  <span className="leading-snug">{feature}</span>
                </li>
              ))}
              {tier === "ADMIN" ? (
                <li className="flex items-start gap-2.5 text-base text-foreground">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                    strokeWidth={2.5}
                  />
                  <span className="leading-snug">
                    사용자 관리, AI 사용량, 운영 메뉴
                  </span>
                </li>
              ) : null}
            </ul>
          </div>
        </SettingsSection>

        <SettingsSection
          title="이용 한도"
          description="현재 계정에 적용되는 한도입니다."
        >
          {LIMIT_ROWS.map((row) => (
            <PlanRow key={row.key} label={row.label}>
              {current.limits[row.key]}
            </PlanRow>
          ))}
        </SettingsSection>

        <Card className={CARD_SHADOW}>
          <CardHeader className="space-y-0 px-6 pb-0 pt-6">
            <CardTitle className="text-xl font-bold tracking-tight">
              플랜 비교
            </CardTitle>
            <p className="mt-1.5 text-base font-medium text-muted">
              Free, Pro, Team 한도를 나란히 확인합니다. 결제는 요금제 페이지에서
              안내합니다.
            </p>
            <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
          </CardHeader>
          <CardContent className="px-6 pb-5 pt-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-3 pr-3 text-base font-semibold text-muted">
                      항목
                    </th>
                    {(["FREE", "PRO", "TEAM"] as const).map((id) => {
                      const active = id === catalogId && tier !== "ADMIN";
                      return (
                        <th
                          key={id}
                          className={cn(
                            "px-2 py-3 text-base font-bold",
                            active ? "text-primary" : "text-foreground",
                          )}
                        >
                          {PLAN_CATALOG[id].name}
                          <span
                            className={cn(
                              "mt-1 block min-h-5 text-sm font-semibold",
                              active ? "text-primary" : "text-transparent",
                            )}
                          >
                            {active ? "현재" : ""}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {PLAN_COMPARE_ROWS.map((row) => (
                    <tr key={row.key} className="border-b border-border last:border-0">
                      <th className="py-3.5 pr-3 text-base font-semibold text-foreground">
                        {row.label}
                      </th>
                      {(["FREE", "PRO", "TEAM"] as const).map((id) => (
                        <td
                          key={id}
                          className="px-2 py-3.5 text-base font-medium text-foreground"
                        >
                          {PLAN_CATALOG[id].limits[row.key]}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th className="py-3.5 pr-3 text-base font-semibold text-foreground">
                      요금
                    </th>
                    {(["FREE", "PRO", "TEAM"] as const).map((id) => (
                      <td
                        key={id}
                        className="px-2 py-3.5 text-base font-medium text-foreground"
                      >
                        {planMonthlyFeeLabel(PLAN_CATALOG[id])}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className="h-12 rounded-full px-5 text-base">
                <Link href="/pricing">
                  요금제 자세히
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-12 rounded-full px-5 text-base"
              >
                <a
                  href={buildSupportMailto({
                    subject: "Faith 플랜 문의",
                    body: [
                      "안녕하세요,",
                      "",
                      "플랜 관련 문의입니다.",
                      "",
                      `현재 플랜: ${tierDisplayName(tier)}`,
                      `이메일: ${session?.user?.email ?? ""}`,
                      "",
                      "---",
                    ].join("\n"),
                  })}
                >
                  플랜 문의
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
