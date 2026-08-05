"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Archive,
  CalendarDays,
  FileText,
  Hash,
  LoaderCircle,
  Megaphone,
  Mic,
  Paperclip,
  ScrollText,
  Send,
  X,
} from "lucide-react";

import {
  PersonAvatar,
  displayPersonName,
} from "@/components/people/person-avatar";
import { VaultFileIcon } from "@/components/vault/vault-file-icon";
import { useNotificationsUi } from "@/context/notifications-ui-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  fixtureTeamChatEmpty,
  fixtureTeamChatFull,
} from "@/lib/page-ux-fixtures";
import { TOUCH_BUTTON, TOUCH_ICON_BUTTON, TOUCH_ROW } from "@/lib/touch-target";
import {
  formatVaultSize,
  listVaultItems,
  type VaultItemMeta,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

export type TeamHubPane = "chat" | "announcements" | "upcoming" | "records";

export type TeamChatMessageView = {
  id: string;
  body: string;
  attachmentType: "vault_file" | "team_meeting" | null;
  vaultFileId: string | null;
  teamMeetingId: string | null;
  attachmentMeta: {
    name?: string;
    size?: number;
    mime?: string;
    title?: string;
    state?: string;
    endedAt?: string | null;
  } | null;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  };
};

type UpcomingCard = {
  id: string;
  title: string;
  scheduledStartAt: string | null;
  canJoin: boolean;
  status: string;
};

type RecordCard = {
  id: string;
  title: string;
  endedAt: string | null;
  state: string;
};

type AnnouncementCard = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  read: boolean;
  createdAt: string;
};

