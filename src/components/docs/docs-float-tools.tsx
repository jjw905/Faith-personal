"use client";

import { ArrowLeft, ArrowUp, Search, X } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

import { useDocsImePlaceholder } from "@/components/docs/docs-search-input";
import { getScrollParent } from "@/lib/scroll-in-container";
import { cn } from "@/lib/utils";

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

type FloatBox = { left: number; top: number };

/** 원본 상단 chrome이 화면 위로 벗어나면 true. */
export function useDocsChromeGone(chromeRef: RefObject<HTMLElement | null>) {
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let scrollRoot: HTMLElement | null = null;
    let observer: IntersectionObserver | null = null;
    let attached = false;

    const update = () => {
      const chrome = chromeRef.current;
      if (!chrome) return;
      const rect = chrome.getBoundingClientRect();
      setGone(rect.bottom < 12);
    };

    const opts: AddEventListenerOptions = { passive: true, capture: true };

    const attach = () => {
      if (cancelled || attached) return;
      const chrome = chromeRef.current;
      if (!chrome) {
        window.requestAnimationFrame(attach);
        return;
      }
      attached = true;
      scrollRoot = getScrollParent(chrome);

      // 뷰포트 기준 IO (마케팅 페이지 window 스크롤용)
      observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry) return;
          setGone(!entry.isIntersecting || entry.boundingClientRect.bottom < 12);
        },
        { root: null, threshold: 0, rootMargin: "0px" },
      );
      observer.observe(chrome);

      update();
      window.addEventListener("scroll", update, opts);
      document.addEventListener("scroll", update, opts);
      window.addEventListener("resize", update);
      scrollRoot?.addEventListener("scroll", update, opts);
      window.visualViewport?.addEventListener("scroll", update);
      window.visualViewport?.addEventListener("resize", update);
    };

    attach();

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("scroll", update, opts);
      document.removeEventListener("scroll", update, opts);
      window.removeEventListener("resize", update);
      scrollRoot?.removeEventListener("scroll", update, opts);
      window.visualViewport?.removeEventListener("scroll", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, [chromeRef]);

  return gone;
}

/** 플로팅 바를 본문 컬럼 왼쪽 상단에 맞춤. */
export function useDocsFloatBox(
  pageRef: RefObject<HTMLElement | null>,
  active: boolean,
) {
  const [box, setBox] = useState<FloatBox | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setBox(null);
      return;
    }

    const update = () => {
      const page = pageRef.current;
      if (!page) return;
      const rect = page.getBoundingClientRect();
      setBox({
        left: rect.left + 16,
        top: Math.max(12, window.visualViewport?.offsetTop ?? 0) + 12,
      });
    };

    update();
    const scrollRoot = pageRef.current
      ? getScrollParent(pageRef.current)
      : null;
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    scrollRoot?.addEventListener("scroll", update, { passive: true });
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      scrollRoot?.removeEventListener("scroll", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [active, pageRef]);

  return box;
}

/**
 * 돌아가기 + 검색 아이콘.
 * 검색은 필요할 때만 오른쪽으로 펼침 (본문 가림 최소화).
 */
export function DocsFloatChrome({
  left,
  top,
  query,
  onQueryChange,
  onBack,
}: {
  left: number;
  top: number;
  query: string;
  onQueryChange: (value: string) => void;
  onBack: () => void;
}) {
  const mounted = useMounted();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const [expanded, setExpanded] = useState(() => query.trim().length > 0);
  const ime = useDocsImePlaceholder(query);

  useEffect(() => {
    if (query.trim().length > 0) setExpanded(true);
  }, [query]);

  useEffect(() => {
    if (!expanded) return;
    const id = window.requestAnimationFrame(() => inputRef.current?.focus());
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

  if (!mounted) return null;

  return createPortal(
    <div
      ref={rootRef}
      className="pointer-events-none fixed z-[60]"
      style={{ left, top, right: "auto", bottom: "auto" }}
    >
      <div
        className={cn(
          "pointer-events-auto flex h-11 items-center rounded-2xl border border-border bg-card/95 shadow-float backdrop-blur-md",
          "transition-[width,box-shadow] duration-200 ease-out",
          expanded ? "w-[min(22rem,calc(100vw-2rem))]" : "w-auto",
        )}
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-full shrink-0 cursor-pointer items-center gap-1.5 rounded-l-2xl px-3 text-sm font-semibold text-foreground transition-colors hover:bg-surface"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          <span className="hidden sm:inline">돌아가기</span>
        </button>

        <span className="h-5 w-px shrink-0 bg-border" aria-hidden />

        {expanded ? (
          <label className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5">
            <span className="sr-only">문서 검색</span>
            <Search
              className="h-4 w-4 shrink-0 text-muted"
              strokeWidth={1.75}
              aria-hidden
            />
            <span className="relative min-w-0 flex-1">
              {ime.showImeHint ? (
                <span
                  className="pointer-events-none absolute inset-y-0 left-0 flex items-center text-sm text-muted-2"
                  aria-hidden
                >
                  {ime.imeLabel}
                </span>
              ) : null}
              <input
                ref={inputRef}
                id={inputId}
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={ime.placeholder}
                className="w-full bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden"
                autoComplete="off"
                enterKeyHint="search"
                {...ime.inputProps}
              />
            </span>
            {query ? (
              <button
                type="button"
                onClick={() => onQueryChange("")}
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
                aria-label="검색어 지우기"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-foreground"
                aria-label="검색 닫기"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex h-full shrink-0 cursor-pointer items-center justify-center rounded-r-2xl px-3 text-muted transition-colors hover:bg-surface hover:text-foreground"
            aria-label="문서 검색"
          >
            <Search className="h-4 w-4" strokeWidth={1.75} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** 맨 위로. 뷰포트 우하단 FAB (portal로 조상 transform 영향 제거). */
export function DocsScrollTopFab({
  visible,
  pageRef,
}: {
  visible: boolean;
  pageRef: RefObject<HTMLElement | null>;
}) {
  const mounted = useMounted();

  if (!mounted || !visible) return null;

  function scrollTop() {
    const page = pageRef.current;
    const root = page ? getScrollParent(page) : null;
    if (root) {
      root.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return createPortal(
    <button
      type="button"
      onClick={scrollTop}
      className={cn(
        "fixed z-[60] inline-flex h-12 w-12 cursor-pointer items-center justify-center",
        "rounded-full border border-border bg-card/95 text-foreground shadow-float backdrop-blur-md",
        "transition-[transform,opacity,background-color] duration-200",
        "hover:bg-surface active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
      style={{
        top: "auto",
        left: "auto",
        right: 24,
        // 우하단 위젯(N 등) 위에 두어 겹치지 않게
        bottom: 88,
      }}
      aria-label="맨 위로"
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
    </button>,
    document.body,
  );
}
