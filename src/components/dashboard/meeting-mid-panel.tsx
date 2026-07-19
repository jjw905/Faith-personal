"use client";

import { ArrowRight, LayoutGrid, List, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { UpcomingDetailPanel } from "@/components/dashboard/upcoming-detail-panel";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { formatDdayLabel } from "@/lib/meeting-date";
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
type UpcomingLayout = "list" | "grid";

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
      className="flex items-center gap-2"
      title={participants.join(", ")}
      aria-label={`참석자 ${participants.length}명`}
    >
      <div className="flex -space-x-1.5">
        {visible.map((name, index) => {
          const person = resolveWorkspacePerson(name);
          return (
            <Avatar
              key={`${name}-${index}`}
              className="h-7 w-7 border-2 border-card"
              style={{ zIndex: index + 1 }}
            >
              <AvatarFallback
                className={cn(
                  "text-[10px] font-semibold text-white",
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
            className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-surface-2 text-[10px] font-semibold text-foreground"
            style={{ zIndex: visible.length + 1 }}
          >
            +{overflow}
          </span>
        ) : null}
      </div>
      <span className="hidden text-xs font-medium text-muted sm:inline">
        {participants.length}명
      </span>
    </div>
  );
}

/**
 * M3 three-line list item
 * leading: 날짜·시간 / headline: 제목 / supporting: 장소·참석 / trailing: 소요·화살표
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
  const dday = formatDdayLabel(item.dateLabel);
  const place = locationCaption(item);
  const peopleVisible = showUpcomingPeople(
    item.participants,
    showPeopleDensity,
  );

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group flex min-h-[5.5rem] w-full gap-3 px-3 py-3.5 text-left transition-colors hover:bg-surface/70 sm:gap-4 sm:px-4"
    >
      {/* leadingContent */}
      <div className="flex w-[4.25rem] shrink-0 flex-col items-start pt-0.5 sm:w-[5rem]">
        <p className="text-[11px] font-medium leading-4 tracking-tight text-muted">
          {item.dateLabel}
        </p>
        <p className="mt-1 text-[1.25rem] font-semibold leading-7 tabular-nums tracking-tight text-foreground">
          {item.timeLabel}
        </p>
        {dday ? (
          <p className="mt-1 text-[11px] font-semibold leading-4 text-primary">
            {dday}
          </p>
        ) : null}
      </div>

      {/* headline + supporting */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-base font-medium leading-6 text-foreground group-hover:text-primary">
            {item.title}
          </p>
          {/* trailingSupportingText */}
          <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
            <span className="text-xs font-medium tabular-nums text-muted">
              {item.duration}
            </span>
            <ArrowRight
              className="h-4 w-4 text-foreground/40"
              strokeWidth={2}
              absoluteStrokeWidth
              aria-hidden
            />
          </div>
        </div>

        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
          <MeetingPlatformIcon platform={platformOf(item)} size="sm" />
          <span className="truncate">{place}</span>
        </p>

        {peopleVisible ? (
          <div className="mt-2">
            <ParticipantAvatars participants={item.participants} max={3} />
          </div>
        ) : null}
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
  const dday = formatDdayLabel(item.dateLabel);
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
      className="group flex h-full min-h-[10.5rem] w-full flex-col rounded-xl bg-surface p-3.5 text-left transition-colors hover:bg-surface-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted">{item.dateLabel}</p>
          <p className="mt-0.5 text-lg font-semibold tabular-nums tracking-tight text-foreground">
            {item.timeLabel}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {dday ? (
            <span className="text-[11px] font-semibold text-primary">{dday}</span>
          ) : null}
          <span className="text-xs font-medium tabular-nums text-muted">
            {item.duration}
          </span>
        </div>
      </div>

      <p className="mt-2.5 line-clamp-2 text-base font-medium leading-snug text-foreground group-hover:text-primary">
        {item.title}
      </p>

      <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted">
        <MeetingPlatformIcon platform={platformOf(item)} size="sm" />
        <span className="truncate">{place}</span>
      </p>

      {peopleVisible ? (
        <div className="mt-2.5">
          <ParticipantAvatars participants={item.participants} max={3} />
        </div>
      ) : null}

      {agendaPreview.length > 0 ? (
        <ul className="mt-auto space-y-0.5 pt-3">
          {agendaPreview.map((line, index) => (
            <li
              key={`${item.id}-preview-${index}`}
              className="truncate text-xs font-medium text-muted-2"
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
    setItems(seed);
    setDetailOpen(false);
    setSelected(null);
    setDetailMode("view");
  }, [seed]);

  useEffect(() => {
    setLayout(readLayout());
  }, []);

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = [
        item.title,
        item.location,
        item.organizer,
        ...item.participants,
        ...item.agenda,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
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

  const saveItem = useCallback((next: UpcomingItem) => {
    setItems((prev) => {
      const exists = prev.some((item) => item.id === next.id);
      return exists
        ? prev.map((item) => (item.id === next.id ? next : item))
        : [...prev, next];
    });
    setSelected(next);
    setDetailMode("view");
  }, []);

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <div className="flex items-center justify-between gap-2 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-foreground">
              {profile.upcomingTitle}
            </h2>
            {visibleItems.length > 0 ? (
              <span className="inline-flex min-w-7 items-center justify-center rounded-lg bg-surface px-2 py-1 text-sm font-semibold tabular-nums text-foreground">
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
          <div className="border-t border-border px-4 py-8 text-center">
            <p className="text-sm text-muted">
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
          <ul className="divide-y divide-border border-t border-border">
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
                className="flex w-full cursor-pointer items-center justify-center gap-1.5 px-4 py-3.5 text-sm font-medium text-muted transition-colors hover:bg-surface/70 hover:text-foreground"
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
              "grid gap-3 border-t border-border p-4 sm:grid-cols-2",
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
      />
    </>
  );
}
