"use client";

import { useCallback, useState, type ReactNode } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FEATURE_LABELS,
  PAYMENT_INTENT_LABELS,
  PRICE_PREFERENCE_LABELS,
} from "@/lib/stt/survey";
import type { SurveyStatsSummary } from "@/lib/stt/survey-stats";
import { cn } from "@/lib/utils";

const CARD_SHADOW =
  "rounded-3xl shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

function formatPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function sortedEntries<K extends string>(map: Partial<Record<K, number>>) {
  return Object.entries(map)
    .filter((e): e is [K, number] => typeof e[1] === "number")
    .sort((a, b) => b[1] - a[1]);
}

export function SurveyStatsDashboard({
  initial,
}: {
  initial: SurveyStatsSummary;
}) {
  const [summary, setSummary] = useState(initial);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/survey-stats", { cache: "no-store" });
      const data = (await res.json()) as { ok?: boolean; summary?: SurveyStatsSummary };
      if (data.ok && data.summary) setSummary(data.summary);
    } finally {
      setLoading(false);
    }
  }, []);

  const empty = summary.total === 0;
  const maxPayment = Math.max(1, ...sortedEntries(summary.byPaymentIntent).map((e) => e[1]));
  const maxPrice = Math.max(1, ...sortedEntries(summary.byPricePreference).map((e) => e[1]));
  const maxFeature = Math.max(1, ...sortedEntries(summary.byFeature).map((e) => e[1]));
  const maxSatisfaction = Math.max(
    1,
    ...sortedEntries(summary.satisfactionCounts).map((e) => e[1]),
  );

  return (
    <div className="flex flex-col gap-6">
      <SectionCard
        title="참여 현황"
        description="결제 의향, 성능 만족도 설문 응답 요약"
        action={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-border-strong bg-surface px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} strokeWidth={1.75} />
            새로고침
          </button>
        }
      >
        <div className="grid grid-cols-2 divide-y divide-border lg:grid-cols-4 lg:divide-x lg:divide-y-0">
          <StatCell
            label="참여 건수"
            value={String(summary.total)}
            hint={`전체 이용자 ${summary.totalUsers}명 중`}
          />
          <StatCell
            label="참여율"
            value={formatPct(summary.responseRate)}
            hint="설문 완료 / 전체 이용자"
          />
          <StatCell
            label="결제 의향 비율"
            value={formatPct(summary.willingRate)}
            hint="적정 금액이면 결제하겠다"
          />
          <StatCell
            label="평균 만족도"
            value={summary.avgSatisfaction.toFixed(1)}
            hint="AI 회의록 성능, 5점 만점"
          />
        </div>
      </SectionCard>

      {empty ? (
        <Card className={CARD_SHADOW}>
          <CardContent className="px-6 py-16 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <ClipboardList className="h-5 w-5" strokeWidth={1.75} />
            </div>
            <p className="text-lg font-semibold text-foreground">
              아직 참여한 설문이 없습니다
            </p>
            <p className="mx-auto mt-2 max-w-md text-base text-muted">
              이용자가 설문을 완료하면 여기에 통계가 쌓입니다.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="결제 의향" description="계속 이용한다면 결제 여부">
            <BarList
              entries={sortedEntries(summary.byPaymentIntent)}
              max={maxPayment}
              labelOf={(k) => (PAYMENT_INTENT_LABELS as Record<string, string>)[k] ?? k}
            />
          </SectionCard>

          <SectionCard title="적정 금액대" description="결제 의향이 있다고 답한 응답만">
            <BarList
              entries={sortedEntries(summary.byPricePreference)}
              max={maxPrice}
              labelOf={(k) => (PRICE_PREFERENCE_LABELS as Record<string, string>)[k] ?? k}
            />
          </SectionCard>

          <SectionCard title="AI 회의록 성능" description="1(불만족) ~ 5(매우 만족)">
            <BarList
              entries={sortedEntries(summary.satisfactionCounts)}
              max={maxSatisfaction}
              labelOf={(k) => `${k}점`}
            />
          </SectionCard>

          <SectionCard title="가장 중요한 기능" description="다중 선택, 중복 집계">
            <BarList
              entries={sortedEntries(summary.byFeature)}
              max={maxFeature}
              labelOf={(k) => (FEATURE_LABELS as Record<string, string>)[k] ?? k}
            />
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function BarList({
  entries,
  max,
  labelOf,
}: {
  entries: [string, number][];
  max: number;
  labelOf: (key: string) => string;
}) {
  if (entries.length === 0) {
    return (
      <div className="flex min-h-24 items-center justify-center py-6 text-base text-muted">
        표시할 데이터가 없습니다
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {entries.map(([key, count]) => {
        const pct = Math.round((count / max) * 100);
        return (
          <li key={key} className="space-y-2 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold text-foreground">{labelOf(key)}</span>
              <span className="text-base tabular-nums text-muted">{count}건</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function SectionCard({
  title,
  description,
  children,
  className,
  action,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <Card className={cn(CARD_SHADOW, className)}>
      <CardHeader className="space-y-0 px-6 pb-0 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-xl font-bold tracking-tight">{title}</CardTitle>
            {description ? (
              <p className="mt-1.5 text-base font-medium text-muted">{description}</p>
            ) : null}
          </div>
          {action}
        </div>
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
      </CardHeader>
      <CardContent className="px-6 pb-5 pt-1">{children}</CardContent>
    </Card>
  );
}

function StatCell({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="px-0 py-4 first:pt-3 last:pb-3 lg:px-4 lg:first:pl-0 lg:last:pr-0 lg:py-4">
      <p className="text-base font-semibold text-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </p>
      <p className="mt-1 text-base leading-snug text-muted">{hint}</p>
    </div>
  );
}