const PANE_ITEMS: {
  id: TeamHubPane;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[] = [
  { id: "chat", label: "채팅", icon: Hash },
  { id: "announcements", label: "공지", icon: Megaphone },
  { id: "upcoming", label: "일정", icon: CalendarDays },
  { id: "records", label: "기록", icon: ScrollText },
];

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

function formatChatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWhen(iso: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TeamHubMobileRail({
  active,
  onChange,
}: {
  active: TeamHubPane;
  onChange: (next: TeamHubPane) => void;
}) {
  const mounted = useMounted();
  const { open: notificationsOpen } = useNotificationsUi();
  const trackRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Partial<Record<TeamHubPane, HTMLButtonElement>>>({});
  const [indicator, setIndicator] = useState({
    left: 0,
    width: 0,
    ready: false,
  });

  function syncIndicator() {
    const track = trackRef.current;
    const btn = btnRefs.current[active];
    if (!track || !btn) return;
    const trackBox = track.getBoundingClientRect();
    const btnBox = btn.getBoundingClientRect();
    setIndicator({
      left: btnBox.left - trackBox.left,
      width: btnBox.width,
      ready: true,
    });
  }

  useLayoutEffect(() => {
    syncIndicator();
  }, [active]);

  useEffect(() => {
    const onResize = () => syncIndicator();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [active]);

  if (!mounted || notificationsOpen) return null;

  return createPortal(
    <nav
      className="pointer-events-none fixed inset-x-0 z-[55] md:hidden"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 4.75rem)",
      }}
      aria-label="팀 창 전환"
    >
      <div className="pointer-events-auto mx-auto w-full max-w-lg px-4">
        <div
          ref={trackRef}
          className={cn(
            "relative grid grid-cols-4 gap-1 rounded-full bg-card/95 p-1.5 shadow-soft ring-1 ring-inset ring-border",
            "backdrop-blur-md",
          )}
          role="tablist"
        >
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-0 top-1.5 bottom-1.5 rounded-full bg-primary",
              indicator.ready
                ? "transition-[transform,width] duration-300 ease-[cubic-bezier(0.2,0,0,1)]"
                : "opacity-0",
            )}
            style={{
              width: indicator.width,
              transform: `translateX(${indicator.left}px)`,
            }}
          />
          {PANE_ITEMS.map((item) => {
            const selected = active === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                ref={(el) => {
                  if (el) btnRefs.current[item.id] = el;
                  else delete btnRefs.current[item.id];
                }}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => onChange(item.id)}
                className={cn(
                  "relative z-10 flex min-h-12 w-full flex-col items-center justify-center gap-1 rounded-full px-1 py-2",
                  "text-base font-semibold transition-colors duration-200",
                  selected
                    ? "text-primary-foreground"
                    : "text-muted hover:text-foreground",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="leading-none">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>,
    document.body,
  );
}

function AttachSheet({
  open,
  onClose,
  records,
  onPickVault,
  onPickMeeting,
}: {
  open: boolean;
  onClose: () => void;
  records: RecordCard[];
  onPickVault: (item: VaultItemMeta) => void;
  onPickMeeting: (record: RecordCard) => void;
}) {
  const [tab, setTab] = useState<"vault" | "meeting">("vault");
  const [items, setItems] = useState<VaultItemMeta[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("vault");
    let alive = true;
    void (async () => {
      setLoading(true);
      try {
        const next = await listVaultItems();
        if (alive) setItems(next);
      } catch {
        if (alive) setItems([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="닫기"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal
        aria-labelledby="team-attach-title"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-3xl bg-card shadow-soft md:max-h-[70vh] md:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2
            id="team-attach-title"
            className="text-lg font-semibold text-foreground"
          >
            Faith 자료 첨부
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              TOUCH_ICON_BUTTON,
              "rounded-full hover:bg-surface/70",
            )}
            aria-label="닫기"
          >
            <X strokeWidth={1.75} />
          </button>
        </div>
        <div
          className="flex gap-2 border-b border-border px-4 py-2"
          role="tablist"
          aria-label="첨부 종류"
        >
          {(
            [
              { id: "vault" as const, label: "보관함" },
              { id: "meeting" as const, label: "회의록" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                TOUCH_BUTTON,
                "rounded-xl px-4 text-base font-semibold",
                tab === item.id
                  ? "text-foreground ring-1 ring-inset ring-border-strong"
                  : "text-muted hover:bg-surface/70",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {tab === "vault" ? (
            loading ? (
              <div className="grid min-h-40 place-items-center">
                <LoaderCircle className="h-6 w-6 animate-spin text-muted" />
              </div>
            ) : items.length === 0 ? (
              <p className="px-3 py-10 text-center text-base text-muted">
                보관함에 보낼 파일이 없습니다
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onPickVault(item)}
                      className={cn(
                        TOUCH_ROW,
                        "flex w-full items-center gap-3 px-3 text-left hover:bg-surface/70",
                      )}
                    >
                      <VaultFileIcon
                        name={item.name}
                        mime={item.mime}
                        className="h-10 w-10 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-lg font-semibold text-foreground">
                          {item.name}
                        </span>
                        <span className="block text-base text-muted">
                          {formatVaultSize(item.size)}
                        </span>
                      </span>
                      <Archive className="h-5 w-5 shrink-0 text-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : records.length === 0 ? (
            <p className="px-3 py-10 text-center text-base text-muted">
              공유할 팀 회의록이 없습니다
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {records.map((record) => (
                <li key={record.id}>
                  <button
                    type="button"
                    onClick={() => onPickMeeting(record)}
                    className={cn(
                      TOUCH_ROW,
                      "flex w-full items-center gap-3 px-3 text-left hover:bg-surface/70",
                    )}
                  >
                    <FileText className="h-6 w-6 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-lg font-semibold text-foreground">
                        {record.title}
                      </span>
                      <span className="block text-base text-muted">
                        {formatWhen(record.endedAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  mine,
}: {
  message: TeamChatMessageView;
  mine: boolean;
}) {
  const name = displayPersonName(
    message.author.name || message.author.handle || "팀원",
  );
  const meta = message.attachmentMeta;
  return (
    <div
      className={cn(
        "flex w-full gap-3",
        mine ? "flex-row-reverse" : "flex-row",
      )}
    >
      <PersonAvatar name={name} size="sm" className="mt-1 shrink-0" />
      <div
        className={cn(
          "min-w-0 max-w-[min(100%,calc(100%-2.75rem))] flex-1 space-y-1 sm:max-w-[28rem]",
          mine ? "items-end text-right" : "items-start text-left",
        )}
      >
        <div
          className={cn(
            "flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
            mine && "justify-end",
          )}
        >
          <span className="text-base font-semibold text-foreground">{name}</span>
          <span className="text-base text-muted-2">
            {formatChatTime(message.createdAt)}
          </span>
        </div>
        {message.body ? (
          <p
            className={cn(
              "whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-left text-base leading-6 text-foreground",
              mine ? "bg-primary/10" : "bg-surface",
            )}
          >
            {message.body}
          </p>
        ) : null}
        {message.attachmentType === "vault_file" && message.vaultFileId ? (
          <a
            href={`/api/vault/${message.vaultFileId}/content`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              TOUCH_ROW,
              "inline-flex w-full max-w-sm items-center gap-3 rounded-2xl bg-surface px-3 text-left ring-1 ring-inset ring-border hover:bg-surface/70",
            )}
          >
            <VaultFileIcon
              name={meta?.name || "파일"}
              mime={meta?.mime}
              className="h-10 w-10 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-foreground">
                {meta?.name || "보관함 파일"}
              </span>
              <span className="block text-base text-muted">
                {typeof meta?.size === "number"
                  ? formatVaultSize(meta.size)
                  : "Faith 보관함"}
              </span>
            </span>
          </a>
        ) : null}
        {message.attachmentType === "team_meeting" && message.teamMeetingId ? (
          <Link
            href={`/meetings/team/${message.teamMeetingId}`}
            className={cn(
              TOUCH_ROW,
              "inline-flex w-full max-w-sm items-center gap-3 rounded-2xl bg-surface px-3 text-left ring-1 ring-inset ring-border hover:bg-surface/70",
            )}
          >
            <ScrollText className="h-6 w-6 shrink-0 text-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-semibold text-foreground">
                {meta?.title || "팀 회의록"}
              </span>
              <span className="block text-base text-muted">
                {formatWhen(meta?.endedAt ?? null)} · 상세 보기
              </span>
            </span>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function TeamChatHub({
  teamId,
  currentUserId,
  teamName,
  upcoming,
  announcements,
  records,
  canCreateMeeting,
  canAnnounce,
  onStartLive,
  onSchedule,
  onComposeAnnouncement,
  onOpenRecord,
  onOpenUpcoming,
  onMarkAnnouncementRead,
  previewLock = false,
}: {
  teamId: string;
  currentUserId: string;
  teamName: string;
  upcoming: UpcomingCard[];
  announcements: AnnouncementCard[];
  records: RecordCard[];
  canCreateMeeting: boolean;
  canAnnounce: boolean;
  onStartLive: () => void;
  onSchedule: () => void;
  onComposeAnnouncement: () => void;
  onOpenRecord: (id: string) => void;
  onOpenUpcoming: (id: string) => void;
  onMarkAnnouncementRead: (id: string) => void;
  previewLock?: boolean;
}) {
  const [pane, setPane] = useState<TeamHubPane>("chat");
  const [messages, setMessages] = useState<TeamChatMessageView[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [pendingVault, setPendingVault] = useState<VaultItemMeta | null>(null);
  const [pendingMeeting, setPendingMeeting] = useState<RecordCard | null>(null);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef(new Set<string>());
  const lastIdRef = useRef<string | null>(null);
  const { scenarioId, isLive } = usePageUxPreview();

  const mergeMessages = useCallback((incoming: TeamChatMessageView[]) => {
    setMessages((prev) => {
      let changed = false;
      const next = [...prev];
      for (const msg of incoming) {
        if (seenIds.current.has(msg.id)) continue;
        seenIds.current.add(msg.id);
        next.push(msg);
        changed = true;
        lastIdRef.current = msg.id;
      }
      if (!changed) return prev;
      next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    seenIds.current = new Set();
    lastIdRef.current = null;
    setMessages([]);
    setError("");

    if (previewLock || !isLive) {
      const preview =
        scenarioId === "empty"
          ? fixtureTeamChatEmpty()
          : scenarioId === "loading"
            ? []
            : fixtureTeamChatFull(currentUserId);
      for (const msg of preview) seenIds.current.add(msg.id);
      setMessages(preview);
      lastIdRef.current = preview[preview.length - 1]?.id ?? null;
      setLoading(false);
      return () => {
        alive = false;
      };
    }

    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/teams/${teamId}/messages?limit=80`, {
          cache: "no-store",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          messages?: TeamChatMessageView[];
        };
        if (!alive) return;
        if (data.ok && Array.isArray(data.messages)) {
          for (const msg of data.messages) seenIds.current.add(msg.id);
          setMessages(data.messages);
          lastIdRef.current =
            data.messages[data.messages.length - 1]?.id ?? null;
        }
      } catch {
        if (alive) setError("채팅을 불러오지 못했습니다.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [teamId, isLive, scenarioId, currentUserId, previewLock]);

  useEffect(() => {
    if (previewLock || !isLive || loading) return;
    const after = lastIdRef.current;
    const url = `/api/teams/${teamId}/messages/stream${
      after ? `?after=${encodeURIComponent(after)}` : ""
    }`;
    const es = new EventSource(url);
    const onMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(String(event.data)) as TeamChatMessageView;
        if (data?.id) mergeMessages([data]);
      } catch {
        /* ignore */
      }
    };
    es.addEventListener("message", onMessage);
    return () => {
      es.removeEventListener("message", onMessage);
      es.close();
    };
  }, [teamId, loading, mergeMessages, isLive, previewLock]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, pane]);

  async function sendMessage() {
    const body = draft.trim();
    if ((!body && !pendingVault && !pendingMeeting) || sending) return;
    setSending(true);
    setError("");
    try {
      if (previewLock || !isLive) {
        const local: TeamChatMessageView = {
          id: `ux-local-${Date.now()}`,
          body,
          attachmentType: pendingVault
            ? "vault_file"
            : pendingMeeting
              ? "team_meeting"
              : null,
          vaultFileId: pendingVault?.id ?? null,
          teamMeetingId: pendingMeeting?.id ?? null,
          attachmentMeta: pendingVault
            ? {
                name: pendingVault.name,
                size: pendingVault.size,
                mime: pendingVault.mime,
              }
            : pendingMeeting
              ? {
                  title: pendingMeeting.title,
                  state: pendingMeeting.state,
                  endedAt: pendingMeeting.endedAt,
                }
              : null,
          createdAt: new Date().toISOString(),
          author: {
            id: currentUserId,
            name: "나",
            handle: null,
            image: null,
          },
        };
        mergeMessages([local]);
        setDraft("");
        setPendingVault(null);
        setPendingMeeting(null);
        return;
      }
      const res = await fetch(`/api/teams/${teamId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          vaultFileId: pendingVault?.id,
          teamMeetingId: pendingMeeting?.id,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        chatMessage?: TeamChatMessageView;
        message?: string;
      };
      if (!res.ok || !data.ok || !data.chatMessage) {
        setError(data.message ?? "메시지를 보내지 못했습니다.");
        return;
      }
      mergeMessages([data.chatMessage]);
      setDraft("");
      setPendingVault(null);
      setPendingMeeting(null);
    } catch {
      setError("메시지를 보내지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  const channelLabel =
    PANE_ITEMS.find((item) => item.id === pane)?.label ?? "채팅";

  return (
    <div className="flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom,0px)+11rem)] md:gap-4 md:pb-0">
      {/* 모바일: 하단 레일 위에 채팅면이 보이도록 뷰포트 높이 고정 */}
      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-inset ring-border",
          "h-[calc(100dvh-14.5rem)] max-h-[calc(100dvh-14.5rem)]",
          "md:grid md:h-[calc(100dvh-11rem)] md:max-h-none md:min-h-[28rem] md:grid-cols-[13rem_minmax(0,1fr)]",
          "lg:grid-cols-[15rem_minmax(0,1fr)]",
        )}
      >
        {/* Desktop channel rail — 앱 사이드바와 별개, 팀 창 안 */}
        <aside className="hidden min-h-0 flex-col border-r border-border md:flex">
          <div className="border-b border-border px-4 py-4">
            <p className="truncate text-base text-muted">팀 채널</p>
            <p className="mt-1 truncate text-lg font-semibold text-foreground">
              {teamName}
            </p>
          </div>
          <nav className="flex flex-col gap-1 p-2" aria-label="팀 채널">
            {PANE_ITEMS.map((item) => {
              const Icon = item.icon;
              const selected = pane === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPane(item.id)}
                  className={cn(
                    "flex min-h-12 items-center gap-2.5 rounded-xl px-3 text-left text-base font-semibold transition-colors",
                    selected
                      ? "text-foreground ring-1 ring-inset ring-border-strong"
                      : "text-muted hover:bg-surface/70 hover:text-foreground",
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" aria-hidden />
                  {item.id === "chat" ? `# ${item.label}` : item.label}
                </button>
              );
            })}
          </nav>
          <div className="mt-auto space-y-2 border-t border-border p-3">
            {canCreateMeeting ? (
              <>
                <button
                  type="button"
                  onClick={onStartLive}
                  className={cn(
                    TOUCH_BUTTON,
                    "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary-hover",
                  )}
                >
                  <Mic className="h-5 w-5" strokeWidth={1.75} />
                  실시간 회의
                </button>
                <button
                  type="button"
                  onClick={onSchedule}
                  className={cn(
                    TOUCH_BUTTON,
                    "inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 font-semibold text-foreground ring-1 ring-inset ring-border hover:bg-surface/70",
                  )}
                >
                  <CalendarDays className="h-5 w-5" strokeWidth={1.75} />
                  일정 만들기
                </button>
              </>
            ) : null}
            {canAnnounce ? (
              <button
                type="button"
                onClick={onComposeAnnouncement}
                className={cn(
                  TOUCH_BUTTON,
                  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-3 font-semibold text-foreground ring-1 ring-inset ring-border hover:bg-surface/70",
                )}
              >
                <Megaphone className="h-5 w-5" strokeWidth={1.75} />
                공지 작성
              </button>
            ) : null}
          </div>
        </aside>

        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="shrink-0 space-y-3 border-b border-border px-4 py-3 md:px-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-xl font-semibold text-foreground">
                  {pane === "chat" ? `# ${channelLabel}` : channelLabel}
                </h2>
                <p className="mt-0.5 truncate text-base text-muted">
                  {pane === "chat"
                    ? "보관함·회의록만 첨부"
                    : pane === "announcements"
                      ? "팀 공지"
                      : pane === "upcoming"
                        ? "예정된 팀 회의"
                        : "최근 팀 회의록"}
                </p>
              </div>
              {canCreateMeeting && pane !== "chat" ? (
                <button
                  type="button"
                  onClick={pane === "upcoming" ? onSchedule : onStartLive}
                  className={cn(
                    TOUCH_BUTTON,
                    "hidden shrink-0 items-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover md:inline-flex",
                  )}
                >
                  <Mic className="h-5 w-5" strokeWidth={1.75} />
                  {pane === "upcoming" ? "일정" : "회의"}
                </button>
              ) : null}
            </div>
            {canCreateMeeting ? (
              <div className="flex gap-2 md:hidden">
                <button
                  type="button"
                  onClick={onStartLive}
                  className={cn(
                    TOUCH_BUTTON,
                    "inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 font-semibold text-primary-foreground hover:bg-primary-hover",
                  )}
                >
                  <Mic className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                  실시간
                </button>
                <button
                  type="button"
                  onClick={onSchedule}
                  className={cn(
                    TOUCH_BUTTON,
                    "inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl px-3 font-semibold text-foreground ring-1 ring-inset ring-border hover:bg-surface/70",
                  )}
                >
                  <CalendarDays className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                  일정
                </button>
              </div>
            ) : null}
          </header>

          {pane === "chat" ? (
            <>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 md:px-5">
                {loading ? (
                  <div className="grid min-h-48 place-items-center">
                    <LoaderCircle
                      className="h-6 w-6 animate-spin text-muted"
                      aria-label="불러오는 중"
                    />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="grid min-h-48 place-items-center px-4 text-center">
                    <div>
                      <p className="text-lg font-semibold text-foreground">
                        아직 대화가 없습니다
                      </p>
                      <p className="mt-2 text-base text-muted">
                        팀원과 메시지를 나누거나 보관함 파일·회의록을
                        보내보세요.
                      </p>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      mine={message.author.id === currentUserId}
                    />
                  ))
                )}
                <div ref={bottomRef} />
              </div>

              <div className="shrink-0 border-t border-border px-3 py-3 md:px-4">
                {error ? (
                  <p className="mb-2 text-base text-destructive">{error}</p>
                ) : null}
                {pendingVault || pendingMeeting ? (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="inline-flex min-h-12 items-center gap-2 rounded-full bg-surface px-3 text-base text-foreground ring-1 ring-inset ring-border">
                      {pendingVault
                        ? pendingVault.name
                        : pendingMeeting?.title}
                      <button
                        type="button"
                        className={cn(TOUCH_ICON_BUTTON, "rounded-full")}
                        aria-label="첨부 제거"
                        onClick={() => {
                          setPendingVault(null);
                          setPendingMeeting(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAttachOpen(true)}
                    className={cn(
                      TOUCH_ICON_BUTTON,
                      "shrink-0 rounded-full border border-border text-foreground hover:bg-surface/70",
                    )}
                    aria-label="Faith 자료 첨부"
                    title="보관함·회의록"
                  >
                    <Paperclip strokeWidth={1.75} />
                  </button>
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">메시지</span>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={1}
                      placeholder="메시지 입력"
                      className="max-h-32 min-h-14 w-full resize-none rounded-2xl bg-transparent px-4 py-3.5 text-base leading-5 text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    disabled={
                      sending ||
                      (!draft.trim() && !pendingVault && !pendingMeeting)
                    }
                    onClick={() => void sendMessage()}
                    className={cn(
                      TOUCH_ICON_BUTTON,
                      "shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary-hover disabled:opacity-50",
                    )}
                    aria-label="보내기"
                  >
                    {sending ? (
                      <LoaderCircle className="animate-spin" />
                    ) : (
                      <Send strokeWidth={1.75} />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {pane === "announcements" ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 md:px-5">
              {canAnnounce ? (
                <button
                  type="button"
                  onClick={onComposeAnnouncement}
                  className={cn(
                    TOUCH_BUTTON,
                    "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary-hover md:w-auto",
                  )}
                >
                  <Megaphone className="h-5 w-5" />
                  공지 작성
                </button>
              ) : null}
              {announcements.length === 0 ? (
                <p className="py-12 text-center text-base text-muted">
                  등록된 공지가 없습니다
                </p>
              ) : (
                announcements.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-2xl bg-surface px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-foreground">
                          {item.title}
                          {item.pinned ? (
                            <span className="ml-2 text-base font-medium text-muted">
                              고정
                            </span>
                          ) : null}
                        </h3>
                        <p className="mt-2 whitespace-pre-wrap text-base leading-6 text-foreground">
                          {item.body}
                        </p>
                        <p className="mt-2 text-base text-muted">
                          {formatChatTime(item.createdAt)}
                        </p>
                      </div>
                      {!item.read ? (
                        <button
                          type="button"
                          onClick={() => onMarkAnnouncementRead(item.id)}
                          className={cn(
                            TOUCH_BUTTON,
                            "shrink-0 rounded-xl px-3 font-semibold text-foreground ring-1 ring-inset ring-border",
                          )}
                        >
                          확인
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : null}

          {pane === "upcoming" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-3">
              {upcoming.length === 0 ? (
                <p className="py-12 text-center text-base text-muted">
                  예정된 회의가 없습니다
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onOpenUpcoming(item.id)}
                        className={cn(
                          TOUCH_ROW,
                          "flex w-full items-center justify-between gap-3 px-3 text-left hover:bg-surface/70",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-lg font-semibold text-foreground">
                            {item.title}
                          </span>
                          <span className="block text-base text-muted">
                            {formatWhen(item.scheduledStartAt)}
                          </span>
                        </span>
                        <span className="shrink-0 text-base text-muted">
                          {item.canJoin ? "참가" : "보기"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {pane === "records" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2 md:px-3">
              {records.length === 0 ? (
                <p className="py-12 text-center text-base text-muted">
                  아직 팀 회의록이 없습니다
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {records.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onOpenRecord(item.id)}
                        className={cn(
                          TOUCH_ROW,
                          "flex w-full items-center justify-between gap-3 px-3 text-left hover:bg-surface/70",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-lg font-semibold text-foreground">
                            {item.title}
                          </span>
                          <span className="block text-base text-muted">
                            {formatWhen(item.endedAt)}
                          </span>
                        </span>
                        <span className="shrink-0 text-base text-muted">
                          상세
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </section>
      </div>

      <TeamHubMobileRail active={pane} onChange={setPane} />

      <AttachSheet
        open={attachOpen}
        onClose={() => setAttachOpen(false)}
        records={records}
        onPickVault={(item) => {
          setPendingVault(item);
          setPendingMeeting(null);
          setAttachOpen(false);
          setPane("chat");
        }}
        onPickMeeting={(record) => {
          setPendingMeeting(record);
          setPendingVault(null);
          setAttachOpen(false);
          setPane("chat");
        }}
      />
    </div>
  );
}
