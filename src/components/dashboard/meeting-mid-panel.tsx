"use client";

import { ArrowRight, LayoutGrid, List, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { UpcomingDetailPanel } from "@/components/dashboard/upcoming-detail-panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import {
  daysUntilFromDateLabel,
  resolveUpcomingListDate,
} from "@/lib/meeting-date";
import { matchesSearchText } from "@/lib/search-text";
import {
  getMeetingPlatform,
  inferMeetingPlatform,
  MeetingPlatformIcon,
  platformDefaultLocation,
} from "@/lib/meeting-platform";
import {
  createUpcomingDraft,
  getUpcomingByWorkspace,
  resolveWorkspacePerson,
  type UpcomingItem,
} from "@/lib/workspace-data";
import { getWorkspaceProfile } from "@/lib/workspaces";
import { cn } from "@/lib/utils";

const LAYOUT_KEY = "faith.upcoming.layout";
const UPCOMING_STORE_KEY = "faith.upcoming.items";

type UpcomingLayout = "list" | "grid";

function upcomingStoreKey(workspaceId: string) {
  return `${UPCOMING_STORE_KEY}.${workspaceId}`;
}

function readStoredUpcoming(
  workspaceId: string,
  seed: UpcomingItem[],
): UpcomingItem[] {
  if (typeof window === "undefined") return seed;
  try {
    const raw = window.localStorage.getItem(upcomingStoreKey(workspaceId));
    if (!raw) return seed;
    const parsed = JSON.parse(raw) as UpcomingItem[];
    return Array.isArray(parsed) ? parsed : seed;
  } catch {
    return seed;
  }
}

function writeStoredUpcoming(workspaceId: string, items: UpcomingItem[]) {
  try {
    window.localStorage.setItem(
      upcomingStoreKey(workspaceId),
      JSON.stringify(items),
    );
  } catch {
    // ignore quota
  }
}

function readLayout(): UpcomingLayout {
  if (typeof window === "undefined") return "list";
  const saved = window.localStorage.getItem(LAYOUT_KEY);
  // 이전 compact/expanded 키 호환
  if (saved === "expanded" || saved === "grid") return "grid";
  return "list";
}

function platformOf(item: UpcomingItem) {
  return item.platform ?? inferMeetingPlatform(item.location);
}

function locationCaption(item: UpcomingItem) {
  const platform = platformOf(item);
  const defaultLabel = platformDefaultLocation(platform);
  if (platform !== "custom" && item.location === defaultLabel) {
    return getMeetingPlatform(platform).label.replace("Google ", "");
  }
  return item.location;
}

