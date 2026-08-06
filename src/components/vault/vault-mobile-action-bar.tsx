"use client";

import { Bell, Download, Search, Trash2, Upload, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useAppContext } from "@/context/app-context";
import { useNotificationsUi } from "@/context/notifications-ui-context";
import { cn } from "@/lib/utils";

/** MD3 / web.dev: 시각 아이콘 20, hit 56(하단 바 셀). */
const ICON_CLASS = "h-5 w-5 shrink-0";

/**
 * 하단 추적 바 셀 — Faith 모바일: min 48×48, 아이콘+라벨.
 * 대시보드 MeetingsMobileActionBar 와 동일 토큰.
 */
const ACTION_CLASS =
  "inline-flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full text-base font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50";

const ICON_SLOT =
  "relative inline-flex h-5 w-5 shrink-0 items-center justify-center";

/** 컨트롤 라벨 16px (iOS 자동줌·Faith mobile-web-ui). */
const LABEL_CLASS =
  "w-full truncate text-center text-base font-semibold leading-tight";

function ActionLabel({ children }: { children: ReactNode }) {
  return <span className={LABEL_CLASS}>{children}</span>;
}

function ActionIcon({ children }: { children: ReactNode }) {
  return <span className={ICON_SLOT}>{children}</span>;
}

/**
 * 모바일 보관함 하단 바 (엄지 존).
 * 기본은 단순: 알림 · 검색 · 올리기. 받기/삭제는 목록 툴바에서 선택 모드 진입.
 * 선택 중일 때만 확인·취소가 바에 나타난다.
 * 상단 Expandable 검색과 중복하지 않음 (모바일은 여기만).
 */
export function VaultMobileActionBar({
  query,
  onQueryChange,
  selectMode,
  selectedCount,
  busy,
  quotaFull,
  onUpload,
  onConfirmSelection,
  onExitSelect,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  selectMode: "download" | "delete" | null;
  selectedCount: number;
  busy: boolean;
  quotaFull: boolean;
  onUpload: () => void;
  onConfirmSelection: () => void;
  onExitSelect: () => void;
}) {
  const { notificationCount } = useAppContext();
  const { open: notificationsOpen, openNotifications } = useNotificationsUi();
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

  // 알림 센터가 열리면 하단 추적 바를 숨겨 겹침·오탭을 막는다 (MD3 full-screen dialog).
  if (!mounted || notificationsOpen) return null;

  const hasQuery = query.trim().length > 0;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[55] md:hidden"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.85rem)",
      }}
    >
      <div
        ref={rootRef}
        className="pointer-events-auto relative mx-auto w-max max-w-[calc(100vw-1.5rem)]"
      >
        {searchOpen ? (
          <div
            className="vault-search-pop-in absolute bottom-full left-1/2 mb-2 w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2"
            role="search"
          >
            <div className="flex min-h-14 items-center gap-2 rounded-full border border-border bg-card/95 px-3 shadow-float backdrop-blur-md">
              <Search
                className="h-5 w-5 shrink-0 text-muted"
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
                  className="w-full bg-transparent py-3 text-base text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden"
                  autoComplete="off"
                  enterKeyHint="search"
                  inputMode="search"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  if (hasQuery) onQueryChange("");
                  else setSearchOpen(false);
                }}
                className="inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                aria-label={hasQuery ? "검색어 지우기" : "검색 닫기"}
              >
                <X className="h-5 w-5" strokeWidth={2} />
              </button>
            </div>
          </div>
        ) : null}

        <div
          className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-border bg-card/95 p-1 shadow-float backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="보관함 도구"
        >
          {selectMode ? (
            <>
              <button
                type="button"
                className={cn(
                  "vault-select-actions-in",
                  ACTION_CLASS,
                  selectMode === "delete"
                    ? "text-foreground hover:bg-surface/70"
                    : "bg-primary text-primary-foreground hover:bg-primary-hover",
                )}
                disabled={busy || selectedCount === 0}
                aria-label={
                  selectMode === "delete"
                    ? `삭제${selectedCount > 0 ? ` ${selectedCount}` : ""}`
                    : `받기${selectedCount > 0 ? ` ${selectedCount}` : ""}`
                }
                onClick={onConfirmSelection}
              >
                <ActionIcon>
                  {selectMode === "delete" ? (
                    <Trash2 className={ICON_CLASS} strokeWidth={1.75} />
                  ) : (
                    <Download className={ICON_CLASS} strokeWidth={2} />
                  )}
                </ActionIcon>
                <ActionLabel>
                  {selectMode === "delete" ? "삭제" : "받기"}
                  {selectedCount > 0 ? ` ${selectedCount}` : ""}
                </ActionLabel>
              </button>
              <button
                type="button"
                className={cn(
                  "vault-select-actions-in-delay",
                  ACTION_CLASS,
                  "text-muted hover:bg-surface hover:text-foreground",
                )}
                aria-label="선택 취소"
                disabled={busy}
                onClick={onExitSelect}
              >
                <ActionIcon>
                  <X className={ICON_CLASS} strokeWidth={1.75} />
                </ActionIcon>
                <ActionLabel>취소</ActionLabel>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className={cn(
                  ACTION_CLASS,
                  notificationsOpen
                    ? "text-foreground ring-1 ring-inset ring-border-strong"
                    : "text-muted hover:bg-surface/70 hover:text-foreground",
                )}
                aria-label="알림"
                aria-expanded={notificationsOpen}
                onClick={() => {
                  setSearchOpen(false);
                  openNotifications();
                }}
              >
                <ActionIcon>
                  <Bell className={ICON_CLASS} strokeWidth={1.75} />
                  {notificationCount > 0 ? (
                    <span
                      className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-card"
                      aria-hidden
                    />
                  ) : null}
                </ActionIcon>
                <ActionLabel>알림</ActionLabel>
              </button>

              <button
                type="button"
                className={cn(
                  ACTION_CLASS,
                  searchOpen || hasQuery
                    ? "text-foreground ring-1 ring-inset ring-border-strong"
                    : "text-muted hover:bg-surface/70 hover:text-foreground",
                )}
                aria-label="검색"
                aria-expanded={searchOpen}
                onClick={() => setSearchOpen((open) => !open)}
              >
                <ActionIcon>
                  <Search className={ICON_CLASS} strokeWidth={1.75} />
                </ActionIcon>
                <ActionLabel>검색</ActionLabel>
              </button>

              <button
                type="button"
                className={cn(
                  ACTION_CLASS,
                  quotaFull
                    ? "bg-surface-2 text-muted hover:bg-surface-2"
                    : "bg-primary text-primary-foreground hover:bg-primary-hover",
                )}
                disabled={busy}
                aria-label="올리기"
                onClick={() => {
                  setSearchOpen(false);
                  onUpload();
                }}
              >
                <ActionIcon>
                  <Upload className={ICON_CLASS} strokeWidth={1.75} />
                </ActionIcon>
                <ActionLabel>올리기</ActionLabel>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
