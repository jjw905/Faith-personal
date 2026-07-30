"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Gift } from "lucide-react";

import { cn } from "@/lib/utils";

type QuotaStatus = {
  ok: boolean;
  usedSec: number;
  limitSec: number;
  remainingSec: number;
  surveyCompleted: boolean;
};

/**
 * 결제 수요조사 기간 한정 안내. 실시간·팀 회의는 대상이 아니고 업로드
 * 분석에만 적용되므로 이 배너도 업로드 화면에만 둔다.
 */
export function UploadQuotaBanner() {
  const [status, setStatus] = useState<QuotaStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/usage/quota", { cache: "no-store" });
        const data = (await res.json()) as QuotaStatus;
        if (!cancelled && data.ok) setStatus(data);
      } catch {
        // 조회 실패해도 업로드는 그대로 진행. 실제 한도는 서버에서 다시 확인.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!status) return null;

  const remainingMin = Math.floor(status.remainingSec / 60);
  const limitMin = Math.round(status.limitSec / 60);
  const low = status.remainingSec <= 0;

  return (
    <div
      className={cn(
        "mx-auto mt-1 flex max-w-sm flex-col items-center gap-1 rounded-xl px-3 py-2 text-center",
        low ? "bg-primary-soft" : "bg-surface",
      )}
    >
      <p className="text-base font-medium text-foreground">
        이번 주기 분석 가능 시간 {remainingMin}분 남음{" "}
        <span className="text-muted">(월 {limitMin}분)</span>
      </p>
      {!status.surveyCompleted ? (
        <Link
          href="/survey"
          className="inline-flex min-h-8 items-center gap-1 text-base font-semibold text-primary hover:underline"
        >
          <Gift className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          짧은 설문하고 시간 늘리기
        </Link>
      ) : null}
    </div>
  );
}
