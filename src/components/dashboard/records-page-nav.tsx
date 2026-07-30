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
    <div
      className={cn(
        "flex items-center justify-center gap-2 border-t border-border px-4 py-3",
        className,
      )}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
        className="inline-flex h-12 min-w-12 items-center gap-1 rounded-full px-4 text-base font-semibold text-foreground ring-1 ring-inset ring-border-strong disabled:opacity-40"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
        이전
      </button>
      <span className="min-w-[3.5rem] text-center text-base font-semibold tabular-nums text-muted">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        className="inline-flex h-12 min-w-12 items-center gap-1 rounded-full px-4 text-base font-semibold text-foreground ring-1 ring-inset ring-border-strong disabled:opacity-40"
      >
        다음
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}

export const RECORDS_PAGE_SIZE = 5;
/** 일정: 모바일 뷰포트에 맞춰 페이지당 3개. 이전/다음 탭(가로 스와이프 비사용). */
export const UPCOMING_PAGE_SIZE = 3;
