"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { fixtureVaultUsage } from "@/lib/page-ux-fixtures";
import {
  VAULT_CHANGED_EVENT,
  VAULT_QUOTA_BYTES,
  formatVaultSize,
  getVaultUsage,
  type VaultUsage,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

function planLabel(plan?: string | null) {
  if (plan === "PRO") return "Pro";
  return "Free";
}

function planFeeLabel(plan?: string | null) {
  if (plan === "PRO") return "월 ₩19,000";
  return "월 ₩0";
}

function planQuotaLabel(plan?: string | null) {
  if (plan === "PRO") return "보관함 20GB";
  return "보관함 500MB";
}

export default function PlanPage() {
  const { data: session } = useSession();
  const { scenarioId } = usePageUxPreview();
  const plan = session?.user?.plan ?? "FREE";
  const [usage, setUsage] = useState<VaultUsage | null>(null);

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const next = await getVaultUsage();
        if (alive) setUsage(next);
      } catch {
        if (alive) setUsage(null);
      }
    }
    void refresh();
    function onChanged() {
      void refresh();
    }
    window.addEventListener(VAULT_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      window.removeEventListener(VAULT_CHANGED_EVENT, onChanged);
    };
  }, []);

  const viewUsage =
    scenarioId === "empty"
      ? fixtureVaultUsage("empty")
      : scenarioId === "full"
        ? fixtureVaultUsage("full")
        : scenarioId === "quota-tight"
          ? fixtureVaultUsage("tight")
          : scenarioId === "quota-full"
            ? fixtureVaultUsage("maxed")
            : usage;

  const quota = viewUsage?.quota ?? VAULT_QUOTA_BYTES;
  const used = viewUsage?.used ?? 0;
  const ratio = quota > 0 ? Math.min(1, used / quota) : 0;
  const barPct = Math.max(2, Math.round(ratio * 100));
  const tight = ratio >= 0.9;

  return (
    <PageContainer>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-9">
            플랜
          </h1>
          <p className="mt-1 text-base text-muted">
            현재 플랜, 할당량, 요금제를 확인합니다.
          </p>
        </header>

        <section className="panel-surface rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-muted">현재 플랜</p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">
                {planLabel(plan)}
              </p>
              <p className="mt-1 text-base text-muted">{planQuotaLabel(plan)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-muted">요금</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
                {planFeeLabel(plan)}
              </p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild className="h-11 rounded-full px-5">
              <Link href="/pricing">
                요금제 보기
                <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
              </Link>
            </Button>
          </div>
        </section>

        <section className="panel-surface rounded-2xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-semibold text-foreground">보관함 할당량</h2>
            <p
              className={cn(
                "text-sm font-semibold tabular-nums",
                tight ? "text-warning" : "text-foreground",
              )}
            >
              {formatVaultSize(used)} / {formatVaultSize(quota)}
            </p>
          </div>
          <div
            className="mt-4 h-2.5 overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            aria-label={`보관함 ${formatVaultSize(used)} / ${formatVaultSize(quota)}`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width,background-color]",
                tight ? "bg-warning" : "bg-primary",
              )}
              style={{ width: `${barPct}%` }}
            />
          </div>
          <p className="mt-3 text-base text-muted">
            남은 용량 {formatVaultSize(Math.max(0, quota - used))}
          </p>
          <div className="mt-4">
            <Button asChild variant="secondary" className="h-11 rounded-full px-5">
              <Link href="/vault">보관함 열기</Link>
            </Button>
          </div>
        </section>
      </div>
    </PageContainer>
  );
}
