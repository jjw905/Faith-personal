"use client";

import {
  Bell,
  Download,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useAppContext } from "@/context/app-context";
import { useNotificationsUi } from "@/context/notifications-ui-context";
import { cn } from "@/lib/utils";

/** 아이콘 크기 고정. 라벨은 아래로만 붙인다. */
const ICON_CLASS = "h-5 w-5 shrink-0";

/** 아이콘+라벨 셀. 너비·높이 고정으로 알림 배지 유무와 관계없이 정렬. */
const ACTION_CLASS =
  "inline-flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full text-base font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50";

const ICON_SLOT =
  "relative inline-flex h-5 w-5 shrink-0 items-center justify-center";

const LABEL_CLASS =
  "w-full truncate text-center text-[11px] font-semibold leading-none";

function ActionLabel({ children }: { children: ReactNode }) {
  return <span className={LABEL_CLASS}>{children}</span>;
}

function ActionIcon({ children }: { children: ReactNode }) {
  return <span className={ICON_SLOT}>{children}</span>;
}

/**
 * 모바일: 검색+액션 한 덩어리. 검색은 바 위로 팝업. 페이지는 섹션 푸터.
 * 라벨 추가는 바를 위로 올려(아이콘 시점 유지), 아이콘 h-5는 그대로.
 */
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

  if (!mounted) return null;

  const hasQuery = query.trim().length > 0;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 z-[55] md:hidden"
      style={{
        // 라벨 높이만큼 바를 위로 올려 아이콘 시점을 이전과 맞춘다.
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.85rem)",
      }}
    >
      <div
        ref={rootRef}
        className="pointer-events-auto relative mx-auto w-max max-w-[calc(100vw-1.5rem)]"
      >
        {searchOpen ? (
          <div
            className="vault-search-pop-in absolute bottom-full left-1/2 mb-2 w-[min(18rem,calc(100vw-1.5rem))] -translate-x-1/2"
            role="search"
          >
            <div className="flex min-h-12 items-center gap-1 rounded-full border border-border bg-card/95 px-3 shadow-float backdrop-blur-md">
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
                  className="w-full bg-transparent py-2 text-base text-foreground outline-none placeholder:text-muted-2 [&::-webkit-search-cancel-button]:hidden"
                  autoComplete="off"
                  enterKeyHint="search"
                />
              </label>
              {hasQuery ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  className="inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                  aria-label="검색어 지우기"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  className="inline-flex min-h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground"
                  aria-label="검색 닫기"
                >
                  <X className="h-5 w-5" strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div
          className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-card/95 p-1 shadow-float backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="보관함 도구"
        >
          <button
            type="button"
            className={cn(
              ACTION_CLASS,
              notificationsOpen
                ? "bg-surface text-foreground"
                : "text-muted hover:bg-surface hover:text-foreground",
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
                ? "bg-surface text-foreground"
                : "text-muted hover:bg-surface hover:text-foreground",
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

          {selectMode ? (
            <>
              <button
                type="button"
                className={cn(
                  "vault-select-actions-in",
                  ACTION_CLASS,
                  selectMode === "delete"
                    ? "text-masked hover:bg-masked-soft"
                    : "text-foreground hover:bg-surface",
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
                  "bg-primary text-primary-foreground hover:bg-primary-hover",
                )}
                disabled={busy || quotaFull}
                aria-label="올리기"
                onClick={onUpload}
              >
                <ActionIcon>
                  <Upload className={ICON_CLASS} strokeWidth={1.75} />
                </ActionIcon>
                <ActionLabel>올리기</ActionLabel>
              </button>
              <button
                type="button"
                className={cn(ACTION_CLASS, "text-foreground hover:bg-surface")}
                disabled={busy || !hasFiles}
                aria-label="받기"
                onClick={onEnterDownload}
              >
                <ActionIcon>
                  <Download className={ICON_CLASS} strokeWidth={2} />
                </ActionIcon>
                <ActionLabel>받기</ActionLabel>
              </button>
              <button
                type="button"
                className={cn(ACTION_CLASS, "text-masked hover:bg-masked-soft")}
                disabled={busy || !hasFiles}
                aria-label="삭제"
                onClick={onEnterDelete}
              >
                <ActionIcon>
                  <Trash2 className={ICON_CLASS} strokeWidth={1.75} />
                </ActionIcon>
                <ActionLabel>삭제</ActionLabel>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
