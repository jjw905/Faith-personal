"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/** 목록 페이지 네비. 한 페이지 최대 개수는 호출측에서 slice. */
export function RecordsPageNav({
  page,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      className={cn(
        "flex items-center justify-center gap-1 py-3",
        className,
      )}
      aria-label="페이지"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className="inline-flex h-12 min-w-12 cursor-pointer items-center gap-0.5 rounded-xl px-3 text-base font-semibold text-muted transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
        aria-label="이전 페이지"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
        이전
      </button>
      <p
        className="min-w-[4.25rem] px-2 text-center text-base tabular-nums tracking-tight"
        aria-current="page"
        aria-label={`${totalPages}페이지 중 ${page}페이지`}
      >
        <span className="font-semibold text-foreground">{page}</span>
        <span className="mx-1 font-medium text-muted-2">/</span>
        <span className="font-medium text-muted">{totalPages}</span>
      </p>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        className="inline-flex h-12 min-w-12 cursor-pointer items-center gap-0.5 rounded-xl px-3 text-base font-semibold text-muted transition-colors hover:bg-surface hover:text-foreground disabled:pointer-events-none disabled:opacity-35"
        aria-label="다음 페이지"
      >
        다음
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </nav>
  );
}

export const RECORDS_PAGE_SIZE_DESKTOP = 6;
export const RECORDS_PAGE_SIZE_MOBILE = 4;
/** 기본값(데스크톱). 반응형은 recordsPageSize(isMdUp) */
export const RECORDS_PAGE_SIZE = RECORDS_PAGE_SIZE_DESKTOP;

/** 목록(1행 1개) 기준. 예전 격자 3칸용이 아님. */
export const UPCOMING_PAGE_SIZE_DESKTOP = 6;
export const UPCOMING_PAGE_SIZE_MOBILE = 4;
/** 기본값(데스크톱). 반응형은 upcomingPageSize(isMdUp) */
export const UPCOMING_PAGE_SIZE = UPCOMING_PAGE_SIZE_DESKTOP;

export function upcomingPageSize(isMdUp: boolean) {
  return isMdUp ? UPCOMING_PAGE_SIZE_DESKTOP : UPCOMING_PAGE_SIZE_MOBILE;
}

export function recordsPageSize(isMdUp: boolean) {
  return isMdUp ? RECORDS_PAGE_SIZE_DESKTOP : RECORDS_PAGE_SIZE_MOBILE;
}
