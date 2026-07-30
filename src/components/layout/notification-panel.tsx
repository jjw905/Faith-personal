"use client";

import {
  CalendarDays,
  Check,
  EyeOff,
  HardDrive,
  Loader2,
  Megaphone,
  Settings2,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { Button } from "@/components/ui/button";
import { MaterialSymbol } from "@/components/ui/material-symbol";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  NOTIFICATION_RECENT_DISPLAY_DAYS,
} from "@/lib/data-retention";
import {
  fixtureNotificationsExpand,
} from "@/lib/page-ux-fixtures";
import { getNotifications } from "@/lib/notifications-mock";
import { isPageUxNotificationScenario } from "@/lib/page-ux-registry";
import type { AppNotification, NotificationType } from "@/types/notification";
import {
  isUrgentNotification,
  sortNotificationsUrgentFirst,
} from "@/types/notification";
import { cn } from "@/lib/utils";

type PanelTab = "unread" | "all";

function notificationIcon(type: NotificationType) {
  if (type === "masking") return EyeOff;
  if (type === "storage") return HardDrive;
  if (type === "invite") return UserPlus;
  if (type === "team") return Users;
  if (type === "meeting") return CalendarDays;
  if (type === "urgent") return Megaphone;
  if (type === "system") return Settings2;
  if (type === "access") return ShieldAlert;
  return ShieldAlert;
}

/** 펼침 후 '바로가기' 대상. href 우선. */
function notificationOpenHref(n: AppNotification): string | null {
  const href = n.data?.href;
  if (typeof href === "string" && href.startsWith("/")) return href;
  const meetingId =
    typeof n.data?.meetingId === "string" ? n.data.meetingId : null;
  if (n.type === "masking") {
    return meetingId ? `/meetings/${meetingId}` : "/dashboard";
  }
  if (!meetingId) return null;
  const kind = typeof n.data?.kind === "string" ? n.data.kind : "";
  if (
    kind === "analysis_done" ||
    kind === "analysis_failed" ||
    kind.startsWith("meeting_") ||
    n.type === "meeting" ||
    n.type === "storage"
  ) {
    return `/meetings/${meetingId}`;
  }
  return null;
}

function hasInviteActions(
  n: AppNotification,
  onInviteAction?: NotificationGroupProps["onInviteAction"],
) {
  return (
    n.type === "invite" &&
    typeof n.data?.inviteId === "string" &&
    Boolean(onInviteAction)
  );
}

function hasConfirmActions(
  n: AppNotification,
  onConfirmMeeting?: NotificationGroupProps["onConfirmMeeting"],
) {
  if (!onConfirmMeeting) return false;
  const kind = typeof n.data?.kind === "string" ? n.data.kind : "";
  return (
    kind === "meeting_ack" ||
    kind === "meeting_changed" ||
    kind === "meeting_canceled" ||
    kind === "meeting_missed"
  );
}

type NotificationGroupProps = {
  label: string;
  items: AppNotification[];
  onClose?: () => void;
  onMarkRead?: (id: string) => void;
  onMarkReadInPlace?: (id: string) => void;
  onInviteAction?: (
    notificationId: string,
    inviteId: string,
    action: "accept" | "decline",
    reason?: string,
  ) => void;
  onConfirmMeeting?: (
    notificationId: string,
    meetingId: string | null,
  ) => void;
};

/** 알림 종류 칩 라벨. '긴급' 문구는 쓰지 않는다. */
function notificationCategory(
  type: NotificationType,
  data?: Record<string, unknown> | null,
): string {
  const kind = typeof data?.kind === "string" ? data.kind : "";
  if (kind === "analysis_done" || kind === "analysis_failed") return "분석";
  if (type === "urgent") return "공지";
  if (type === "access") return "보안";
  if (type === "system") return "시스템";
  if (type === "masking") return "마스킹";
  if (type === "storage") return "저장";
  if (type === "invite") return "초대";
  if (type === "team") return "팀";
  if (type === "meeting") return "회의";
  return "알림";
}

