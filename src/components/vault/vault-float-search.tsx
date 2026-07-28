"use client";

import { Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import {
  useDocsChromeGone,
  useDocsFloatBox,
} from "@/components/docs/docs-float-tools";
import { cn } from "@/lib/utils";

const SEARCH_PANEL_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const SEARCH_PANEL_MS = 320;

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/**
 * 검색 pill.
 * 아이콘 고정, 라벨은 펼침 시 즉시 제거(잔상 방지), 입력만 max-width로 펼침.
 */
function ExpandableRoundSearch({
  query,
  onQueryChange,
  label = "파일 검색",
  placeholder = "파일 검색",
  className,
  floating = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  floating?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const [expanded, setExpanded] = useState(() => query.trim().length > 0);

  useEffect(() => {
    if (query.trim().length > 0) setExpanded(true);
  }, [query]);

  useEffect(() => {
    if (!expanded) {
      inputRef.current?.blur();
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => window.cancelAnimationFrame(id);
  }, [expanded]);

  useEffect(() => {
    if (!expanded) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        if (!query.trim()) setExpanded(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (query) onQueryChange("");
        else setExpanded(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [expanded, query, onQueryChange]);

  function closeSearch() {
    onQueryChange("");
    setExpanded(false);
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        "relative flex h-11 min-w-0 items-center overflow-hidden rounded-full border border-border bg-card shadow-soft",
        floating && "bg-card/95 shadow-float backdrop-blur-md",
        className,
      )}
    >
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-label={label}
          aria-expanded={false}
          className="absolute inset-0 z-10 cursor-pointer rounded-full"
        />
      ) : null}

      <span
        className={cn(
          "inline-flex h-11 shrink-0 items-center text-muted",
          expanded ? "pl-3" : "pl-3.5",
        )}
        aria-hidden
      >
        <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
      </span>

      {!expanded ? (
        <span
          aria-hidden
          className="shrink-0 whitespace-nowrap pl-1.5 pr-3.5 text-sm font-medium text-muted"
        >
          검색
        </span>
      ) : null}

      <div
        className={cn(
          "flex min-w-0 items-stretch overflow-hidden",
          "transition-[max-width,opacity]",
          expanded
            ? floating
              ? "max-w-[min(12rem,calc(100vw-13rem))] opacity-100"
              : "max-w-[min(16rem,calc(100vw-10rem))] opacity-100"
            : "pointer-events-none max-w-0 opacity-0",
        )}
        style={{
          transitionDuration: `${SEARCH_PANEL_MS}ms`,
          transitionTimingFunction: SEARCH_PANEL_EASE,
        }}
        aria-hidden={!expanded}
      >
        <label
          className={cn(
            "flex min-w-0 items-center gap-1 pr-2.5",
            floating
              ? "w-[min(12rem,calc(100vw-13rem))]"
              : "w-[min(16rem,calc(100vw-10rem))]",
          )}
        >
          <span className="sr-only">{label}</span>
          <span className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              id={inputId}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder}
              tabIndex={expanded ? 0 : -1}
              className="w-full bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden"
              autoComplete="off"
              enterKeyHint="search"
            />
          </span>
          {query ? (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              tabIndex={expanded ? 0 : -1}
              className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
              aria-label="검색어 지우기"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          ) : (
            <button
              type="button"
              onClick={closeSearch}
              tabIndex={expanded ? 0 : -1}
              className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
              aria-label="검색 닫기"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </label>
      </div>
    </div>
  );
}

/** 헤더 검색이 화면 밖으로 나가면 따라다니는 검색. */
export function VaultFloatSearch({
  chromeRef,
  pageRef,
  query,
  onQueryChange,
}: {
  chromeRef: RefObject<HTMLElement | null>;
  pageRef: RefObject<HTMLElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
}) {
  const mounted = useMounted();
  const chromeGone = useDocsChromeGone(chromeRef);
  const floatBox = useDocsFloatBox(pageRef, chromeGone);

  if (!mounted || !chromeGone || !floatBox) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[60] max-md:hidden"
      style={{ left: floatBox.left, top: floatBox.top }}
    >
      <div className="pointer-events-auto">
        <ExpandableRoundSearch
          query={query}
          onQueryChange={onQueryChange}
          floating
        />
      </div>
    </div>,
    document.body,
  );
}

export function VaultRoundSearch({
  query,
  onQueryChange,
  className,
  floating = false,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  className?: string;
  floating?: boolean;
}) {
  return (
    <ExpandableRoundSearch
      query={query}
      onQueryChange={onQueryChange}
      className={className}
      floating={floating}
    />
  );
}
