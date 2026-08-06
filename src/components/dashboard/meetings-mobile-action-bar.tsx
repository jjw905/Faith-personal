"use client";

import Link from "next/link";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  History,
  Plus,
  Upload,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
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
  "w-full truncate text-center text-base font-semibold leading-tight";

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
  startLabel = "실시간 기록",
  onUpload,
  uploadLabel = "파일 올리기",
  uploadIcon = "upload",
  createLabel = "새로 만들기",
  busy = false,
  onLeaveRecords,
  /** 페이지에 일정/기록 탭이 있을 때 하단 전환 버튼 숨김 */
  hidePaneSwitch = false,
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
  hidePaneSwitch?: boolean;
}) {
  const { workspaceId, notificationCount } = useAppContext();
  const profile = getWorkspaceProfile(workspaceId);
  const { open: notificationsOpen, openNotifications } = useNotificationsUi();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // 알림 센터가 열리면 하단 추적 바를 숨겨 겹침·오탭을 막는다 (MD3 full-screen dialog).
  if (!mounted || notificationsOpen) return null;

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
      ? "생성"
      : showStart
        ? createLabel.includes("생성")
          ? "생성"
          : "시작"
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
      <div className="pointer-events-auto relative mx-auto w-max max-w-[calc(100vw-1.5rem)]">
        <div
          className="relative flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-border bg-card/95 p-1 shadow-float backdrop-blur-md [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="회의 도구"
        >
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

          {hidePaneSwitch ? null : inRecords ? (
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
            showStart && startHref ? (
              <Link
                href={startHref}
                className={startClass}
                aria-label={createLabel}
                title={createLabel}
              >
                <ActionIcon>
                  <Plus className={ICON_CLASS} strokeWidth={2} />
                </ActionIcon>
                <ActionLabel>{createChipLabel}</ActionLabel>
              </Link>
            ) : showStart ? (
              <button
                type="button"
                className={startClass}
                aria-label={createLabel}
                title={createLabel}
                disabled={busy}
                onClick={onStart}
              >
                <ActionIcon>
                  <Plus className={ICON_CLASS} strokeWidth={2} />
                </ActionIcon>
                <ActionLabel>{createChipLabel}</ActionLabel>
              </button>
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
