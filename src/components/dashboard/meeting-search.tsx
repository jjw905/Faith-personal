"use client";

import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** 제목 아래·옆에서 쓰는 간단 검색. */
export function MeetingSearch({
  value,
  onChange,
  placeholder = "회의 검색",
  label = "검색",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "relative flex h-11 w-full max-w-sm items-center rounded-xl bg-surface-2 px-3 transition-colors focus-within:bg-[#e4e6eb]",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <Search
        className="h-4 w-4 shrink-0 text-foreground/55"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
