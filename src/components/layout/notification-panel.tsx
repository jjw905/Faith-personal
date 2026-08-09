"use client";

import {
  CalendarDays,
  Check,
  ChevronLeft,
  EyeOff,
  HardDrive,
  Loader2,
  LogIn,
  MailPlus,
  Settings2,
  ShieldAlert,
  Users,
  Volume2,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { Button } from "@/components/ui/button";
import { MaterialSymbol } from "@/components/ui/material-symbol";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  NOTIFICATION_RECENT_DISPLAY_DAYS,
} from "@/lib/data-retention";
import {
  formatRecordsDayParts,
  seoulDateKey,
} from "@/lib/meeting-date";
import { defaultNotificationExamples } from "@/lib/notification-examples";
import { isNotificationChromePreview } from "@/lib/page-ux-registry";
import type { AppNotification, NotificationType } from "@/types/notification";
import {
  isUrgentNotification,
  sortNotificationsUrgentFirst,
} from "@/types/notification";
import { cn } from "@/lib/utils";

type PanelTab = "unread" | "records";
/** 공지·초대·회의·일반로 묶은 카테고리 (세부 type보다 스캔이 쉽다). */
type CategoryId = "all" | "notice" | "invite" | "meeting" | "general";

const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  invite: "초대",
  meeting: "회의",
  team: "팀",
  masking: "마스킹",
  access: "보안",
  storage: "저장공간",
  system: "시스템",
  urgent: "공지",
};

const CATEGORY_OPTIONS: { id: CategoryId; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "notice", label: "공지" },
  { id: "invite", label: "초대" },
  { id: "meeting", label: "회의" },
  { id: "general", label: "일반" },
];

function notificationCategory(
  type: NotificationType,
): Exclude<CategoryId, "all"> {
  if (type === "urgent") return "notice";
  if (type === "invite") return "invite";
  if (type === "meeting") return "meeting";
  return "general";
}

function matchesCategory(n: AppNotification, category: CategoryId) {
  if (category === "all") return true;
  return notificationCategory(n.type) === category;
}

function matchesNotificationSearch(n: AppNotification, query: string) {
  const q = query.trim().toLocaleLowerCase("ko-KR");
  if (!q) return true;
  const typeLabel = NOTIFICATION_TYPE_LABEL[n.type];
  const catLabel =
    CATEGORY_OPTIONS.find((c) => c.id === notificationCategory(n.type))
      ?.label ?? "";
  const haystack = [n.title, n.body, typeLabel, catLabel]
    .join(" ")
    .toLocaleLowerCase("ko-KR");
  return haystack.includes(q);
}

function sortNotificationsNewestFirst(items: AppNotification[]) {
  return [...items].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
    return tb - ta;
  });
}

function groupNotificationsByDay(items: AppNotification[]) {
  const groups: {
    key: string;
    label: string;
    items: AppNotification[];
  }[] = [];
  for (const item of sortNotificationsNewestFirst(items)) {
    const iso = item.createdAt ?? new Date().toISOString();
    const key = seoulDateKey(iso);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }
    const { relative, absolute } = formatRecordsDayParts(iso);
    groups.push({
      key,
      label: relative ?? absolute,
      items: [item],
    });
  }
  return groups;
}