function parseTimeMinutes(timeLabel: string) {
  const m = timeLabel.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** 날짜(상대/요일) → 시각 순. */
function compareUpcoming(a: UpcomingItem, b: UpcomingItem) {
  const da = daysUntilFromDateLabel(a.dateLabel) ?? 9999;
  const db = daysUntilFromDateLabel(b.dateLabel) ?? 9999;
  if (da !== db) return da - db;
  return parseTimeMinutes(a.timeLabel) - parseTimeMinutes(b.timeLabel);
}

function showUpcomingPeople(
  participants: string[],
  showPeopleDensity: boolean,
) {
  if (!showPeopleDensity) return false;
  return participants.length > 1;
}

function ParticipantAvatars({
  participants,
  max = 3,
}: {
  participants: string[];
  max?: number;
}) {
  if (participants.length === 0) return null;

  const visible = participants.slice(0, max);
  const overflow = participants.length - visible.length;

  return (
    <div
      className="flex items-center gap-2.5"
      title={participants.join(", ")}
      aria-label={`참석자 ${participants.length}명`}
    >
      <div className="flex -space-x-2">
        {visible.map((name, index) => {
          const person = resolveWorkspacePerson(name);
          return (
            <Avatar
              key={`${name}-${index}`}
              className="h-9 w-9 border-2 border-card"
              style={{ zIndex: index + 1 }}
            >
              <AvatarFallback
                className={cn(
                  "text-xs font-semibold text-white/95",
                  person.color,
                )}
              >
                {person.initials}
              </AvatarFallback>
            </Avatar>
          );
        })}
        {overflow > 0 ? (
          <span
            className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-surface-2 text-xs font-semibold text-muted"
            style={{ zIndex: visible.length + 1 }}
          >
            +{overflow}
          </span>
        ) : null}
      </div>
      <span className="hidden text-base font-medium text-muted sm:inline">
        {participants.length}명
      </span>
    </div>
  );
}

/**
 * M3 list
 * leading: 날짜 시간 · 소요시간
 * headline: 제목
 * supporting: 장소(Zoom 등)
 * trailing: 화살표
 * 참고: m3.material.io/components/lists
 */
function UpcomingListItem({
  item,
  onOpen,
  showPeopleDensity,
}: {
  item: UpcomingItem;
  onOpen: (item: UpcomingItem) => void;
  showPeopleDensity: boolean;
}) {
  const { label: dateLabel, ddayBadge, days } = resolveUpcomingListDate(
    item.dateLabel,
  );
  const isToday = days === 0;
  const place = locationCaption(item);
  const peopleVisible = showUpcomingPeople(
    item.participants,
    showPeopleDensity,
  );

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "group flex w-full items-center gap-3 border-l-[3px] px-3.5 py-4 text-left transition-colors sm:gap-4 sm:px-5",
        isToday
          ? "border-l-primary bg-primary-soft hover:bg-primary-soft/80"
          : "border-l-transparent hover:bg-surface/70",
      )}
    >
      <div className="flex min-w-[8.5rem] shrink-0 flex-col justify-center sm:min-w-[10rem]">
        <p className="whitespace-nowrap text-lg font-semibold leading-6 tracking-tight text-foreground">
          <span className="font-medium text-muted">{dateLabel}</span>{" "}
          <span className="tabular-nums">{item.timeLabel}</span>
          <span className="mx-1.5 font-medium text-muted-2" aria-hidden>
            ·
          </span>
          <span className="font-medium tabular-nums text-muted">
            {item.duration}
          </span>
        </p>
        {ddayBadge ? (
          <p className="mt-1 text-base font-medium leading-5 text-muted-2">
            {ddayBadge}
          </p>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold leading-6 text-foreground group-hover:text-primary">
          {item.title}
        </p>
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-base font-medium text-muted">
          <MeetingPlatformIcon platform={platformOf(item)} size="sm" />
          <span className="truncate">{place}</span>
        </p>
        {peopleVisible ? (
          <div className="mt-2.5">
            <ParticipantAvatars participants={item.participants} max={3} />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center self-stretch pl-1">
        <ArrowRight
          className="h-4 w-4 text-foreground/35"
          strokeWidth={2}
          absoluteStrokeWidth
          aria-hidden
        />
      </div>
    </button>
  );
}

function UpcomingGridItem({
  item,
  onOpen,
  showPeopleDensity,
}: {
  item: UpcomingItem;
  onOpen: (item: UpcomingItem) => void;
  showPeopleDensity: boolean;
}) {
  const { label: dateLabel, ddayBadge, days } = resolveUpcomingListDate(
    item.dateLabel,
  );
  const isToday = days === 0;
  const place = locationCaption(item);
  const peopleVisible = showUpcomingPeople(
    item.participants,
    showPeopleDensity,
  );
  const agendaPreview = item.agenda.slice(0, 2);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "group flex h-full min-h-[11rem] w-full flex-col rounded-xl bg-card p-4 text-left transition-colors",
        isToday
          ? "border-2 border-primary shadow-soft hover:bg-primary-soft/40"
          : "border border-border hover:border-border-strong hover:bg-surface/50",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-lg font-semibold tracking-tight text-foreground">
            <span className="font-medium text-muted">{dateLabel}</span>{" "}
            <span className="tabular-nums">{item.timeLabel}</span>
            <span className="mx-1.5 font-medium text-muted-2" aria-hidden>
              ·
            </span>
            <span className="font-medium tabular-nums text-muted">
              {item.duration}
            </span>
          </p>
        </div>
        {ddayBadge ? (
          <span className="shrink-0 text-base font-medium text-muted-2">
            {ddayBadge}
          </span>
        ) : null}
      </div>

      <p className="mt-3 line-clamp-2 text-lg font-semibold leading-snug text-foreground group-hover:text-primary">
        {item.title}
      </p>

      <p className="mt-2 flex min-w-0 items-center gap-1.5 text-base font-medium text-muted">
        <MeetingPlatformIcon platform={platformOf(item)} size="sm" />
        <span className="truncate">{place}</span>
      </p>

      {peopleVisible ? (
        <div className="mt-3">
          <ParticipantAvatars participants={item.participants} max={3} />
        </div>
      ) : null}

      {agendaPreview.length > 0 ? (
        <ul className="mt-auto space-y-1 pt-3.5">
          {agendaPreview.map((line, index) => (
            <li
              key={`${item.id}-preview-${index}`}
              className="truncate text-base font-medium leading-5 text-muted-2"
            >
              {line}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-auto" />
      )}
    </button>
  );
}

/** 녹음 영역과 회의 기록 사이 — 워크스페이스별 예정 회의. */
export function MeetingMidPanel({
  searchQuery = "",
}: {
  searchQuery?: string;
}) {
  const { workspaceId, currentUser } = useAppContext();
  const profile = getWorkspaceProfile(workspaceId);
  const seed = useMemo(
    () => getUpcomingByWorkspace(workspaceId),
    [workspaceId],
  );
  const [items, setItems] = useState<UpcomingItem[]>(seed);
  const [layout, setLayout] = useState<UpcomingLayout>("list");
  const [selected, setSelected] = useState<UpcomingItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<"view" | "create">("view");

  useEffect(() => {
    setItems(readStoredUpcoming(workspaceId, seed));
    setDetailOpen(false);
    setSelected(null);
    setDetailMode("view");
  }, [seed, workspaceId]);

  useEffect(() => {
    setLayout(readLayout());
  }, []);

  const visibleItems = useMemo(() => {
    const filtered = !searchQuery.trim()
      ? items
      : items.filter((item) =>
          matchesSearchText(
            [
              item.title,
              item.location,
              item.organizer,
              ...item.participants,
              ...item.agenda,
            ],
            searchQuery,
          ),
        );
    return [...filtered].sort(compareUpcoming);
  }, [items, searchQuery]);

  const setLayoutPersist = useCallback((next: UpcomingLayout) => {
    setLayout(next);
    window.localStorage.setItem(LAYOUT_KEY, next);
  }, []);

  const openDetail = useCallback((item: UpcomingItem) => {
    setDetailMode("view");
    setSelected(item);
    setDetailOpen(true);
  }, []);

  const openCreate = useCallback(() => {
    setDetailMode("create");
    setSelected(createUpcomingDraft(workspaceId, currentUser.name));
    setDetailOpen(true);
  }, [workspaceId, currentUser.name]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setDetailMode("view");
  }, []);

  const saveItem = useCallback(
    (next: UpcomingItem) => {
      setItems((prev) => {
        const exists = prev.some((item) => item.id === next.id);
        const list = exists
          ? prev.map((item) => (item.id === next.id ? next : item))
          : [...prev, next];
        writeStoredUpcoming(workspaceId, list);
        return list;
      });
      setSelected(next);
      setDetailMode("view");
    },
    [workspaceId],
  );

  const deleteItem = useCallback(
    (target: UpcomingItem) => {
      setItems((prev) => {
        const list = prev.filter((item) => item.id !== target.id);
        writeStoredUpcoming(workspaceId, list);
        return list;
      });
      setSelected(null);
      setDetailMode("view");
    },
    [workspaceId],
  );

  return (
    <>
      <section className="overflow-hidden rounded-2xl bg-card shadow-soft outline-none">
        <div className="flex items-center justify-between gap-2 px-4 py-4 sm:px-5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-semibold text-foreground">
              {profile.upcomingTitle}
            </h2>
            {visibleItems.length > 0 ? (
              <span className="inline-flex min-w-8 items-center justify-center rounded-lg bg-surface px-2.5 py-1 text-base font-semibold tabular-nums text-foreground">
                {visibleItems.length}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 cursor-pointer text-foreground/70 hover:bg-surface hover:text-foreground"
              aria-label={profile.upcomingAddLabel}
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} />
            </Button>
            <div
              className="flex items-center rounded-lg bg-surface p-0.5"
              role="group"
              aria-label={`${profile.upcomingTitle} 레이아웃`}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 cursor-pointer text-foreground/55 hover:bg-transparent hover:text-foreground",
                  layout === "list" && "bg-card text-foreground shadow-soft",
                )}
                aria-pressed={layout === "list"}
                aria-label="목록 보기"
                onClick={() => setLayoutPersist("list")}
              >
                <List className="h-4 w-4" strokeWidth={1.75} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "h-8 w-8 cursor-pointer text-foreground/55 hover:bg-transparent hover:text-foreground",
                  layout === "grid" && "bg-card text-foreground shadow-soft",
                )}
                aria-pressed={layout === "grid"}
                aria-label="격자 보기"
                onClick={() => setLayoutPersist("grid")}
              >
                <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            </div>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="px-4 pb-8 pt-2 text-center">
            <p className="text-base text-muted">
              {searchQuery.trim()
                ? "검색 결과가 없습니다."
                : profile.upcomingEmpty}
            </p>
            {!searchQuery.trim() ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3 cursor-pointer"
                onClick={openCreate}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                {profile.upcomingAddLabel}
              </Button>
            ) : null}
          </div>
        ) : layout === "list" ? (
          <ul className="divide-y divide-border/60">
            {visibleItems.map((item) => (
              <li key={item.id}>
                <UpcomingListItem
                  item={item}
                  onOpen={openDetail}
                  showPeopleDensity={profile.showPeopleDensity}
                />
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={openCreate}
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 px-4 py-3.5 text-base font-medium text-muted transition-colors hover:bg-surface/70 hover:text-foreground"
                aria-label={profile.upcomingAddLabel}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                {profile.upcomingAddLabel}
              </button>
            </li>
          </ul>
        ) : (
          <ul
            className={cn(
              "grid gap-3 bg-surface/55 px-4 pb-4 pt-3 sm:grid-cols-2",
              visibleItems.length >= 5 && "xl:grid-cols-3",
            )}
          >
            {visibleItems.map((item) => (
              <li key={item.id} className="min-h-0">
                <UpcomingGridItem
                  item={item}
                  onOpen={openDetail}
                  showPeopleDensity={profile.showPeopleDensity}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <UpcomingDetailPanel
        item={selected}
        open={detailOpen}
        mode={detailMode}
        onClose={closeDetail}
        onSave={saveItem}
        onDelete={deleteItem}
      />
    </>
  );
}
