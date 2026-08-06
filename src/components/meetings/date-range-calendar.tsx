"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  listMonthDayCells,
  parseIsoDateParts,
  recordsQuickRanges,
  seoulDateKey,
  shiftMonth,
} from "@/lib/meeting-date";
import { cn } from "@/lib/utils";

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

/**
 * 구간 달력 — 날짜만 두 번 누르면 시작·끝이 정해진다.
 * (시작/종료 칩·단계 안내 UI 없음)
 */
export function DateRangeCalendar({
  from,
  to,
  minIso,
  maxIso,
  onChange,
  onComplete,
  className,
  showPresets = true,
}: {
  from: string;
  to: string;
  minIso?: string;
  maxIso?: string;
  onChange: (nextFrom: string, nextTo: string) => void;
  /** 두 번째 날짜 선택(또는 같은 날 재클릭)으로 구간이 확정될 때 */
  onComplete?: (nextFrom: string, nextTo: string) => void;
  className?: string;
  showPresets?: boolean;
}) {
  const today = seoulDateKey();
  const presets = useMemo(() => recordsQuickRanges(), []);
  const anchorIso = to || from || today;
  const anchorParts = parseIsoDateParts(anchorIso);
  const [view, setView] = useState(() => ({
    year: anchorParts?.year ?? 2026,
    month: anchorParts?.month ?? 1,
  }));
  /** null이면 다음 클릭이 시작일. 있으면 다음 클릭이 종료일. */
  const [pickingEndFrom, setPickingEndFrom] = useState<string | null>(null);

  useEffect(() => {
    const parts = parseIsoDateParts(to || from || today);
    if (!parts) return;
    setView({ year: parts.year, month: parts.month });
  }, [from, to, today]);

  const cells = listMonthDayCells(view.year, view.month);
  const liveFrom = pickingEndFrom ?? from;
  const liveTo = pickingEndFrom ? pickingEndFrom : to;
  const rangeStart =
    liveFrom && liveTo
      ? liveFrom <= liveTo
        ? liveFrom
        : liveTo
      : liveFrom;
  const rangeEnd =
    liveFrom && liveTo
      ? liveFrom <= liveTo
        ? liveTo
        : liveFrom
      : liveTo;
  const minParts = minIso ? parseIsoDateParts(minIso) : null;
  const maxParts = maxIso ? parseIsoDateParts(maxIso) : null;
  const yearOptions = useMemo(() => {
    const center = view.year;
    const minYear = minParts?.year ?? center - 8;
    const maxYear = maxParts?.year ?? center + 2;
    const years: number[] = [];
    for (let year = minYear; year <= maxYear; year += 1) years.push(year);
    return years;
  }, [view.year, minParts?.year, maxParts?.year]);

  const canGoPrev =
    !minParts ||
    view.year > minParts.year ||
    (view.year === minParts.year && view.month > minParts.month);
  const canGoNext =
    !maxParts ||
    view.year < maxParts.year ||
    (view.year === maxParts.year && view.month < maxParts.month);

  function clampIso(iso: string) {
    if (minIso && iso < minIso) return minIso;
    if (maxIso && iso > maxIso) return maxIso;
    return iso;
  }

  function selectDay(iso: string) {
    const day = clampIso(iso);
    if (!pickingEndFrom) {
      setPickingEndFrom(day);
      onChange(day, day);
      return;
    }
    const start = pickingEndFrom;
    const nextFrom = day <= start ? day : start;
    const nextTo = day <= start ? start : day;
    setPickingEndFrom(null);
    onChange(nextFrom, nextTo);
    onComplete?.(nextFrom, nextTo);
  }

  function applyPreset(next: { fromIso: string; toIso: string }) {
    const nextFrom = clampIso(next.fromIso);
    const nextTo = clampIso(next.toIso);
    setPickingEndFrom(null);
    onChange(nextFrom, nextTo);
    onComplete?.(nextFrom, nextTo);
    const parts = parseIsoDateParts(nextTo);
    if (parts) setView({ year: parts.year, month: parts.month });
  }

  const selectClass =
    "h-12 min-w-0 cursor-pointer rounded-xl border-0 bg-transparent px-2 text-base font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <div
      className={cn("min-w-0 px-1 pb-1 pt-1", className)}
      role="group"
      aria-label="기간 달력"
    >
      {showPresets ? (
        <div
          className="mb-2 flex flex-wrap items-center justify-center gap-1"
          role="group"
          aria-label="빠른 선택"
        >
          {(
            [
              { id: "today", label: "오늘", range: presets.today },
              { id: "week", label: "이번 주", range: presets.week },
              { id: "month", label: "이번 달", range: presets.month },
            ] as const
          ).map((item) => {
            const active =
              !pickingEndFrom &&
              from === item.range.fromIso &&
              to === item.range.toIso;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => applyPreset(item.range)}
                className={cn(
                  "inline-flex min-h-12 items-center rounded-full px-3 text-base font-semibold transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mb-1 flex items-center justify-between gap-1">
        <button
          type="button"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
          disabled={!canGoPrev}
          className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-30"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
          <label className="sr-only" htmlFor="date-range-year">
            연도
          </label>
          <select
            id="date-range-year"
            value={view.year}
            onChange={(e) =>
              setView((v) => ({ ...v, year: Number(e.target.value) }))
            }
            className={selectClass}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}년
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="date-range-month">
            월
          </label>
          <select
            id="date-range-month"
            value={view.month}
            onChange={(e) =>
              setView((v) => ({ ...v, month: Number(e.target.value) }))
            }
            className={selectClass}
          >
            {MONTH_OPTIONS.map((month) => (
              <option key={month} value={month}>
                {month}월
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
          disabled={!canGoNext}
          className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-30"
          aria-label="다음 달"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      <p className="sr-only" aria-live="polite">
        {pickingEndFrom
          ? "종료일을 달력에서 선택하세요"
          : "시작일을 달력에서 선택하세요"}
      </p>

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
          const isStart = cell.iso === rangeStart;
          const isEnd = cell.iso === rangeEnd;
          const inRange =
            Boolean(rangeStart && rangeEnd) &&
            rangeStart !== rangeEnd &&
            cell.iso > rangeStart! &&
            cell.iso < rangeEnd!;
          const selected = isStart || isEnd;
          const isToday = cell.iso === today;
          const isPendingOnly =
            Boolean(pickingEndFrom) && cell.iso === pickingEndFrom;

          return (
            <div
              key={cell.iso}
              className={cn(
                "flex items-center justify-center py-0.5",
                inRange && "bg-primary-soft/60",
                isStart &&
                  rangeStart !== rangeEnd &&
                  "rounded-l-full bg-primary-soft/60",
                isEnd &&
                  rangeStart !== rangeEnd &&
                  "rounded-r-full bg-primary-soft/60",
              )}
            >
              <button
                type="button"
                disabled={disabled}
                aria-label={cell.iso}
                aria-pressed={selected}
                onClick={() => selectDay(cell.iso)}
                className={cn(
                  "inline-flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-base font-semibold tabular-nums transition-colors",
                  !cell.inMonth && !selected && "text-muted-2",
                  cell.inMonth && !selected && "text-foreground",
                  isToday &&
                    !selected &&
                    "text-primary ring-2 ring-inset ring-primary",
                  selected && "bg-primary text-primary-foreground",
                  isPendingOnly && "ring-2 ring-inset ring-primary/50",
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