function notificationIcon(type: NotificationType) {
  if (type === "masking") return EyeOff;
  if (type === "storage") return HardDrive;
  if (type === "invite") return MailPlus;
  if (type === "team") return Users;
  if (type === "meeting") return CalendarDays;
  if (type === "urgent") return Volume2;
  if (type === "system") return Settings2;
  if (type === "access") return LogIn;
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
  /**
   * 기록 조회용: 읽은 항목은 수락/확인 CTA를 숨기고 바로가기만 남겨
   * 날짜·유형 스캔이 편해지게 한다. 안 읽음(액션 필요)은 그대로 노출.
   */
  browseMode?: boolean;
  /** 탭이 이미 구역을 말해주면 섹션 라벨을 숨긴다 (모바일 안 읽음). */
  hideLabel?: boolean;
  onClose?: () => void;
  onMarkRead?: (id: string) => void;
  onMarkReadInPlace?: (id: string) => void;
  onInviteAction?: (
    notificationId: string,
    inviteId: string,
    action: "accept" | "decline",
    reason?: string,
    inviteType?: string,
  ) => void;
  onConfirmMeeting?: (
    notificationId: string,
    meetingId: string | null,
  ) => void;
};

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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { scenarioId, isLive } = usePageUxPreview();
  const [unread, setUnread] = useState<AppNotification[]>([]);
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<PanelTab>("unread");
  const [searchQuery, setSearchQuery] = useState("");
  const [category, setCategory] = useState<CategoryId>("all");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  /** API에 알림이 없을 때 공통 예시를 보여 미리보기와 맞춘다. */
  const [usingExamples, setUsingExamples] = useState(false);

  const chromePreview = isNotificationChromePreview({
    scenarioId,
    pathname,
    search: search ? `?${search}` : "",
  });
  const softActions =
    !isLive || Boolean(contained) || chromePreview || usingExamples;

  const applyPreview = useCallback(() => {
    if (previewItems) {
      const { unread: u, recent: r } = applyFixtureItems(previewItems);
      setUnread(u);
      setRecent(r);
      setUsingExamples(true);
      setLoading(false);
      setTab(u.length > 0 ? "unread" : "records");
      emitNotificationsChanged(u.length);
      return true;
    }
    if (chromePreview) {
      const { unread: u, recent: r } = applyFixtureItems(
        defaultNotificationExamples(),
      );
      setUnread(u);
      setRecent(r);
      setUsingExamples(true);
      setLoading(false);
      setTab("unread");
      emitNotificationsChanged(u.length);
      return true;
    }
    return false;
  }, [previewItems, chromePreview]);

  const loadExamples = useCallback(() => {
    const { unread: u, recent: r } = applyFixtureItems(
      defaultNotificationExamples(),
    );
    setUnread(u);
    setRecent(r);
    setUsingExamples(true);
    setTab(u.length > 0 ? "unread" : "records");
    emitNotificationsChanged(u.length);
  }, []);

  const load = useCallback(async () => {
    if (applyPreview()) return;

    if (contained || status !== "authenticated" || !session?.user?.id) {
      loadExamples();
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
      if (!res.ok || !data.ok) {
        loadExamples();
        return;
      }
      const apiUnread = data.unread ?? [];
      const apiRecent = data.recent ?? [];
      if (apiUnread.length === 0 && apiRecent.length === 0) {
        loadExamples();
        return;
      }
      setUsingExamples(false);
      setUnread(sortNotificationsUrgentFirst(apiUnread));
      setRecent(apiRecent);
      emitNotificationsChanged(data.unreadCount ?? apiUnread.length);
    } finally {
      setLoading(false);
    }
  }, [
    applyPreview,
    contained,
    loadExamples,
    session?.user?.id,
    status,
  ]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => void load());
  }, [open, load]);

  async function markAllRead() {
    if (softActions || status !== "authenticated") {
      setRecent((prev) => [
        ...unread.map((n) => ({ ...n, unread: false })),
        ...prev,
      ]);
      setUnread([]);
      emitNotificationsChanged(0);
      setTab("records");
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
      setTab("records");
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
    inviteType?: string,
  ) {
    if (softActions) {
      await markRead(notificationId);
      return;
    }
    const endpoint =
      inviteType === "personal_realtime"
        ? `/api/personal-realtime/invites/${inviteId}/respond`
        : `/api/team-invites/${inviteId}/respond`;
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason, notificationId }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      message?: string;
      href?: string | null;
    };
    if (res.ok && data.ok) {
      setActionMessage(null);
      await markRead(notificationId);
      await load();
      if (action === "accept" && data.href) {
        onClose?.();
        router.push(data.href);
      }
    } else {
      setActionMessage(
        data.message ??
          (inviteType === "personal_realtime"
            ? "개인 실시간 초대에 응답하지 못했습니다. 잠시 후 다시 시도해 주세요."
            : "팀 초대에 응답하지 못했습니다. 잠시 후 다시 시도해 주세요."),
      );
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
    const data = (await res.json()) as { ok?: boolean; message?: string };
    if (res.ok && data.ok) {
      setActionMessage(null);
      emitNotificationsChanged(Math.max(0, unread.length - 1));
      await load();
    } else {
      setActionMessage(
        data.message ?? "회의 확인을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    }
  }

  useEffect(() => {
    if (!open || contained) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (chromePreview) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, contained, chromePreview]);

  useEffect(() => {
    if (open) return;
    setSearchQuery("");
    setCategory("all");
    setActionMessage(null);
  }, [open]);

  function requestClose() {
    if (chromePreview) return;
    onClose();
  }

  const sortedUnread = useMemo(
    () => sortNotificationsUrgentFirst(unread),
    [unread],
  );
  const unreadBadge = useMemo(
    () => unread.filter((n) => n.unread).length,
    [unread],
  );

  const filteredUnread = useMemo(
    () =>
      sortedUnread.filter(
        (n) =>
          matchesCategory(n, category) &&
          matchesNotificationSearch(n, searchQuery),
      ),
    [sortedUnread, category, searchQuery],
  );

  /** 기록: 안 읽음+최근을 날짜순으로 합쳐 조회 */
  const recordsPool = useMemo(() => {
    const byId = new Map<string, AppNotification>();
    for (const n of [...unread, ...recent]) {
      byId.set(n.id, n);
    }
    return sortNotificationsNewestFirst([...byId.values()]);
  }, [unread, recent]);

  const categoryPool = tab === "unread" ? sortedUnread : recordsPool;

  const visibleCategories = useMemo(() => {
    const present = new Set(
      categoryPool.map((n) => notificationCategory(n.type)),
    );
    return CATEGORY_OPTIONS.filter(
      (opt) => opt.id === "all" || present.has(opt.id),
    );
  }, [categoryPool]);

  useEffect(() => {
    if (category === "all") return;
    if (!visibleCategories.some((opt) => opt.id === category)) {
      setCategory("all");
    }
  }, [category, visibleCategories]);

  const filteredRecords = useMemo(() => {
    return recordsPool.filter(
      (n) =>
        matchesCategory(n, category) &&
        matchesNotificationSearch(n, searchQuery),
    );
  }, [recordsPool, category, searchQuery]);

  const recordDayGroups = useMemo(
    () => groupNotificationsByDay(filteredRecords),
    [filteredRecords],
  );

  const empty =
    !loading &&
    unread.length === 0 &&
    recent.length === 0;

  const showUnreadEmpty =
    !loading &&
    tab === "unread" &&
    unread.length === 0;

  const showBrowseEmpty =
    !loading &&
    !empty &&
    !showUnreadEmpty &&
    ((tab === "unread" && filteredUnread.length === 0) ||
      (tab === "records" && filteredRecords.length === 0));

  const paneTabs = [
    { id: "unread" as const, label: "안 읽음", count: unreadBadge },
    {
      id: "records" as const,
      label: "기록",
      count: recordsPool.length,
    },
  ];

  const categoryToolbar =
    visibleCategories.length > 1 ? (
      <div
        className="flex gap-1 overflow-x-auto py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="toolbar"
        aria-label="알림 카테고리"
      >
        {visibleCategories.map((opt) => {
          const selected = category === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setCategory(opt.id)}
              className={cn(
                "inline-flex h-12 shrink-0 items-center border-b-2 px-3 text-base font-semibold transition-colors md:h-10",
                selected
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    ) : null;

  const recordsFilterActive =
    tab === "records" &&
    (category !== "all" || searchQuery.trim().length > 0);
  const recordsResultCount = filteredRecords.length;

  return (
    <>
      {/* M3: 모바일은 full-screen dialog라 스크림 없음. md+ side sheet만 스크림.
          z는 하단 추적 바(z-55)보다 위 — 열리면 바가 알림을 가리지 않게. */}
      <div
        className={cn(
          "hidden bg-black/40 transition-opacity duration-200 md:block",
          contained ? "absolute inset-0 z-10" : "fixed inset-0 z-[60]",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={requestClose}
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
            : "fixed inset-y-0 right-0 z-[60]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="shrink-0 pt-[env(safe-area-inset-top,0px)]">
          <div className="flex h-12 items-center gap-1 px-2 md:h-16 md:gap-3 md:px-5">
            <Button
              type="button"
              variant="ghost"
              className="-ml-0.5 h-12 gap-1.5 px-2 text-base font-semibold text-muted hover:text-foreground md:hidden"
              onClick={requestClose}
              aria-label="알림 센터 닫기"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              돌아가기
            </Button>
            <div className="hidden min-w-0 flex-1 items-center gap-2 md:flex">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">
                알림
              </h2>
              {unreadBadge > 0 ? (
                <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-sm font-semibold tabular-nums text-primary-foreground">
                  {unreadBadge}
                </span>
              ) : null}
            </div>
            <div className="ml-auto flex items-center gap-1">
              {unreadBadge > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="hidden h-9 cursor-pointer gap-1.5 px-2.5 text-sm font-semibold text-muted hover:text-foreground md:inline-flex"
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
                className="hidden h-9 w-9 cursor-pointer text-muted hover:text-foreground md:inline-flex"
                onClick={requestClose}
                aria-label="알림 센터 닫기"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* 모바일: 제목·배지·모두 읽음을 돌아가기 아래 한 줄에 — 엄지 스캔 쉽게 */}
          <div className="flex items-center justify-between gap-3 px-4 pb-3 md:hidden">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                알림
              </h2>
              {unreadBadge > 0 ? (
                <span className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-base font-semibold tabular-nums text-primary-foreground">
                  {unreadBadge}
                </span>
              ) : null}
            </div>
            {unreadBadge > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-12 shrink-0 px-3 text-base font-semibold text-muted hover:text-foreground"
                onClick={() => void markAllRead()}
                disabled={loading}
              >
                모두 읽음
              </Button>
            ) : null}
          </div>
        </div>

        {actionMessage ? (
          <p
            role="alert"
            className="border-b border-border/60 bg-primary-soft px-4 py-3 text-base text-foreground sm:px-5"
          >
            {actionMessage}
          </p>
        ) : null}

        {!empty && !loading ? (
          <div className="shrink-0 px-4 pt-1 sm:px-4">
            <div
              role="tablist"
              aria-label="알림 보기"
              className="flex items-end gap-1 border-b border-border"
            >
              {paneTabs.map((item) => {
                const isSelected = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => {
                      setTab(item.id);
                      if (item.id === "unread") setSearchQuery("");
                    }}
                    className={cn(
                      "-mb-px inline-flex min-h-12 flex-1 items-center justify-center border-b-2 px-2 text-base font-semibold transition-colors md:flex-none md:justify-start md:px-3",
                      isSelected
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                    {item.count > 0 ? (
                      <span className="ml-1.5 tabular-nums opacity-80">
                        {item.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <div className="pt-1">{categoryToolbar}</div>
            {tab === "records" ? (
              <div className="mt-2 space-y-2">
                <MeetingSearch
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder="검색…"
                  label="기록 검색"
                  className="max-w-none"
                />
                {recordsFilterActive ? (
                  <div className="flex min-h-12 items-center justify-between gap-2 px-0.5">
                    <p className="text-base text-muted">
                      <span className="font-semibold tabular-nums text-foreground">
                        {recordsResultCount}
                      </span>
                      건
                      {category !== "all"
                        ? ` · ${CATEGORY_OPTIONS.find((c) => c.id === category)?.label}`
                        : ""}
                    </p>
                    <button
                      type="button"
                      className="inline-flex min-h-12 items-center px-2 text-base font-semibold text-muted hover:text-foreground"
                      onClick={() => {
                        setSearchQuery("");
                        setCategory("all");
                      }}
                    >
                      초기화
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <ScrollArea className="min-h-0 flex-1 pb-[env(safe-area-inset-bottom,0px)]">
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
                onClick={() => setTab("records")}
              >
                최근 {NOTIFICATION_RECENT_DISPLAY_DAYS}일 보기
              </Button>
            </div>
          ) : showBrowseEmpty ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <p className="text-base font-medium text-foreground">
                {category !== "all"
                  ? "이 카테고리의 알림이 없습니다"
                  : searchQuery.trim()
                    ? "검색 결과가 없습니다"
                    : "표시할 알림이 없습니다"}
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {searchQuery.trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12 text-base md:min-h-10"
                    onClick={() => setSearchQuery("")}
                  >
                    검색어 지우기
                  </Button>
                ) : null}
                {category !== "all" ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-12 text-base md:min-h-10"
                    onClick={() => setCategory("all")}
                  >
                    전체 보기
                  </Button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="px-0 py-2">
              {tab === "unread" ? (
                <NotificationGroup
                  label="안 읽음"
                  items={filteredUnread}
                  hideLabel
                  onClose={onClose}
                  onMarkRead={(id) => void markRead(id)}
                  onMarkReadInPlace={(id) => void markReadInPlace(id)}
                  onInviteAction={(
                    notificationId,
                    inviteId,
                    action,
                    reason,
                    inviteType,
                  ) =>
                    void respondInvite(
                      notificationId,
                      inviteId,
                      action,
                      reason,
                      inviteType,
                    )
                  }
                  onConfirmMeeting={(notificationId, meetingId) =>
                    void confirmMeeting(notificationId, meetingId)
                  }
                />
              ) : (
                recordDayGroups.map((group) => (
                  <NotificationGroup
                    key={group.key}
                    label={group.label}
                    items={group.items}
                    browseMode
                    onClose={onClose}
                    onMarkRead={(id) => void markRead(id)}
                    onMarkReadInPlace={(id) => void markReadInPlace(id)}
                    onInviteAction={(
                      notificationId,
                      inviteId,
                      action,
                      reason,
                      inviteType,
                    ) =>
                      void respondInvite(
                        notificationId,
                        inviteId,
                        action,
                        reason,
                        inviteType,
                      )
                    }
                    onConfirmMeeting={(notificationId, meetingId) =>
                      void confirmMeeting(notificationId, meetingId)
                    }
                  />
                ))
              )}
            </div>
          )}
        </ScrollArea>
      </aside>
    </>
  );
}

/** 알림 행 CTA — 대시보드형, 섹션 배경면 없이 primary / outline만 */
const NOTIFICATION_ACTION_PRIMARY =
  "inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:min-h-11";

const NOTIFICATION_ACTION_SECONDARY =
  "inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-transparent px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 md:min-h-11";

const NOTIFICATION_ACTION_GHOST =
  "inline-flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-xl px-4 text-base font-semibold text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-11";

function NotificationGroup({
  label,
  items,
  browseMode = false,
  hideLabel = false,
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
      {!hideLabel ? (
        <p className="sticky top-0 z-[1] bg-card px-4 pb-2 pt-5 text-base font-semibold tracking-tight text-foreground first:pt-3">
          {label}
        </p>
      ) : (
        <div className="pt-2" />
      )}
      <ul className="space-y-0">
        {items.map((n) => {
          const Icon = notificationIcon(n.type);
          const urgent = isUrgentNotification(n.type, n.data);
          const expanded = expandedId === n.id;
          const openHref = notificationOpenHref(n);
          const inviteOk =
            hasInviteActions(n, onInviteAction) &&
            (!browseMode || n.unread);
          const confirmOk =
            hasConfirmActions(n, onConfirmMeeting) &&
            (!browseMode || n.unread);
          const kind = typeof n.data?.kind === "string" ? n.data.kind : "";
          const showOpenOnly = Boolean(openHref) && !inviteOk && !confirmOk;
          const hasActions = inviteOk || confirmOk || showOpenOnly;
          const typeLabel = NOTIFICATION_TYPE_LABEL[n.type];
          return (
            <li key={n.id}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-label={`${typeLabel}. ${n.title}`}
                className={cn(
                  "group w-full cursor-pointer px-4 py-4 text-left transition-colors hover:bg-surface/70 sm:py-5",
                  "min-h-12",
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
                <div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "inline-flex size-7 shrink-0 items-center justify-center",
                        urgent ? "text-red-600" : "text-muted",
                      )}
                      aria-hidden
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.75} />
                    </span>
                    <p
                      className={cn(
                        "min-w-0 flex-1 text-lg leading-7 tracking-tight text-foreground",
                        n.unread ? "font-semibold" : "font-medium",
                      )}
                    >
                      {n.title}
                    </p>
                    <span
                      className="shrink-0 text-base leading-7 tabular-nums text-muted-2"
                      title={
                        n.createdAt
                          ? formatRecordsDayParts(n.createdAt).absolute
                          : undefined
                      }
                    >
                      {browseMode && n.createdAt
                        ? (formatRecordsDayParts(n.createdAt).relative ??
                          formatRecordsDayParts(n.createdAt).absolute)
                        : n.time}
                    </span>
                  </div>
                  <p
                    className={cn(
                      "mt-1.5 pl-10 text-base leading-relaxed text-muted",
                      !expanded &&
                        (browseMode ? "line-clamp-3" : "line-clamp-2"),
                    )}
                  >
                    {n.body}
                  </p>

                  {hasActions ? (
                    <div
                      className="mt-3 space-y-2 pl-10"
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
                              className="min-h-12 w-full rounded-xl border border-border bg-transparent px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring md:min-h-11"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className={NOTIFICATION_ACTION_GHOST}
                                onClick={() => setDeclineId(null)}
                              >
                                취소
                              </button>
                              <button
                                type="button"
                                className={cn(
                                  NOTIFICATION_ACTION_SECONDARY,
                                  "flex-1",
                                )}
                                onClick={() =>
                                  onInviteAction(
                                    n.id,
                                    String(n.data?.inviteId),
                                    "decline",
                                    reason,
                                    typeof n.data?.inviteType === "string"
                                      ? n.data.inviteType
                                      : undefined,
                                  )
                                }
                              >
                                거절
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={cn(
                                NOTIFICATION_ACTION_SECONDARY,
                                "flex-1",
                              )}
                              onClick={() => setDeclineId(n.id)}
                            >
                              거절
                            </button>
                            <button
                              type="button"
                              className={cn(
                                NOTIFICATION_ACTION_PRIMARY,
                                "flex-1",
                              )}
                              onClick={() =>
                                onInviteAction(
                                  n.id,
                                  String(n.data?.inviteId),
                                  "accept",
                                  undefined,
                                  typeof n.data?.inviteType === "string"
                                    ? n.data.inviteType
                                    : undefined,
                                )
                              }
                            >
                              수락
                            </button>
                          </div>
                        )
                      ) : null}

                      {confirmOk && onConfirmMeeting ? (
                        <div className="flex gap-2">
                          {openHref ? (
                            <button
                              type="button"
                              className={cn(
                                NOTIFICATION_ACTION_SECONDARY,
                                "flex-1",
                              )}
                              onClick={() => goTo(n, openHref)}
                            >
                              바로가기
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={cn(
                              kind === "meeting_ack"
                                ? NOTIFICATION_ACTION_PRIMARY
                                : NOTIFICATION_ACTION_SECONDARY,
                              "flex-1",
                            )}
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
                          </button>
                        </div>
                      ) : null}

                      {showOpenOnly && openHref ? (
                        <button
                          type="button"
                          className={cn(
                            browseMode
                              ? NOTIFICATION_ACTION_SECONDARY
                              : NOTIFICATION_ACTION_PRIMARY,
                            "w-full",
                          )}
                          onClick={() => goTo(n, openHref)}
                        >
                          바로가기
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
