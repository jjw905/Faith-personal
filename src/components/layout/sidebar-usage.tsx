"use client";

import Link from "next/link";
import { Gauge } from "lucide-react";
import { useEffect, useState } from "react";

import { Progress } from "@/components/ui/progress";
import {
  formatQuotaRemainingLabel,
  monthlyMinutesFromSeconds,
} from "@/lib/usage-copy";
import { cn } from "@/lib/utils";

type QuotaStatus = {
  ok: boolean;
  usedSec: number;
  limitSec: number;
  monthlyLimitSec?: number;
  remainingSec: number;
  resetsAtLabel?: string;
  enforced?: boolean;
};

function gaugeTone(pct: number): string {
  if (pct >= 100) return "bg-red-600";
  if (pct >= 80) return "bg-warning";
  return "bg-primary";
}

function CircularMiniGauge({
  pct,
  className,
}: {
  pct: number;
  className?: string;
}) {
  const r = 9;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const offset = c * (1 - clamped / 100);
  const stroke =
    clamped >= 100
      ? "stroke-red-600"
      : clamped >= 80
        ? "stroke-warning"
        : "stroke-primary";

  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-5 w-5 shrink-0 -rotate-90", className)}
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        className="stroke-surface-2"
        strokeWidth="2.5"
      />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        className={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export function SidebarUsage({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
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
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const label = "잔여 시간";
  const enforced = status?.enforced !== false;
  const effectiveLimitSec = status
    ? (status.monthlyLimitSec ?? status.limitSec)
    : 0;
  const remainingMin = status
    ? Math.floor(status.remainingSec / 60)
    : 0;
  const limitMin = monthlyMinutesFromSeconds(effectiveLimitSec);
  const pct =
    status && effectiveLimitSec > 0
      ? (status.usedSec / effectiveLimitSec) * 100
      : 0;
  const title =
    status && enforced
      ? formatQuotaRemainingLabel(status.remainingSec, effectiveLimitSec)
      : status && !enforced
        ? "이용 제한 없음"
        : label;

  if (collapsed) {
    return (
      <Link
        href="/plan"
        onClick={onNavigate}
        title={title}
        aria-label={`${label}: ${title}`}
        className={cn(
          "group mt-1 flex cursor-pointer items-center justify-center rounded-xl px-2 py-2.5 outline-none transition-colors",
          "hover:bg-surface-2 hover:text-foreground",
          "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
          "text-muted",
        )}
      >
        {loading ? (
          <span className="h-5 w-5 animate-pulse rounded-full bg-surface-2" />
        ) : status && enforced ? (
          <CircularMiniGauge pct={pct} />
        ) : (
          <Gauge
            className="h-5 w-5 text-muted-2 group-hover:text-foreground"
            strokeWidth={1.75}
          />
        )}
        <span className="sr-only">
          {label} {title}
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/plan"
      onClick={onNavigate}
      className={cn(
        "mt-1 block cursor-pointer rounded-xl px-3 py-2.5 outline-none transition-colors",
        "hover:bg-surface-2",
        "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-base font-medium text-muted">
          {label}
        </p>
        {loading ? (
          <span className="h-4 w-16 animate-pulse rounded bg-surface-2" />
        ) : status && enforced ? (
          <p className="shrink-0 text-base font-semibold tabular-nums text-foreground">
            {remainingMin}
            <span className="font-medium text-muted">
              {" "}
              / {limitMin}분
            </span>
          </p>
        ) : status && !enforced ? (
          <p className="shrink-0 text-base font-semibold text-foreground">
            이용 제한 없음
          </p>
        ) : (
          <p className="shrink-0 text-base font-medium text-muted-2">—</p>
        )}
      </div>

      {loading ? (
        <div className="mt-2 h-2 w-full animate-pulse rounded-full bg-surface-2" />
      ) : status && enforced ? (
        <Progress
          value={pct}
          className="mt-2 h-2"
          indicatorClassName={gaugeTone(pct)}
        />
      ) : null}

      {!loading && status?.resetsAtLabel && enforced ? (
        <p className="mt-1.5 truncate whitespace-nowrap text-base font-medium text-muted-2">
          <span className="tabular-nums text-muted">{status.resetsAtLabel}</span>
          에 초기화
        </p>
      ) : null}
    </Link>
  );
}
