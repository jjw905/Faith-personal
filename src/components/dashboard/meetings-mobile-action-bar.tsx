"use client";

import Link from "next/link";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  History,
  Mic,
  Plus,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useAppContext } from "@/context/app-context";
import { useNotificationsUi } from "@/context/notifications-ui-context";
import { getWorkspaceProfile } from "@/lib/workspaces";
import { cn } from "@/lib/utils";

export type MeetingsMobilePane = "upcoming" | "records";

/** 아이콘 크기 고정. 라벨은 아래로만 붙인다. */
const ICON_CLASS = "h-5 w-5 shrink-0";

/** 아이콘+라벨 셀. 너비·높이 고정으로 알림 배지 유무와 관계없이 정렬. */
const ACTION_CLASS =
  "relative z-10 inline-flex h-14 w-14 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full text-base font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50";

const ICON_SLOT =
  "relative inline-flex h-5 w-5 shrink-0 items-center justify-center";

const LABEL_CLASS =
  "w-full truncate text-center text-[11px] font-semibold leading-none";

const SHEET_ITEM_CLASS =
  "flex min-h-16 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 text-left transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-50";

function ActionLabel({ children }: { children: ReactNode }) {
  return <span className={LABEL_CLASS}>{children}</span>;
}

function ActionIcon({ children }: { children: ReactNode }) {
  return <span className={ICON_SLOT}>{children}</span>;
}

/**
 * 모바일 하단 추적형 바.
 * 홈(내 회의): 알림 + 기록 진입 + 추가.
 * 기록: 알림 + 내 회의로 돌아가기 + 추가. 기록 선택 표시 없음.
 * 라벨 추가는 바를 위로 올려(아이콘 시점 유지), 아이콘 h-5는 그대로.
 */
