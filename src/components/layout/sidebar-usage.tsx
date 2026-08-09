"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Gauge, Gift } from "lucide-react";
import { useEffect, useState } from "react";

import { Progress } from "@/components/ui/progress";
import {
  RAIL_ICON_CELL,
  RailHoverCaption,
} from "@/components/layout/rail-hover-caption";
import { DEMAND_SURVEY_ACTIVE } from "@/lib/feature-flags";
import { SURVEY_COMPLETED_EVENT } from "@/lib/stt/survey";
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

/** 사용 비율 기준 색. 게이지 채움은 잔여 비율(가득=할당량 남음). */
function gaugeTone(usedPct: number): string {
  if (usedPct >= 100) return "bg-red-600";
  if (usedPct >= 80) return "bg-warning";
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
  const usedPct = 100 - clamped;
  const stroke =
    usedPct >= 100
      ? "stroke-red-600"
      : usedPct >= 80
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
  const pathname = usePathname();
  const { data: session } = useSession();
  const [status, setStatus] = useState<QuotaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [surveyGiftAvailable, setSurveyGiftAvailable] = useState(false);
  const active = pathname === "/plan" || pathname.startsWith("/plan/");

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

  useEffect(() => {
    if (!DEMAND_SURVEY_ACTIVE || !session?.user?.id) {
      setSurveyGiftAvailable(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/survey", { cache: "no-store" });
        const data = (await res.json()) as { ok?: boolean; completed?: boolean };
        if (!cancelled && data.ok) setSurveyGiftAvailable(!data.completed);
      } catch {
        if (!cancelled) setSurveyGiftAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, pathname]);

  useEffect(() => {
    function onSurveyCompleted() {
      setSurveyGiftAvailable(false);
    }
    window.addEventListener(SURVEY_COMPLETED_EVENT, onSurveyCompleted);
    return () => {
      window.removeEventListener(SURVEY_COMPLETED_EVENT, onSurveyCompleted);
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
  // 가득 찬 게이지 = 할당량이 남은 상태(쓸수록 줄어듦).
  const remainingPct =
    status && effectiveLimitSec > 0
      ? Math.min(
          100,
          Math.max(0, (status.remainingSec / effectiveLimitSec) * 100),
        )
      : 0;
  const usedPct = 100 - remainingPct;
  const title =
    status && enforced
      ? formatQuotaRemainingLabel(status.remainingSec, effectiveLimitSec)
      : status && !enforced
        ? "이용 제한 없음"
        : label;
  const hoverCaption =
    loading || !status
      ? label
      : !enforced
        ? "제한 없음"
        : remainingMin <= 0
          ? "잔여 없음"
          : `${remainingMin}분 남음`;

  if (collapsed) {
    return (
      <Link
        href="/plan"
        onClick={onNavigate}
        aria-label={`${label}: ${title}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          RAIL_ICON_CELL,
          "mt-1",
          "hover:bg-surface-2 hover:text-foreground",
          "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-surface-2 text-foreground" : "text-muted",
        )}
      >
        {loading ? (
          <span className="h-5 w-5 animate-pulse rounded-full bg-surface-2" />
        ) : status && enforced ? (
          <CircularMiniGauge pct={remainingPct} />
        ) : (
          <Gauge
            className="h-5 w-5 text-muted-2 group-hover:text-foreground"
            strokeWidth={1.75}
          />
        )}
        {surveyGiftAvailable ? (
          <Gift
            className="absolute right-0.5 top-0.5 h-3 w-3 text-primary"
            strokeWidth={1.75}
            aria-label="설문 선물 가능"
          />
        ) : null}
        <span className="sr-only">
          {label} {title}
        </span>
        <RailHoverCaption className="max-w-[5.5rem] whitespace-nowrap">
          {hoverCaption}
        </RailHoverCaption>
      </Link>
    );
  }

  return (
    <Link
      href="/plan"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "mt-1 block cursor-pointer rounded-xl px-3 py-2.5 outline-none transition-colors",
        "hover:bg-surface-2",
        "focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-surface-2",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-base font-medium text-muted">
          <span className="truncate">{label}</span>
          {surveyGiftAvailable ? (
            <Gift
              className="h-4 w-4 shrink-0 text-primary"
              strokeWidth={1.75}
              aria-label="설문 선물 가능"
            />
          ) : null}
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
          value={remainingPct}
          className="mt-2 h-2"
          indicatorClassName={gaugeTone(usedPct)}
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
