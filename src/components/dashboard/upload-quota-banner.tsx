"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Gift } from "lucide-react";

import {
  UsageLimitDialog,
  type UsageLimitTimeStatus,
} from "@/components/dashboard/usage-limit-dialog";
import { DEMAND_SURVEY_ACTIVE } from "@/lib/feature-flags";
import {
  formatQuotaLimitLabel,
  formatQuotaRemainingLabel,
  formatSurveyCta,
  isQuotaLow,
  monthlyMinutesFromSeconds,
} from "@/lib/usage-copy";
import { cn } from "@/lib/utils";

type QuotaStatus = UsageLimitTimeStatus & {
  ok: boolean;
};

/**
 * 업로드 분석 월간 잔여 안내. 실시간·팀 회의는 대상이 아니다.
 */
export function UploadQuotaBanner() {
  const [status, setStatus] = useState<QuotaStatus | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/usage/quota", { cache: "no-store" });
        const data = (await res.json()) as QuotaStatus;
        if (!cancelled && data.ok && data.enforced !== false) setStatus(data);
      } catch {
        // 조회 실패해도 업로드는 그대로 진행. 실제 한도는 서버에서 다시 확인.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;

  const monthlyLimitSec = status.monthlyLimitSec ?? status.limitSec;
  const monthlyLimitMin = monthlyMinutesFromSeconds(monthlyLimitSec);
  const low = isQuotaLow(status.remainingSec, monthlyLimitSec);
  const remainingLabel = formatQuotaRemainingLabel(
    status.remainingSec,
    monthlyLimitSec,
  );

  return (
    <>
      <div
        className={cn(
          "mx-auto mt-1 flex max-w-sm flex-col items-center gap-1 rounded-xl px-3 py-2 text-center",
          low ? "bg-primary-soft" : "bg-surface",
        )}
      >
        <p className="text-base font-medium text-foreground [text-wrap:balance]">
          {remainingLabel}
          <span className="text-muted">
            {" "}
            · {formatQuotaLimitLabel(monthlyLimitSec)}
          </span>
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          {DEMAND_SURVEY_ACTIVE && !status.surveyCompleted ? (
            <Link
              href="/survey"
              className="inline-flex min-h-12 items-center gap-1 text-base font-semibold text-primary hover:underline"
            >
              <Gift className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              {formatSurveyCta(monthlyLimitMin)}
            </Link>
          ) : null}
          {low ? (
            <button
              type="button"
              className="inline-flex min-h-12 items-center text-base font-semibold text-primary hover:underline"
              onClick={() => setDetailOpen(true)}
            >
              자세히 보기
            </button>
          ) : null}
        </div>
      </div>
      <UsageLimitDialog
        open={detailOpen}
        variant="time"
        timeStatus={status}
        onClose={() => setDetailOpen(false)}
      />
    </>
  );
}
