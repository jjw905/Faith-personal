"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";

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
  const plan = session?.user?.plan ?? "FREE";

  return (
    <PageContainer>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem] sm:leading-9">
            플랜
          </h1>
          <p className="mt-1 text-base text-muted">
            현재 플랜과 요금제를 확인합니다.
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
      </div>
    </PageContainer>
  );
}
