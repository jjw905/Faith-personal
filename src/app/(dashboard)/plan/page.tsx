"use client";

import { ArrowUpRight } from "lucide-react";
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

const CARD_SHADOW =
  "rounded-3xl shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

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

export default function PlanPage() {
  const { data: session } = useSession();
  const plan = session?.user?.plan ?? "FREE";

  return (
    <PageContainer soft>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-none tracking-tight text-foreground">
            플랜
          </h1>
          <p className="mt-2 text-base font-medium text-muted">
            현재 플랜과 요금제를 확인합니다.
          </p>
        </header>

        <Card className={CARD_SHADOW}>
          <CardHeader className="space-y-0 px-6 pb-0 pt-6">
            <CardTitle className="text-xl font-bold tracking-tight">
              내 플랜
            </CardTitle>
            <p className="mt-1.5 text-base font-medium text-muted">
              구독 상태와 보관함 용량을 확인합니다.
            </p>
            <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
          </CardHeader>
          <CardContent className="divide-y divide-border px-6 pb-5 pt-1">
            <PlanRow label="플랜">{planLabel(plan)}</PlanRow>
            <PlanRow label="요금">{planFeeLabel(plan)}</PlanRow>
            <PlanRow label="용량">{planQuotaLabel(plan)}</PlanRow>
            <div className="flex flex-wrap gap-2 pt-4">
              <Button asChild className="h-12 rounded-full px-5 text-base">
                <Link href="/pricing">
                  요금제 보기
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.75} />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