export function MeetingsMobileActionBar({
  pane,
  onPaneChange,
  startHref,
  onStart,
  startLabel = "기록 시작",
  onUpload,
  uploadLabel = "파일 올리기",
  uploadIcon = "upload",
  createLabel = "새로 만들기",
  busy = false,
  onLeaveRecords,
}: {
  pane: MeetingsMobilePane;
  onPaneChange: (pane: MeetingsMobilePane) => void;
  startHref?: string;
  onStart?: () => void;
  startLabel?: string;
  onUpload?: () => void;
  uploadLabel?: string;
  uploadIcon?: "upload" | "calendar";
  createLabel?: string;
  busy?: boolean;
  onLeaveRecords?: () => void;
}) {
  const { workspaceId, notificationCount } = useAppContext();
  const profile = getWorkspaceProfile(workspaceId);
  const { open: notificationsOpen, openNotifications } = useNotificationsUi();
  const [mounted, setMounted] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!createOpen) return;
    function closeAll() {
      setCreateOpen(false);
    }
    function onPointer(e: MouseEvent | TouchEvent) {
      const target = e.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      closeAll();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAll();
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [createOpen]);

  if (!mounted) return null;

  const inRecords = pane === "records";
  const showStart = Boolean(startHref || onStart);
  const showUpload = Boolean(onUpload);
  const showCreate = showStart || showUpload;
  const startClass = cn(
    ACTION_CLASS,
    "bg-primary text-primary-foreground hover:bg-primary-hover",
  );
  const createChipLabel =
    showStart && showUpload
      ? "추가"
      : showStart
        ? "시작"
        : uploadIcon === "calendar"
          ? "예정"
          : "올리기";

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
        {createOpen && showStart && showUpload ? (
          <div className="meetings-sheet-pop-in absolute bottom-full right-0 mb-2 w-[min(20rem,calc(100vw-1.5rem))]">
            <div
              className="rounded-3xl border border-border bg-card/95 p-2 shadow-float backdrop-blur-md"
              role="menu"
              aria-label={createLabel}
            >
              {startHref ? (
                <Link
                  href={startHref}
                  role="menuitem"
                  className={SHEET_ITEM_CLASS}
                  onClick={() => setCreateOpen(false)}
                >
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                    <Mic className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1 text-lg font-semibold text-foreground">
                    {startLabel}
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-2"
                    aria-hidden
                  />
                </Link>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  className={SHEET_ITEM_CLASS}
                  disabled={busy}
                  onClick={() => {
                    setCreateOpen(false);
                    onStart?.();
                  }}
                >
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                    <Mic className="h-6 w-6" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1 text-lg font-semibold text-foreground">
                    {startLabel}
                  </span>
                  <ChevronRight
                    className="h-5 w-5 shrink-0 text-muted-2"
                    aria-hidden
                  />
                </button>
              )}
              <button
                type="button"
                role="menuitem"
                className={SHEET_ITEM_CLASS}
                disabled={busy}
                onClick={() => {
                  setCreateOpen(false);
                  onUpload?.();
                }}
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-surface-2 text-foreground">
                  {uploadIcon === "calendar" ? (
                    <CalendarDays className="h-6 w-6" strokeWidth={1.75} />
                  ) : (
                    <Upload className="h-6 w-6" strokeWidth={1.75} />
                  )}
                </span>
                <span className="min-w-0 flex-1 text-lg font-semibold text-foreground">
                  {uploadLabel}
                </span>
                <ChevronRight
                  className="h-5 w-5 shrink-0 text-muted-2"
                  aria-hidden
                />
              </button>
            </div>
          </div>
        ) : null}

        <div
          className="relative flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-border bg-card/95 p-1 shadow-float backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="회의 도구"
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
              setCreateOpen(false);
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

          {inRecords ? (
            <button
              type="button"
              className={cn(
                ACTION_CLASS,
                "text-muted hover:bg-surface hover:text-foreground",
              )}
              aria-label={`${profile.meetingHeadline}으로 돌아가기`}
              title={profile.meetingHeadline}
              onClick={() => {
                onLeaveRecords?.();
                onPaneChange("upcoming");
              }}
            >
              <ActionIcon>
                <CalendarClock className={ICON_CLASS} strokeWidth={1.75} />
              </ActionIcon>
              <ActionLabel>회의</ActionLabel>
            </button>
          ) : (
            <button
              type="button"
              className={cn(
                ACTION_CLASS,
                "text-muted hover:bg-surface hover:text-foreground",
              )}
              aria-label={profile.recordsTitle}
              title={profile.recordsTitle}
              onClick={() => onPaneChange("records")}
            >
              <ActionIcon>
                <History className={ICON_CLASS} strokeWidth={1.75} />
              </ActionIcon>
              <ActionLabel>기록</ActionLabel>
            </button>
          )}

          {showCreate ? (
            showStart && showUpload ? (
              <button
                type="button"
                className={startClass}
                aria-label={createLabel}
                title={createLabel}
                aria-expanded={createOpen}
                disabled={busy}
                onClick={() => setCreateOpen((open) => !open)}
              >
                <ActionIcon>
                  <Plus className={ICON_CLASS} strokeWidth={2} />
                </ActionIcon>
                <ActionLabel>{createChipLabel}</ActionLabel>
              </button>
            ) : showStart ? (
              startHref ? (
                <Link
                  href={startHref}
                  className={startClass}
                  aria-label={startLabel}
                  title={startLabel}
                >
                  <ActionIcon>
                    <Mic className={ICON_CLASS} strokeWidth={1.75} />
                  </ActionIcon>
                  <ActionLabel>{createChipLabel}</ActionLabel>
                </Link>
              ) : (
                <button
                  type="button"
                  className={startClass}
                  aria-label={startLabel}
                  title={startLabel}
                  disabled={busy}
                  onClick={onStart}
                >
                  <ActionIcon>
                    <Mic className={ICON_CLASS} strokeWidth={1.75} />
                  </ActionIcon>
                  <ActionLabel>{createChipLabel}</ActionLabel>
                </button>
              )
            ) : (
              <button
                type="button"
                className={startClass}
                aria-label={uploadLabel}
                title={uploadLabel}
                disabled={busy}
                onClick={onUpload}
              >
                <ActionIcon>
                  {uploadIcon === "calendar" ? (
                    <CalendarDays className={ICON_CLASS} strokeWidth={1.75} />
                  ) : (
                    <Upload className={ICON_CLASS} strokeWidth={1.75} />
                  )}
                </ActionIcon>
                <ActionLabel>{createChipLabel}</ActionLabel>
              </button>
            )
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