function emitNotificationsChanged(unreadCount: number) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("faith:notifications-changed", {
      detail: { unreadCount },
    }),
  );
}

function applyFixtureItems(items: AppNotification[]) {
  return {
    unread: sortNotificationsUrgentFirst(items.filter((n) => n.unread)),
    recent: items.filter((n) => !n.unread),
  };
}

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  /** 디자인 랩: 프리뷰 영역 안에만 표시 */
  contained?: boolean;
  /** 디자인 랩·강제 미리보기 데이터 */
  previewItems?: AppNotification[];
}

/** 헤더에서 열리는 우측 알림 센터. */
export function NotificationPanel({
  open,
  onClose,
  contained,
  previewItems,
}: NotificationPanelProps) {
  const { data: session, status } = useSession();
  const { scenarioId, isLive } = usePageUxPreview();
  const [unread, setUnread] = useState<AppNotification[]>([]);
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<PanelTab>("unread");
  const softActions = !isLive || Boolean(contained);

  const applyPreview = useCallback(() => {
    if (previewItems) {
      const { unread: u, recent: r } = applyFixtureItems(previewItems);
      setUnread(u);
      setRecent(r);
      setLoading(false);
      setTab(u.length > 0 ? "unread" : "all");
      return true;
    }
    if (scenarioId === "popup-notifications-expand") {
      const { unread: u, recent: r } = applyFixtureItems(
        fixtureNotificationsExpand(),
      );
      setUnread(u);
      setRecent(r);
      setLoading(false);
      setTab("unread");
      return true;
    }
    return false;
  }, [previewItems, scenarioId]);

  const load = useCallback(async () => {
    if (applyPreview()) return;

    if (contained || status !== "authenticated" || !session?.user?.id) {
      const items = getNotifications().map((n) => ({ ...n }));
      setUnread(sortNotificationsUrgentFirst(items.filter((n) => n.unread)));
      setRecent(items.filter((n) => !n.unread));
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/notifications", {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        unread?: AppNotification[];
        recent?: AppNotification[];
        unreadCount?: number;
      };
      if (!res.ok || !data.ok) return;
      setUnread(sortNotificationsUrgentFirst(data.unread ?? []));
      setRecent(data.recent ?? []);
      emitNotificationsChanged(data.unreadCount ?? 0);
    } finally {
      setLoading(false);
    }
  }, [applyPreview, contained, session?.user?.id, status]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => void load());
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    if (!isPageUxNotificationScenario(scenarioId)) return;
    applyPreview();
  }, [open, scenarioId, applyPreview]);

  async function markAllRead() {
    if (softActions || status !== "authenticated") {
      setRecent((prev) => [
        ...unread.map((n) => ({ ...n, unread: false })),
        ...prev,
      ]);
      setUnread([]);
      emitNotificationsChanged(0);
      setTab("all");
      return;
    }
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    const data = (await res.json()) as { ok?: boolean; unreadCount?: number };
    if (res.ok && data.ok) {
      emitNotificationsChanged(data.unreadCount ?? 0);
      await load();
      setTab("all");
    }
  }

  async function markRead(id: string) {
    if (softActions || status !== "authenticated") {
      const target = unread.find((n) => n.id === id);
      if (!target) return;
      setUnread((prev) => prev.filter((n) => n.id !== id));
      setRecent((prev) => [{ ...target, unread: false }, ...prev]);
      emitNotificationsChanged(Math.max(0, unread.length - 1));
      return;
    }
    const res = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    const data = (await res.json()) as { ok?: boolean; unreadCount?: number };
    if (res.ok && data.ok) {
      emitNotificationsChanged(data.unreadCount ?? 0);
      await load();
    }
  }

  /** 펼침 시: 읽음 표시만 하고 목록에서 빼지 않음 (내용 확인용). */
  async function markReadInPlace(id: string) {
    const inUnread = unread.find((n) => n.id === id);
    if (!inUnread?.unread) return;
    setUnread((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
    );
    emitNotificationsChanged(Math.max(0, unread.filter((n) => n.unread).length - 1));
    if (softActions || status !== "authenticated") return;
    void fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    }).then(async (res) => {
      if (!res.ok) return;
      const data = (await res.json()) as { ok?: boolean; unreadCount?: number };
      if (data.ok && typeof data.unreadCount === "number") {
        emitNotificationsChanged(data.unreadCount);
      }
    });
  }

  async function respondInvite(
    notificationId: string,
    inviteId: string,
    action: "accept" | "decline",
    reason?: string,
  ) {
    if (softActions) {
      await markRead(notificationId);
      return;
    }
    const res = await fetch(`/api/team-invites/${inviteId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    const data = (await res.json()) as { ok?: boolean };
    if (res.ok && data.ok) {
      await markRead(notificationId);
      await load();
    }
  }

  async function confirmMeeting(
    notificationId: string,
    meetingId: string | null,
  ) {
    if (softActions) {
      await markRead(notificationId);
      return;
    }
    const res = await fetch("/api/notifications/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notificationId,
        meetingId: meetingId ?? undefined,
      }),
    });
    if (res.ok) {
      emitNotificationsChanged(Math.max(0, unread.length - 1));
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

  const sortedUnread = useMemo(
    () => sortNotificationsUrgentFirst(unread),
    [unread],
  );
  const unreadBadge = useMemo(
    () => unread.filter((n) => n.unread).length,
    [unread],
  );

  const empty =
    !loading &&
    unread.length === 0 &&
    recent.length === 0;

  const showUnreadEmpty =
    !loading && tab === "unread" && unread.length === 0;

  return (
    <>
      {/* M3: 모바일은 full-screen dialog라 스크림 없음. md+ side sheet만 스크림. */}
      <div
        className={cn(
          "hidden bg-black/40 transition-opacity duration-200 md:block",
          contained ? "absolute inset-0 z-10" : "fixed inset-0 z-50",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => {
          if (isPageUxNotificationScenario(scenarioId)) return;
          onClose();
        }}
        aria-hidden={!open}
      />

      <aside
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
        aria-label="알림 센터"
        inert={!open}
        className={cn(
          // 모바일: edge-to-edge full-screen dialog. md+: 우측 side sheet.
          "flex w-full flex-col bg-card transition-transform duration-200 ease-out",
          "md:max-w-md md:shadow-[0_0_40px_rgba(17,24,46,0.12)]",
          contained
            ? "absolute inset-y-0 right-0 z-10"
            : "fixed inset-y-0 right-0 z-50",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-4 sm:px-5">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground md:text-base">
              알림
            </h2>
            {unreadBadge > 0 ? (
              <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-sm font-semibold tabular-nums text-primary-foreground">
                {unreadBadge}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {unreadBadge > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-12 cursor-pointer gap-1.5 px-3 text-base font-semibold text-muted hover:text-foreground md:h-9 md:px-2.5 md:text-sm"
                onClick={() => void markAllRead()}
                disabled={loading}
              >
                <Check className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={2} />
                모두 읽음
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-12 w-12 cursor-pointer text-muted hover:bg-surface-2 hover:text-foreground md:h-9 md:w-9"
              onClick={() => {
                if (isPageUxNotificationScenario(scenarioId)) return;
                onClose();
              }}
              aria-label="알림 센터 닫기"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {!empty && !loading ? (
          <div className="flex shrink-0 gap-1 border-b border-border/60 px-3 py-2 sm:px-4">
            {(
              [
                { id: "unread" as const, label: "안 읽음", count: unreadBadge },
                {
                  id: "all" as const,
                  label: "전체",
                  count: unread.length + recent.length,
                },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "min-h-12 flex-1 rounded-xl px-3 text-base font-semibold transition-colors md:min-h-10 md:text-sm",
                  tab === item.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface text-muted hover:text-foreground",
                )}
              >
                {item.label}
                {item.count > 0 ? (
                  <span className="ml-1.5 tabular-nums opacity-80">
                    {item.count}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
              <Loader2
                className="h-7 w-7 animate-spin text-primary"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="text-base text-muted md:text-sm">불러오는 중…</p>
            </div>
          ) : empty ? (
            <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface text-muted-2">
                <MaterialSymbol name="notifications_off" size={28} weight={300} />
              </span>
              <p className="mt-3 text-base font-semibold text-foreground md:text-sm">
                새 알림이 없습니다
              </p>
              <p className="mt-1 text-base text-muted md:text-xs">
                확인한 알림은 {NOTIFICATION_RECENT_DISPLAY_DAYS}일간 최근 내역에
                남습니다.
              </p>
            </div>
          ) : showUnreadEmpty ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <p className="text-base font-medium text-foreground">
                안 읽은 알림이 없습니다
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-4 min-h-12 md:min-h-10"
                onClick={() => setTab("all")}
              >
                최근 {NOTIFICATION_RECENT_DISPLAY_DAYS}일 보기
              </Button>
            </div>
          ) : (
            <div className="px-2 py-2">
              {tab === "unread" ? (
                <NotificationGroup
                  label="안 읽음"
                  items={sortedUnread}
                  onClose={onClose}
                  onMarkRead={(id) => void markRead(id)}
                  onMarkReadInPlace={(id) => void markReadInPlace(id)}
                  onInviteAction={(notificationId, inviteId, action, reason) =>
                    void respondInvite(notificationId, inviteId, action, reason)
                  }
                  onConfirmMeeting={(notificationId, meetingId) =>
                    void confirmMeeting(notificationId, meetingId)
                  }
                />
              ) : (
                <>
                  {sortedUnread.length > 0 ? (
                    <NotificationGroup
                      label="안 읽음"
                      items={sortedUnread}
                      onClose={onClose}
                      onMarkRead={(id) => void markRead(id)}
                      onMarkReadInPlace={(id) => void markReadInPlace(id)}
                      onInviteAction={(
                        notificationId,
                        inviteId,
                        action,
                        reason,
                      ) =>
                        void respondInvite(
                          notificationId,
                          inviteId,
                          action,
                          reason,
                        )
                      }
                      onConfirmMeeting={(notificationId, meetingId) =>
                        void confirmMeeting(notificationId, meetingId)
                      }
                    />
                  ) : null}
                  {recent.length > 0 ? (
                    <NotificationGroup
                      label={`최근 ${NOTIFICATION_RECENT_DISPLAY_DAYS}일`}
                      items={recent}
                      onClose={onClose}
                      onMarkReadInPlace={(id) => void markReadInPlace(id)}
                    />
                  ) : null}
                </>
              )}
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
  onClose,
  onMarkRead,
  onMarkReadInPlace,
  onInviteAction,
  onConfirmMeeting,
}: NotificationGroupProps) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function toggleExpand(n: AppNotification) {
    const next = expandedId === n.id ? null : n.id;
    setExpandedId(next);
    if (next !== declineId) {
      setDeclineId(null);
      setReason("");
    }
    if (next === n.id && n.unread) onMarkReadInPlace?.(n.id);
  }

  function goTo(n: AppNotification, href: string) {
    if (n.unread) onMarkRead?.(n.id);
    onClose?.();
    router.push(href);
  }

  return (
    <div className="mb-1">
      <p className="px-3 pb-1.5 pt-2 text-base font-semibold text-muted-2">
        {label}
      </p>
      <ul className="space-y-1">
        {items.map((n) => {
          const Icon = notificationIcon(n.type);
          const urgent = isUrgentNotification(n.type, n.data);
          const category = notificationCategory(n.type, n.data);
          const expanded = expandedId === n.id;
          const openHref = notificationOpenHref(n);
          const inviteOk = hasInviteActions(n, onInviteAction);
          const confirmOk = hasConfirmActions(n, onConfirmMeeting);
          const kind = typeof n.data?.kind === "string" ? n.data.kind : "";
          return (
            <li key={n.id}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                className={cn(
                  "flex w-full cursor-pointer gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-surface",
                  expanded && "bg-surface/80",
                )}
                onClick={() => toggleExpand(n)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleExpand(n);
                  }
                }}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center self-start rounded-2xl md:h-10 md:w-10 md:rounded-xl",
                    urgent
                      ? n.unread
                        ? "bg-red-600 text-white"
                        : "bg-red-50 text-red-700"
                      : n.unread
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface-2 text-muted",
                  )}
                >
                  <Icon className="h-5 w-5 md:h-4 md:w-4" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <span
                        className={cn(
                          "inline-flex h-7 max-w-full items-center rounded-full px-2.5 text-sm font-semibold leading-none",
                          urgent
                            ? "bg-red-600 text-white"
                            : n.unread
                              ? "bg-primary-soft text-primary"
                              : "bg-surface-2 text-muted",
                        )}
                      >
                        {category}
                      </span>
                      <p
                        className={cn(
                          "text-base leading-snug text-foreground",
                          n.unread ? "font-semibold" : "font-medium",
                        )}
                      >
                        {n.title}
                      </p>
                    </div>
                    <span className="inline-flex h-7 shrink-0 items-center text-sm tabular-nums leading-none text-muted-2 md:text-xs">
                      {n.time}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 text-base leading-relaxed text-muted md:text-sm",
                      !expanded && "line-clamp-2",
                    )}
                  >
                    {n.body}
                  </p>
                  {expanded ? (
                    <div
                      className="mt-3 space-y-3 border-t border-border/60 pt-3"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      {inviteOk && onInviteAction ? (
                        declineId === n.id ? (
                          <div className="space-y-2">
                            <input
                              value={reason}
                              onChange={(event) =>
                                setReason(event.target.value)
                              }
                              placeholder="거절 사유, 선택"
                              maxLength={500}
                              className="min-h-12 w-full rounded-xl border border-border bg-card px-3 text-base outline-none focus:ring-2 focus:ring-ring md:min-h-10"
                            />
                            <div className="flex flex-col gap-2 md:flex-row">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="min-h-12 w-full md:min-h-10 md:w-auto"
                                onClick={() => setDeclineId(null)}
                              >
                                취소
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="min-h-12 w-full md:min-h-10 md:flex-1"
                                onClick={() =>
                                  onInviteAction(
                                    n.id,
                                    String(n.data?.inviteId),
                                    "decline",
                                    reason,
                                  )
                                }
                              >
                                거절
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col-reverse gap-2 md:flex-row">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="min-h-12 w-full md:min-h-10 md:flex-1 md:border md:border-border md:bg-card md:hover:bg-surface"
                              onClick={() => setDeclineId(n.id)}
                            >
                              거절
                            </Button>
                            <Button
                              size="sm"
                              className="min-h-12 w-full md:min-h-10 md:flex-1"
                              onClick={() =>
                                onInviteAction(
                                  n.id,
                                  String(n.data?.inviteId),
                                  "accept",
                                )
                              }
                            >
                              수락
                            </Button>
                          </div>
                        )
                      ) : null}

                      {confirmOk && onConfirmMeeting ? (
                        <div
                          className={cn(
                            "flex gap-2",
                            openHref
                              ? "flex-col-reverse md:flex-row"
                              : "flex-col md:flex-row",
                          )}
                        >
                          {openHref ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="min-h-12 w-full md:min-h-10 md:flex-1"
                              onClick={() => goTo(n, openHref)}
                            >
                              바로가기
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            className="min-h-12 w-full md:min-h-10 md:flex-1"
                            variant={
                              kind === "meeting_ack" ? "default" : "secondary"
                            }
                            onClick={() =>
                              onConfirmMeeting(
                                n.id,
                                kind === "meeting_ack" &&
                                  typeof n.data?.meetingId === "string"
                                  ? n.data.meetingId
                                  : null,
                              )
                            }
                          >
                            확인
                          </Button>
                        </div>
                      ) : openHref ? (
                        <Button
                          size="sm"
                          className="min-h-12 w-full md:min-h-10"
                          onClick={() => goTo(n, openHref)}
                        >
                          바로가기
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {n.unread ? (
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
