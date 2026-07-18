"use client";

import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** 대시보드 제목 옆 — 회의·참석자 간단 검색. */
export function MeetingSearch({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex h-11 w-full max-w-sm items-center rounded-xl bg-surface-2 px-3 transition-colors focus-within:bg-[#e4e6eb]",
        className,
      )}
    >
      <span className="sr-only">회의 검색</span>
      <Search
        className="h-4 w-4 shrink-0 text-foreground/55"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="회의·참석자 검색"
        className="min-w-0 flex-1 bg-transparent px-2.5 text-sm font-medium text-foreground outline-none placeholder:text-foreground/45 [&::-webkit-search-cancel-button]:hidden"
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-foreground/55 transition-colors hover:bg-card hover:text-foreground"
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </label>
  );
}
