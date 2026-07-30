"use client";

import {
  ArrowRight,
  CalendarPlus,
  LayoutGrid,
  List,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { UpcomingDetailPanel } from "@/components/dashboard/upcoming-detail-panel";
import {
  RecordsPageNav,
  UPCOMING_PAGE_SIZE,
} from "@/components/dashboard/records-page-nav";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
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
import { TOUCH_ICON_BUTTON, TOUCH_ROW } from "@/lib/touch-target";
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
        "group flex w-full items-center gap-3 border-l-[3px] px-6 py-4 text-left transition-colors sm:gap-4 sm:py-5",
        isToday
          ? "border-l-primary bg-primary-soft hover:bg-primary-soft/80"
          : "border-l-transparent hover:bg-surface/70",
      )}
    >
      <div className="flex min-w-[8.5rem] shrink-0 flex-col justify-center sm:min-w-[10rem]">
        <p className="whitespace-nowrap text-lg font-semibold leading-6 tracking-tight text-foreground">
          <span className="font-medium text-muted">{dateLabel}</span>{" "}
          <span className="tabular-nums">{item.timeLabel}</span>
          <span className="font-medium text-muted-2">, </span>
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
        "group flex h-full min-h-[11rem] w-full flex-col rounded-2xl bg-surface p-4 text-left transition-colors",
        isToday
          ? "ring-2 ring-primary hover:bg-primary-soft/40"
          : "ring-1 ring-border hover:bg-surface-2",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="whitespace-nowrap text-lg font-semibold tracking-tight text-foreground">
            <span className="font-medium text-muted">{dateLabel}</span>{" "}
            <span className="tabular-nums">{item.timeLabel}</span>
            <span className="font-medium text-muted-2">, </span>
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
  onSearchChange,
}: {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
}) {
  const { workspaceId, currentUser } = useAppContext();
  const { scenarioId, isLive } = usePageUxPreview();
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

  const sourceItems = useMemo(() => {
    if (scenarioId === "empty") return [];
    if (
      scenarioId === "full" ||
      scenarioId === "popup-upcoming" ||
      scenarioId === "popup-upcoming-create"
    ) {
      const base = seed.length > 0 ? seed : getUpcomingByWorkspace(workspaceId);
      if (base.length >= 8) return base;
      const padded = [...base];
      for (let i = padded.length; i < 8; i += 1) {
        const src = base[i % Math.max(base.length, 1)] ?? createUpcomingDraft(
          workspaceId,
          currentUser.name,
        );
        padded.push({
          ...src,
          id: `ux-up-${i + 1}`,
          title: `${src.title} ${i + 1}`,
        });
      }
      return padded.length > 0
        ? padded
        : [
            createUpcomingDraft(workspaceId, currentUser.name),
          ];
    }
    return items;
  }, [scenarioId, seed, items, workspaceId, currentUser.name]);

  useEffect(() => {
    if (scenarioId !== "popup-upcoming" && scenarioId !== "popup-upcoming-create") {
      if (
        scenarioId === "live" ||
        scenarioId === "empty" ||
        scenarioId === "full"
      ) {
        setDetailOpen(false);
      }
      return;
    }
    if (scenarioId === "popup-upcoming-create") {
      setDetailMode("create");
      setSelected(createUpcomingDraft(workspaceId, currentUser.name));
      setDetailOpen(true);
      return;
    }
    const target = sourceItems[0] ?? createUpcomingDraft(workspaceId, currentUser.name);
    setDetailMode("view");
    setSelected(target);
    setDetailOpen(true);
  }, [scenarioId, sourceItems, workspaceId, currentUser.name]);

  const visibleItems = useMemo(() => {
    const filtered = !searchQuery.trim()
      ? sourceItems
      : sourceItems.filter((item) =>
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
  }, [sourceItems, searchQuery]);

  const [upcomingPage, setUpcomingPage] = useState(1);
  const upcomingTotalPages = Math.max(
    1,
    Math.ceil(visibleItems.length / UPCOMING_PAGE_SIZE),
  );
  const pagedUpcoming = useMemo(() => {
    const page = Math.min(upcomingPage, upcomingTotalPages);
    const start = (page - 1) * UPCOMING_PAGE_SIZE;
    return visibleItems.slice(start, start + UPCOMING_PAGE_SIZE);
  }, [visibleItems, upcomingPage, upcomingTotalPages]);

  useEffect(() => {
    setUpcomingPage(1);
  }, [searchQuery, workspaceId]);

  useEffect(() => {
    setUpcomingPage((p) => Math.min(p, upcomingTotalPages));
  }, [upcomingTotalPages]);

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
    if (
      scenarioId === "popup-upcoming" ||
      scenarioId === "popup-upcoming-create"
    ) {
      return;
    }
    setDetailOpen(false);
    setDetailMode("view");
  }, [scenarioId]);

  const saveItem = useCallback(
    (next: UpcomingItem) => {
      if (!isLive) {
        setSelected(next);
        setDetailMode("view");
        return;
      }
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
    [workspaceId, isLive],
  );

  const deleteItem = useCallback(
    (target: UpcomingItem) => {
      if (!isLive) {
        setDetailOpen(false);
        setDetailMode("view");
        return;
      }
      setItems((prev) => {
        const list = prev.filter((item) => item.id !== target.id);
        writeStoredUpcoming(workspaceId, list);
        return list;
      });
      setSelected(null);
      setDetailMode("view");
    },
    [workspaceId, isLive],
  );

  return (
    <>
      <section className="overflow-hidden rounded-3xl bg-card shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border outline-none">
        <div className="space-y-0 bg-card px-6 pb-0 pt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                {profile.upcomingTitle}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  TOUCH_ICON_BUTTON,
                  "shrink-0 cursor-pointer text-foreground/70 hover:bg-surface hover:text-foreground",
                )}
                aria-label={profile.upcomingAddLabel}
                title={profile.upcomingAddLabel}
                onClick={openCreate}
              >
                <Plus strokeWidth={1.75} />
              </Button>
            </div>

            {/* 모바일은 격자가 1열이라 목록과 동일. 데스크탑에서만 노출 */}
            <div className="hidden items-center gap-1.5 md:flex">
              <div
                className="flex overflow-hidden rounded-lg bg-surface-2 ring-1 ring-border"
                role="group"
                aria-label={`${profile.upcomingTitle} 레이아웃`}
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-none cursor-pointer text-muted-2 hover:bg-transparent hover:text-foreground",
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
                    "h-8 w-8 rounded-none cursor-pointer text-muted-2 hover:bg-transparent hover:text-foreground",
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
          <MeetingSearch
            value={searchQuery}
            onChange={onSearchChange ?? (() => undefined)}
            placeholder={profile.searchPlaceholder}
            label={`${profile.upcomingTitle} 검색`}
            className="mt-3 h-12 max-w-none rounded-2xl md:h-11"
          />
          <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
        </div>

        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 py-10 text-center">
            <CalendarPlus
              className="h-12 w-12 text-muted-2"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-base text-muted">
              {searchQuery.trim()
                ? "검색 결과가 없습니다."
                : profile.upcomingEmpty}
            </p>
            {!searchQuery.trim() ? (
              <Button
                type="button"
                className="min-h-14 w-full max-w-xs cursor-pointer rounded-2xl px-6 text-lg font-semibold md:min-h-11 md:w-auto md:text-base [&_svg]:size-5"
                onClick={openCreate}
              >
                <Plus strokeWidth={2} />
                {profile.upcomingAddLabel}
              </Button>
            ) : null}
          </div>
        ) : layout === "list" ? (
          <>
            <ul className="divide-y divide-border">
              {pagedUpcoming.map((item) => (
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
                  className={cn(
                    TOUCH_ROW,
                    "flex w-full cursor-pointer items-center justify-center gap-2 px-6 text-base font-semibold text-muted transition-colors hover:bg-surface/70 hover:text-foreground",
                  )}
                  aria-label={profile.upcomingAddLabel}
                >
                  <Plus className="h-5 w-5" strokeWidth={2} aria-hidden />
                  {profile.upcomingAddLabel}
                </button>
              </li>
            </ul>
            <RecordsPageNav
              page={Math.min(upcomingPage, upcomingTotalPages)}
              totalPages={upcomingTotalPages}
              onPageChange={setUpcomingPage}
            />
          </>
        ) : (
          <>
            <ul
              className={cn(
                "grid gap-3 px-6 pb-5 pt-4 sm:grid-cols-2",
                pagedUpcoming.length >= 3 && "xl:grid-cols-3",
              )}
            >
              {pagedUpcoming.map((item) => (
                <li key={item.id} className="min-h-0">
                  <UpcomingGridItem
                    item={item}
                    onOpen={openDetail}
                    showPeopleDensity={profile.showPeopleDensity}
                  />
                </li>
              ))}
            </ul>
            <RecordsPageNav
              page={Math.min(upcomingPage, upcomingTotalPages)}
              totalPages={upcomingTotalPages}
              onPageChange={setUpcomingPage}
            />
          </>
        )}
      </section>

      <UpcomingDetailPanel
        item={selected}
        open={
          detailOpen ||
          scenarioId === "popup-upcoming" ||
          scenarioId === "popup-upcoming-create"
        }
        mode={detailMode}
        onClose={closeDetail}
        onSave={saveItem}
        onDelete={deleteItem}
      />
    </>
  );
}
