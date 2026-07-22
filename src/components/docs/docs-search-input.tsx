"use client";

import { Search, X } from "lucide-react";
import { useId, type RefObject } from "react";

import { cn } from "@/lib/utils";

export function DocsSearchInput({
  value,
  onChange,
  id,
  className,
  inputClassName,
  autoFocus,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <label
      className={cn(
        "relative flex h-11 w-full items-center rounded-xl border border-border bg-card px-3 transition-colors focus-within:border-border-strong focus-within:bg-surface",
        className,
      )}
    >
      <span className="sr-only">문서 검색</span>
      <Search
        className="h-4 w-4 shrink-0 text-muted"
        strokeWidth={1.75}
        aria-hidden
      />
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="검색..."
        className={cn(
          "min-w-0 flex-1 bg-transparent px-2.5 text-sm text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden",
          inputClassName,
        )}
        autoComplete="off"
        autoFocus={autoFocus}
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </label>
  );
}
