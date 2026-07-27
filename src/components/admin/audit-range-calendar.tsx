"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  listMonthDayCells,
  parseIsoDateParts,
  seoulDateKey,
  shiftMonth,
} from "@/lib/meeting-date";
import { cn } from "@/lib/utils";

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"] as const;

function formatYmdLabel(ymd: string) {
  const parts = parseIsoDateParts(ymd);
  if (!parts) return "—";
  return `${parts.month}.${parts.day}`;
}

/**
 * 감사 기간 달력. 탭만으로 시작·종료 선택.
 * 모바일 키보드/자판 입력 없음.
 */
export function AuditRangeCalendar({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (nextFrom: string, nextTo: string) => void;
}) {
  const today = seoulDateKey();
  const todayParts = parseIsoDateParts(today);
  const anchor = to || from || today;
  const anchorParts = parseIsoDateParts(anchor);
  const [view, setView] = useState(() => ({
    year: anchorParts?.year ?? todayParts?.year ?? 2026,
    month: anchorParts?.month ?? todayParts?.month ?? 1,
  }));

  useEffect(() => {
    const parts = parseIsoDateParts(anchor);
    if (!parts) return;
    setView({ year: parts.year, month: parts.month });
  }, [anchor]);

  const cells = listMonthDayCells(view.year, view.month);
  const pickingEnd = Boolean(from && to && from === to);
  const rangeStart = from && to ? (from <= to ? from : to) : from;
  const rangeEnd = from && to ? (from <= to ? to : from) : to;
  const canGoNext =
    !todayParts ||
    view.year < todayParts.year ||
    (view.year === todayParts.year && view.month < todayParts.month);

  function selectDay(iso: string) {
    if (iso > today) return;

    if (!from || !to || from !== to) {
      onChange(iso, iso);
      return;
    }
    if (iso < from) onChange(iso, from);
    else onChange(from, iso);
  }

  return (
    <div className="min-w-0 rounded-2xl bg-surface px-2 pb-3 pt-3 ring-1 ring-border">
      <div className="mb-3 flex items-center justify-center gap-2 px-2">
        <span
          className={cn(
            "inline-flex h-12 min-w-[4.5rem] items-center justify-center rounded-full px-3 text-base font-semibold tabular-nums",
            from
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted ring-1 ring-inset ring-border-strong",
          )}
        >
          {from ? formatYmdLabel(from) : "시작"}
        </span>
        <span className="text-base text-muted-2" aria-hidden>
          ~
        </span>
        <span
          className={cn(
            "inline-flex h-12 min-w-[4.5rem] items-center justify-center rounded-full px-3 text-base font-semibold tabular-nums",
            to && from !== to
              ? "bg-primary text-primary-foreground"
              : to
                ? "bg-primary-soft text-primary"
                : "bg-card text-muted ring-1 ring-inset ring-border-strong",
          )}
        >
          {to ? formatYmdLabel(to) : "종료"}
        </span>
      </div>

      <p className="mb-2 px-2 text-center text-base text-muted">
        {pickingEnd ? "종료일을 선택하세요" : "시작일을 선택하세요"}
      </p>

      <div className="mb-1 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
          className="inline-flex h-12 w-12 items-center justify-center rounded-full text-foreground hover:bg-card"
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
          className="inline-flex h-12 w-12 items-center justify-center rounded-full text-foreground hover:bg-card disabled:opacity-30"
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
          const disabled = cell.iso > today;
          const isStart = cell.iso === rangeStart;
          const isEnd = cell.iso === rangeEnd;
          const inRange =
            Boolean(rangeStart && rangeEnd) &&
            cell.iso > rangeStart! &&
            cell.iso < rangeEnd!;
          const selected = isStart || isEnd;

          return (
            <div
              key={cell.iso}
              className={cn(
                "flex items-center justify-center py-0.5",
                inRange && "bg-primary-soft/60",
                isStart && rangeStart !== rangeEnd && "rounded-l-full bg-primary-soft/60",
                isEnd && rangeStart !== rangeEnd && "rounded-r-full bg-primary-soft/60",
              )}
            >
              <button
                type="button"
                disabled={disabled}
                aria-label={cell.iso}
                aria-pressed={selected}
                onClick={() => selectDay(cell.iso)}
                className={cn(
                  "inline-flex h-12 w-12 items-center justify-center rounded-full text-base font-semibold tabular-nums transition-colors",
                  !cell.inMonth && !selected && "text-muted-2",
                  cell.inMonth && !selected && "text-foreground",
                  cell.iso === today && !selected && "text-primary",
                  selected && "bg-primary text-primary-foreground",
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
