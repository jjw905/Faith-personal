"use client";

import { Gift, HardDrive, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { formatBytes } from "@/lib/storage/quota";
import { DEMAND_SURVEY_ACTIVE, PAID_PLANS_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

export type UsageLimitTimeStatus = {
  limitSec: number;
  usedSec: number;
  remainingSec: number;
  monthlyLimitSec?: number;
  creditRemainingSec?: number;
  graceRemainingSec?: number;
  surveyCompleted: boolean;
  resetsAtLabel: string;
  /** false면 한도 팝업을 띄우지 않는다(오픈 준비 캠페인 off). */
  enforced?: boolean;
};

export type UsageLimitStorageStatus = {
  quota: number;
  used: number;
};

/**
 * 무료 한도 도달 안내. 강제 이동, 자동 리다이렉트 없음 — 항상 닫기로 그냥 계속 둘러볼 수 있음.
 * 오픈 준비 기간(PAID_PLANS_ENABLED=false)에는 유료 전환 문구를 절대 노출하지 않는다
 * (설문 신호 오염 방지). 플래그가 켜지면 문구가 자동으로 전환된다.
 */
export function UsageLimitDialog({
  open,
  variant,
  timeStatus,
  storageStatus,
  onClose,
}: {
  open: boolean;
  variant: "time" | "storage";
  timeStatus?: UsageLimitTimeStatus | null;
  storageStatus?: UsageLimitStorageStatus | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  const isTime = variant === "time";
  const title = isTime ? "이번 주기 분석 시간을 모두 썼어요" : "보관함 용량이 가득 찼어요";
  const Icon = isTime ? Sparkles : HardDrive;

  const showSurveyCta =
    isTime && DEMAND_SURVEY_ACTIVE && !PAID_PLANS_ENABLED && !timeStatus?.surveyCompleted;
  const showPlanCta = PAID_PLANS_ENABLED;
  const surveyDoneNoPlan =
    isTime &&
    DEMAND_SURVEY_ACTIVE &&
    !PAID_PLANS_ENABLED &&
    Boolean(timeStatus?.surveyCompleted);

  const description = isTime
    ? timeStatus
      ? surveyDoneNoPlan
        ? `이번 주기 ${Math.round((timeStatus.monthlyLimitSec ?? timeStatus.limitSec) / 60)}차감분과 5분 유예를 모두 사용했습니다. ${timeStatus.resetsAtLabel}에 초기화됩니다. 지금은 분 팩 결제를 준비하고 있습니다.`
        : `이번 주기 ${Math.round((timeStatus.monthlyLimitSec ?? timeStatus.limitSec) / 60)}차감분과 5분 유예를 모두 사용했습니다. 분 팩을 구매하면 계속할 수 있습니다.`
      : "이번 주기 분석 가능 시간을 모두 사용했습니다."
    : storageStatus
      ? `사용 ${formatBytes(storageStatus.used)} / 한도 ${formatBytes(storageStatus.quota)}. 파일을 정리하면 바로 다시 올릴 수 있습니다.`
      : "보관함 용량 한도에 도달했습니다.";

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="usage-limit-title"
        aria-describedby="usage-limit-desc"
        className="panel-surface relative w-full max-w-md overflow-hidden rounded-t-3xl px-6 pt-7 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shadow-float sm:rounded-3xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="absolute right-3.5 top-3.5 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-foreground/70 hover:bg-surface-2 hover:text-foreground sm:right-4 sm:top-4"
        >
          <X className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
          <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </span>

        <h2
          id="usage-limit-title"
          className="mt-4 text-xl font-bold tracking-tight text-foreground"
        >
          {title}
        </h2>
        <p
          id="usage-limit-desc"
          className="mt-2 text-base leading-relaxed text-muted"
        >
          {description}
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          {showSurveyCta ? (
            <Link
              href="/survey"
              onClick={onClose}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <Gift className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              짧은 설문하고 60분까지 늘리기
            </Link>
          ) : null}

          {showPlanCta ? (
            <Link
              href="/plan"
              onClick={onClose}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              <Sparkles className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              {isTime ? "더 많은 분석 시간 보기" : "더 많은 저장 공간 보기"}
            </Link>
          ) : null}

          {!isTime ? (
            <Link
              href="/vault"
              onClick={onClose}
              className={cn(
                "inline-flex h-12 w-full items-center justify-center rounded-2xl px-5 text-base font-semibold text-foreground transition-colors hover:bg-surface-2",
                showPlanCta ? "ring-1 ring-border" : "bg-primary text-primary-foreground hover:bg-primary-hover",
              )}
            >
              보관함에서 파일 정리하기
            </Link>
          ) : null}

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-2xl px-5 text-base font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            나중에 하기
          </button>
        </div>
      </div>
    </div>
  );
}
