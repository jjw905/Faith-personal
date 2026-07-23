"use client";

import { Search, X } from "lucide-react";

import { cn } from "@/lib/utils";

/** 제목 아래·옆, 목록 카드 안에서 쓰는 검색. 모바일 입력 용이. */
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
        "relative flex h-11 w-full max-w-sm items-center rounded-xl bg-surface-2 px-3 transition-[box-shadow,background-color] focus-within:ring-1 focus-within:ring-ring",
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
        inputMode="search"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent px-2.5 text-base font-medium text-foreground outline-none placeholder:text-foreground/45 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-foreground/55 transition-colors hover:bg-card hover:text-foreground"
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </label>
  );
}
