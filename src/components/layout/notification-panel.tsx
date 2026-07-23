"use client";

import { BellOff, Check, EyeOff, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  NOTIFICATION_RECENT_DISPLAY_DAYS,
  readDataRetentionDaysFromStorage,
} from "@/lib/data-retention";
import { getNotifications } from "@/lib/notifications-mock";
import type { AppNotification, NotificationType } from "@/types/notification";
import { cn } from "@/lib/utils";

function notificationIcon(type: NotificationType) {
  if (type === "masking") return EyeOff;
  if (type === "storage") return ShieldCheck;
  return ShieldAlert;
}

function emitNotificationsChanged(unreadCount: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("faith:notifications-changed", {
      detail: { unreadCount },
    }),
  );
}

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  /** 디자인 랩: 프리뷰 영역 안에만 표시 */
  contained?: boolean;
}

/** 헤더 벨에서 열리는 우측 알림 센터. */
export function NotificationPanel({
  open,
  onClose,
  contained,
}: NotificationPanelProps) {
  const { data: session, status } = useSession();
  const [unread, setUnread] = useState<AppNotification[]>([]);
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (contained || status !== "authenticated" || !session?.user?.id) {
      const items = getNotifications().map((n) => ({ ...n }));
      setUnread(items.filter((n) => n.unread));
      setRecent(items.filter((n) => !n.unread));
      return;
    }

    setLoading(true);
    try {
      const retentionDays = readDataRetentionDaysFromStorage();
      const q = new URLSearchParams({
        retentionDays: String(retentionDays),
      });
      const res = await fetch(`/api/notifications?${q}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        unread?: AppNotification[];
        recent?: AppNotification[];
        unreadCount?: number;
      };
      if (!res.ok || !data.ok) return;
      setUnread(data.unread ?? []);
      setRecent(data.recent ?? []);
      emitNotificationsChanged(data.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [contained, session?.user?.id, status]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  async function markAllRead() {
    if (contained || status !== "authenticated") {
      setRecent((prev) => [...unread.map((n) => ({ ...n, unread: false })), ...prev]);
      setUnread([]);
      emitNotificationsChanged(0);
      return;
    }
    const retentionDays = readDataRetentionDaysFromStorage();
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true, retentionDays }),
    });
    const data = (await res.json()) as { ok?: boolean; unreadCount?: number };
    if (res.ok && data.ok) {
      emitNotificationsChanged(data.unreadCount ?? 0);
      await load();
    }
  }

  async function markRead(id: string) {
    if (contained || status !== "authenticated") {
      const target = unread.find((n) => n.id === id);
      if (!target) return;
      setUnread((prev) => prev.filter((n) => n.id !== id));
      setRecent((prev) => [{ ...target, unread: false }, ...prev]);
      emitNotificationsChanged(Math.max(0, unread.length - 1));
      return;
    }
    const retentionDays = readDataRetentionDaysFromStorage();
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id], retentionDays }),
    });
    const data = (await res.json()) as { ok?: boolean; unreadCount?: number };
    if (res.ok && data.ok) {
      emitNotificationsChanged(data.unreadCount ?? 0);
      await load();
    }
  }

  useEffect(() => {
    if (!open || contained) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, contained]);

  const empty = unread.length === 0 && recent.length === 0;

  return (
    <>
      <div
        className={cn(
          "bg-black/40 transition-opacity duration-200",
          contained ? "absolute inset-0 z-10" : "fixed inset-0 z-50",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
        aria-label="알림 센터"
        inert={!open}
        className={cn(
          "flex w-full max-w-md flex-col bg-card shadow-[0_0_40px_rgba(17,24,46,0.12)] transition-transform duration-200 ease-out",
          contained
            ? "absolute inset-y-0 right-0 z-10"
            : "fixed inset-y-0 right-0 z-50",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-5">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-foreground">알림</h2>
            {unread.length > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
                {unread.length}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {unread.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 cursor-pointer gap-1.5 px-2.5 text-xs font-semibold text-muted hover:text-foreground"
                onClick={() => void markAllRead()}
                disabled={loading}
              >
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
                모두 읽음
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 cursor-pointer text-muted hover:bg-surface-2 hover:text-foreground"
              onClick={onClose}
              aria-label="알림 센터 닫기"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          {empty ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-muted-2">
                <BellOff className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">
                새 알림이 없습니다
              </p>
              <p className="mt-1 text-xs text-muted">
                확인한 알림은 {NOTIFICATION_RECENT_DISPLAY_DAYS}일간 최근 내역에
                남습니다.
              </p>
            </div>
          ) : (
            <div className="px-2 py-2">
              {unread.length > 0 ? (
                <NotificationGroup
                  label="안 읽음"
                  items={unread}
                  onItemClick={(id) => void markRead(id)}
                />
              ) : null}
              {recent.length > 0 ? (
                <NotificationGroup
                  label={`최근 알림, ${NOTIFICATION_RECENT_DISPLAY_DAYS}일`}
                  items={recent}
                />
              ) : null}
            </div>
          )}
        </ScrollArea>
      </aside>
    </>
  );
}

function NotificationGroup({
  label,
  items,
  onItemClick,
}: {
  label: string;
  items: AppNotification[];
  onItemClick?: (id: string) => void;
}) {
  return (
    <div className="mb-1">
      <p className="px-3 pb-1 pt-2 text-xs font-semibold tracking-wide text-muted-2">
        {label}
      </p>
      <ul className="space-y-0.5">
        {items.map((n) => {
          const Icon = notificationIcon(n.type);
          return (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => onItemClick?.(n.id)}
                className={cn(
                  "flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                  onItemClick
                    ? "cursor-pointer hover:bg-surface"
                    : "cursor-default",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                    n.unread
                      ? "bg-primary-soft text-primary"
                      : "bg-surface text-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p
                      className={cn(
                        "text-sm text-foreground",
                        n.unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {n.title}
                    </p>
                    <span className="shrink-0 text-xs text-muted-2">
                      {n.time}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    {n.body}
                  </p>
                </div>
                {n.unread ? (
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
