"use client";

import { Download, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/** 모바일: 검색+액션 한 덩어리. 검색은 바 위로 팝업. */
export function VaultMobileActionBar({
  query,
  onQueryChange,
  selectMode,
  selectedCount,
  busy,
  quotaFull,
  hasFiles,
  onUpload,
  onEnterDownload,
  onEnterDelete,
  onConfirmSelection,
  onExitSelect,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  selectMode: "download" | "delete" | null;
  selectedCount: number;
  busy: boolean;
  quotaFull: boolean;
  hasFiles: boolean;
  onUpload: () => void;
  onEnterDownload: () => void;
  onEnterDelete: () => void;
  onConfirmSelection: () => void;
  onExitSelect: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!searchOpen) {
      inputRef.current?.blur();
      return;
    }
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => inputRef.current?.focus());
    });
    return () => window.cancelAnimationFrame(id);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    function onPointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      setSearchOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [searchOpen]);

  if (!mounted) return null;

  const actionClass =
    "inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full px-3 text-[15px] font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50";
  const hasQuery = query.trim().length > 0;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[55] sm:hidden"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
      }}
    >
      <div
        ref={rootRef}
        className="pointer-events-auto relative mx-auto w-max max-w-[calc(100vw-1.5rem)]"
      >
        {searchOpen ? (
          <div
            className="vault-search-pop-in absolute bottom-full left-1/2 mb-2 w-[min(18rem,calc(100vw-1.5rem))]"
            role="search"
          >
            <div className="flex h-11 items-center gap-1 rounded-full border border-border bg-card/95 px-3 shadow-float backdrop-blur-md">
              <Search
                className="h-4 w-4 shrink-0 text-muted"
                strokeWidth={1.75}
                aria-hidden
              />
              <label className="flex min-w-0 flex-1 items-center">
                <span className="sr-only">파일 검색</span>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="search"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="파일 검색"
                  className="w-full bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </label>
              {hasQuery ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                  aria-label="검색어 지우기"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                  aria-label="검색 닫기"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-0.5 rounded-full border border-border bg-card/95 p-1.5 shadow-float backdrop-blur-md">
          <button
            type="button"
            className={cn(
              actionClass,
              searchOpen || hasQuery
                ? "bg-surface text-foreground"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
            aria-label="파일 검색"
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </button>

          {selectMode ? (
            <>
              <button
                type="button"
                className={cn(
                  "vault-select-actions-in",
                  actionClass,
                  selectMode === "delete"
                    ? "text-masked hover:bg-masked-soft"
                    : "text-foreground hover:bg-surface",
                )}
                disabled={busy || selectedCount === 0}
                aria-label={
                  selectMode === "delete"
                    ? `삭제${selectedCount > 0 ? ` ${selectedCount}` : ""}`
                    : `다운로드${selectedCount > 0 ? ` ${selectedCount}` : ""}`
                }
                onClick={onConfirmSelection}
              >
                {selectMode === "delete" ? (
                  <Trash2 className="h-5 w-5" strokeWidth={1.75} />
                ) : (
                  <Download className="h-5 w-5" strokeWidth={2} />
                )}
                {selectedCount > 0 ? (
                  <span className="tabular-nums">{selectedCount}</span>
                ) : null}
              </button>
              <button
                type="button"
                className={cn(
                  "vault-select-actions-in-delay",
                  actionClass,
                  "text-muted hover:bg-surface hover:text-foreground",
                )}
                aria-label="선택 취소"
                disabled={busy}
                onClick={onExitSelect}
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={cn(
                  actionClass,
                  "bg-primary text-primary-foreground hover:bg-primary-hover",
                )}
                disabled={busy || quotaFull}
                aria-label="올리기"
                onClick={onUpload}
              >
                <Upload className="h-5 w-5" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className={cn(actionClass, "text-foreground hover:bg-surface")}
                disabled={busy || !hasFiles}
                aria-label="다운로드"
                onClick={onEnterDownload}
              >
                <Download className="h-5 w-5" strokeWidth={2} />
              </button>
              <button
                type="button"
                className={cn(actionClass, "text-masked hover:bg-masked-soft")}
                disabled={busy || !hasFiles}
                aria-label="삭제"
                onClick={onEnterDelete}
              >
                <Trash2 className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
