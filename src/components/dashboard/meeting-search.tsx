"use client";

import { Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

const SEARCH_PANEL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SEARCH_PANEL_MS = 280;

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
        "relative flex min-h-12 w-full max-w-sm items-center rounded-xl border border-border bg-transparent px-3 transition-[box-shadow] focus-within:ring-1 focus-within:ring-ring md:h-11 md:min-h-0",
        className,
      )}
    >
      <span className="sr-only">{label}</span>
      <Search
        className="h-4 w-4 shrink-0 text-muted"
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
        className="min-w-0 flex-1 bg-transparent px-2.5 text-base font-medium text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden"
        autoComplete="off"
        enterKeyHint="search"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground md:h-8 md:w-8"
          aria-label="검색어 지우기"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </label>
  );
}

/**
 * 기록/일정 탭 행 + 검색.
 * 아이콘: 섹션 배경 없음. 탭과 같은 가로선 위. 펼침은 선 아래 입력 행.
 */
export function ExpandableMeetingSearch({
  value,
  onChange,
  placeholder = "회의 검색",
  label = "검색",
  toolbar,
  className,
  /** false면 검색 토글·펼침 숨김 (모바일은 하단 엄지 존 검색만 쓸 때) */
  showSearchToggle = true,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** 같은 가로선 줄에 둘 탭(왼쪽) */
  toolbar: ReactNode;
  className?: string;
  showSearchToggle?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const [expanded, setExpanded] = useState(
    () => showSearchToggle && value.trim().length > 0,
  );

  useEffect(() => {
    if (!showSearchToggle) {
      setExpanded(false);
      return;
    }
    if (value.trim().length > 0) setExpanded(true);
  }, [value, showSearchToggle]);

  useEffect(() => {
    if (!expanded || !showSearchToggle) {
      inputRef.current?.blur();
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => window.cancelAnimationFrame(id);
  }, [expanded, showSearchToggle]);

  useEffect(() => {
    if (!expanded || !showSearchToggle) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        if (!value.trim()) setExpanded(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (value) onChange("");
        else setExpanded(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, value, onChange, showSearchToggle]);

  function closeSearch() {
    onChange("");
    setExpanded(false);
  }

  return (
    <div
      ref={rootRef}
      className={cn("min-w-0", className)}
      data-search-expanded={expanded ? "true" : "false"}
    >
      <div
        className={cn(
          "flex min-w-0 items-end gap-2 border-b border-border",
          showSearchToggle && "max-md:border-b-0 md:gap-1",
        )}
      >
        <div className="min-w-0 flex-1">{toolbar}</div>
        {showSearchToggle ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={label}
            aria-expanded={expanded}
            title={label}
            className={cn(
              "inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center bg-transparent text-muted transition-colors",
              "hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "md:-mb-px md:border-b-2",
              expanded
                ? "text-foreground md:border-foreground"
                : "md:border-transparent",
            )}
          >
            <Search className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </button>
        ) : null}
      </div>

      {showSearchToggle ? (
        <div
          className={cn(
            "grid transition-[grid-template-rows,opacity]",
            expanded ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          style={{
            gridTemplateRows: expanded ? "1fr" : "0fr",
            transitionDuration: `${SEARCH_PANEL_MS}ms`,
            transitionTimingFunction: SEARCH_PANEL_EASE,
          }}
          aria-hidden={!expanded}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              role="search"
              className="flex min-h-12 items-center gap-1 border-b border-border"
            >
              <label
                className="flex min-h-12 min-w-0 flex-1 items-center"
                htmlFor={inputId}
              >
                <span className="sr-only">{label}</span>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="search"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={placeholder}
                  inputMode="search"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  tabIndex={expanded ? 0 : -1}
                  className="w-full min-w-0 bg-transparent py-2.5 text-base text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </label>
              {value ? (
                <button
                  type="button"
                  onClick={() => onChange("")}
                  tabIndex={expanded ? 0 : -1}
                  className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center bg-transparent text-muted transition-colors hover:text-foreground"
                  aria-label="검색어 지우기"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={closeSearch}
                  tabIndex={expanded ? 0 : -1}
                  className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center bg-transparent text-muted transition-colors hover:text-foreground"
                  aria-label="검색 닫기"
                >
                  <X className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
