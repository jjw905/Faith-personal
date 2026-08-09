"use client";

import { useEffect, useRef, type RefObject } from "react";

import {
  listDayStripRange,
  seoulDateKey,
  type UpcomingDayOption,
} from "@/lib/meeting-date";
import { cn } from "@/lib/utils";

/**
 * 일정 관리 가로 일 스트립.
 * 한 칸 = 세로 스택 (일자 숫자 + 요일 한 글자), 넓은 터치 칸.
 */
export function ScheduleDayStrip({
  selectedIso,
  markedIsos,
  onSelect,
  className,
  before = 3,
  after = 10,
}: {
  selectedIso: string;
  markedIsos?: ReadonlySet<string> | readonly string[];
  onSelect: (iso: string) => void;
  className?: string;
  before?: number;
  after?: number;
}) {
  const todayIso = seoulDateKey();
  const days = listDayStripRange(-before, before + after + 1);
  const marked =
    markedIsos instanceof Set ? markedIsos : new Set(markedIsos ?? []);
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: "smooth",
    });
  }, [selectedIso]);

  return (
    <div
      className={cn(
        "flex snap-x snap-mandatory gap-2 overflow-x-auto px-0.5 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      role="listbox"
      aria-label="날짜 선택"
    >
      {days.map((day) => (
        <DayStripCell
          key={day.iso}
          day={day}
          selected={day.iso === selectedIso}
          isToday={day.iso === todayIso}
          hasEvents={marked.has(day.iso)}
          buttonRef={day.iso === selectedIso ? selectedRef : undefined}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function DayStripCell({
  day,
  selected,
  isToday,
  hasEvents,
  buttonRef,
  onSelect,
}: {
  day: UpcomingDayOption;
  selected: boolean;
  isToday: boolean;
  hasEvents: boolean;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onSelect: (iso: string) => void;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="option"
      aria-selected={selected}
      aria-label={`${day.month}월 ${day.day}일 ${day.weekdayShort}`}
      onClick={() => onSelect(day.iso)}
      className={cn(
        "inline-flex h-16 w-[4.5rem] shrink-0 snap-center cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl transition-colors",
        selected
          ? "text-primary ring-2 ring-inset ring-primary"
          : "text-foreground hover:bg-surface/70",
        isToday && !selected && "font-semibold text-primary",
      )}
    >
      <span className="flex h-6 w-full items-center justify-center text-lg font-semibold tabular-nums leading-none tracking-tight">
        {day.day}
      </span>
      <span
        className={cn(
          "flex h-5 w-full items-center justify-center text-base font-medium leading-none",
          selected ? "text-primary" : "text-muted",
        )}
      >
        {day.weekdayShort}
      </span>
      <span
        className="flex h-2 w-full items-center justify-center"
        aria-hidden
      >
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            hasEvents
              ? selected
                ? "bg-primary"
                : "bg-foreground/45"
              : "bg-transparent",
          )}
        />
      </span>
    </button>
  );
}
