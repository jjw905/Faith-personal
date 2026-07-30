"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";

import {
  listMonthDayCells,
  parseIsoDateParts,
  seoulDateKey,
  shiftMonth,
} from "@/lib/meeting-date";
import { cn } from "@/lib/utils";

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * 단일 날짜 월 달력.
 * MD3 comfortable / Faith 터치: 날짜·월 이동 셀 48×48, 본문 text-base.
 * (감사 기간 달력과 동일 타깃. 기존 예정 달력 h-10은 모바일에서 좁음.)
 */
export function MonthDayCalendar({
  selectedIso,
  minIso,
  maxIso,
  onSelect,
  className,
}: {
  selectedIso: string;
  minIso?: string;
  maxIso?: string;
  onSelect: (iso: string) => void;
  className?: string;
}) {
  const todayIso = seoulDateKey();
  const selectedParts = parseIsoDateParts(selectedIso);
  const minParts = minIso ? parseIsoDateParts(minIso) : null;
  const [view, setView] = useState(() => ({
    year: selectedParts?.year ?? minParts?.year ?? 2026,
    month: selectedParts?.month ?? minParts?.month ?? 1,
  }));

  useEffect(() => {
    const parts = parseIsoDateParts(selectedIso);
    if (!parts) return;
    setView({ year: parts.year, month: parts.month });
  }, [selectedIso]);

  const cells = listMonthDayCells(view.year, view.month);
  const canGoPrev =
    !minParts ||
    view.year > minParts.year ||
    (view.year === minParts.year && view.month > minParts.month);
  const maxParts = maxIso ? parseIsoDateParts(maxIso) : null;
  const canGoNext =
    !maxParts ||
    view.year < maxParts.year ||
    (view.year === maxParts.year && view.month < maxParts.month);

  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-card px-2 pb-3 pt-3",
        className,
      )}
      role="group"
      aria-label="날짜 달력"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
          disabled={!canGoPrev}
          className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-30"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <p className="text-base font-semibold tabular-nums text-foreground">
          {view.year}년 {view.month}월
        </p>
        <button
          type="button"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
          disabled={!canGoNext}
          className="inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-30"
          aria-label="다음 달"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAY_HEADERS.map((label) => (
          <div
            key={label}
            className="flex h-10 items-center justify-center text-sm font-medium text-muted"
          >
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const disabled =
            Boolean(minIso && cell.iso < minIso) ||
            Boolean(maxIso && cell.iso > maxIso);
          const selected = cell.iso === selectedIso;
          const isToday = cell.iso === todayIso;
          return (
            <div
              key={cell.iso}
              className="flex items-center justify-center py-0.5"
            >
              <button
                type="button"
                disabled={disabled}
                aria-label={cell.iso}
                aria-pressed={selected}
                onClick={() => onSelect(cell.iso)}
                className={cn(
                  "inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-base font-semibold tabular-nums transition-colors",
                  !cell.inMonth && !selected && "text-muted-2",
                  cell.inMonth &&
                    !selected &&
                    "text-foreground hover:bg-surface",
                  // 오늘: 색만으로는 primary가 foreground와 거의 구별 안 돼 링으로 표시 (M3 date picker 패턴)
                  isToday && !selected && "text-primary ring-2 ring-inset ring-primary",
                  selected &&
                    "bg-primary font-semibold text-primary-foreground",
                  selected && isToday && "ring-2 ring-inset ring-primary-foreground/70",
                  disabled && "pointer-events-none opacity-30",
                )}
              >
                {cell.day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
