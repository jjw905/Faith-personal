"use client";

import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  Mic,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { UpcomingDetailPanel } from "@/components/dashboard/upcoming-detail-panel";
import {
  RecordsPageNav,
  upcomingPageSize,
} from "@/components/dashboard/records-page-nav";
import { MonthDayCalendar } from "@/components/meetings/month-day-calendar";
import { ScheduleDayStrip } from "@/components/meetings/schedule-day-strip";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { useMdUp } from "@/hooks/use-md-up";
import {
  isoToUpcomingDateLabel,
  resolveUpcomingListDate,
  seoulDateKey,
} from "@/lib/meeting-date";
import {
  getMeetingPlatform,
  inferMeetingPlatform,
  MeetingPlatformIcon,
} from "@/lib/meeting-platform";
import { matchesSearchText } from "@/lib/search-text";
import {
  createUpcomingDraft,
  getUpcomingByWorkspace,
  normalizeUpcomingItem,
  scheduleIsoOf,
  scheduleKindOf,
  type ScheduleKind,
  type UpcomingItem,
} from "@/lib/workspace-data";
import { getWorkspaceProfile } from "@/lib/workspaces";
import { TOUCH_ROW } from "@/lib/touch-target";
import { cn } from "@/lib/utils";

const UPCOMING_STORE_KEY = "faith.upcoming.items";
const LIST_VISIBLE_PARTICIPANTS_WIDE = 5;
const LIST_VISIBLE_PARTICIPANTS_NARROW = 3;

function upcomingStoreKey(workspaceId: string) {
  return `${UPCOMING_STORE_KEY}.${workspaceId}`;
}

function readStoredUpcoming(
  workspaceId: string,
  seed: UpcomingItem[],
): UpcomingItem[] {
  if (typeof window === "undefined") return seed.map((i) => normalizeUpcomingItem(i));
  try {
    const raw = window.localStorage.getItem(upcomingStoreKey(workspaceId));
    if (!raw) return seed.map((i) => normalizeUpcomingItem(i));
    const parsed = JSON.parse(raw) as UpcomingItem[];
    if (!Array.isArray(parsed)) return seed.map((i) => normalizeUpcomingItem(i));
    const seedById = new Map(seed.map((item) => [item.id, item]));
    return parsed.map((item) => {
      const fromSeed = seedById.get(item.id);
      let next = item;
      if (
        fromSeed &&
        fromSeed.participants.length > 1 &&
        item.participants.length === 1 &&
        item.participants[0] === "나"
      ) {
        next = { ...item, participants: [...fromSeed.participants] };
      }
      if (fromSeed && !item.kind && fromSeed.kind) {
        next = { ...next, kind: fromSeed.kind };
      }
      return normalizeUpcomingItem(next);
    });
  } catch {
    return seed.map((i) => normalizeUpcomingItem(i));
  }
}

function writeStoredUpcoming(workspaceId: string, items: UpcomingItem[]) {
  try {
    window.localStorage.setItem(
      upcomingStoreKey(workspaceId),
      JSON.stringify(items.map((i) => normalizeUpcomingItem(i))),
    );
  } catch {
    // ignore quota
  }
}

function parseTimeMinutes(timeLabel: string) {
  const m = timeLabel.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 0;
  return Number(m[1]) * 60 + Number(m[2]);
}

function compareUpcoming(a: UpcomingItem, b: UpcomingItem) {
  const isoA = scheduleIsoOf(a);
  const isoB = scheduleIsoOf(b);
  if (isoA !== isoB) return isoA < isoB ? -1 : 1;
  return parseTimeMinutes(a.timeLabel) - parseTimeMinutes(b.timeLabel);
}

function UpcomingListItem({
  item,
  onOpen,
  hideDateColumn = false,
}: {
  item: UpcomingItem;
  onOpen: (item: UpcomingItem) => void;
  /** 선택일 필터 목록에서는 날짜 열 숨김 */
  hideDateColumn?: boolean;
}) {
  const isMdUp = useMdUp();
  const { label: dateLabel, days } = resolveUpcomingListDate(item.dateLabel);
  const isToday = days === 0;
  const kind = scheduleKindOf(item);
  const isMeeting = kind === "meeting";
  const agendaPreview = isMeeting ? item.agenda.slice(0, 2) : [];
  const notePreview =
    !isMeeting && item.notes.trim()
      ? item.notes.trim()
      : null;
  const platform = item.platform ?? inferMeetingPlatform(item.location);
  const placeLabel =
    item.location.trim() || getMeetingPlatform(platform).label;
  const showPlaceIcon =
    isMeeting &&
    (platform !== "custom" || Boolean(item.location.trim()));
  const participants = isMeeting ? item.participants : [];
  const maxVisible = isMdUp
    ? LIST_VISIBLE_PARTICIPANTS_WIDE
    : LIST_VISIBLE_PARTICIPANTS_NARROW;
  const visibleParticipants = participants.slice(0, maxVisible);
  const overflowCount = Math.max(0, participants.length - maxVisible);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "group flex w-full items-center gap-3 border-l-[3px] py-4 text-left transition-colors sm:gap-4 sm:py-5",
        isToday
          ? "border-l-primary bg-primary-soft hover:bg-primary-soft"
          : "border-l-transparent hover:bg-surface/70",
      )}
    >
      <div
        className={cn(
          "shrink-0 space-y-0.5 pl-3 sm:pl-4",
          hideDateColumn ? "w-[4.25rem] sm:w-[4.5rem]" : "w-[4.5rem] sm:w-[5rem]",
        )}
      >
        {hideDateColumn ? null : (
          <p className="text-base font-semibold leading-5 tracking-tight text-muted">
            {dateLabel}
          </p>
        )}
        <p className="text-lg font-semibold tabular-nums leading-6 tracking-tight text-foreground">
          {item.timeLabel}
        </p>
        <p className="text-base font-medium text-muted-2">
          {isMeeting ? "회의" : "일정"}
        </p>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="min-w-0 truncate text-lg font-semibold leading-snug tracking-tight text-foreground group-hover:text-primary">
            {item.title}
          </p>
          {showPlaceIcon ? (
            <span
              className="shrink-0"
              title={placeLabel}
              aria-label={`장소 ${placeLabel}`}
            >
              <MeetingPlatformIcon platform={platform} size="sm" />
            </span>
          ) : null}
        </div>
        {agendaPreview.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {agendaPreview.map((line, index) => (
              <li
                key={`${item.id}-preview-${index}`}
                className="truncate text-base font-medium leading-5 text-muted-2"
              >
                {line}
              </li>
            ))}
          </ul>
        ) : notePreview ? (
          <p className="mt-1.5 truncate text-base font-medium leading-5 text-muted-2">
            {notePreview}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2 pr-1 sm:gap-3 sm:pr-2">
        {participants.length > 0 ? (
          <span
            className="flex items-center -space-x-2"
            aria-label={`참석자 ${participants.length}명`}
            title={participants.join(", ")}
          >
            {visibleParticipants.map((name, index) => (
              <span
                key={`${item.id}-${name}-${index}`}
                className="relative inline-flex"
                style={{ zIndex: index + 1 }}
              >
                <PersonAvatar name={name} size="sm" className="h-8 w-8" />
              </span>
            ))}
            {overflowCount > 0 ? (
              <span
                className="relative flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums text-muted"
                style={{ zIndex: visibleParticipants.length + 1 }}
              >
                +{overflowCount}
              </span>
            ) : null}
          </span>
        ) : null}

        <span
          className="inline-flex h-12 w-10 shrink-0 items-center justify-center text-foreground sm:w-12"
          aria-hidden
        >
          <ArrowRight className="h-5 w-5" strokeWidth={2.25} />
        </span>
      </div>
    </button>
  );
}

function KindPicker({
  open,
  onPick,
  onClose,
}: {
  open: boolean;
  onPick: (kind: ScheduleKind) => void;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="일정 유형 선택"
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-soft"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-semibold text-foreground">무엇을 추가할까요?</p>
        <p className="mt-1 text-base text-muted">
          일반 일정과 회의 일정을 같은 달력에서 관리합니다.
        </p>
        <div className="mt-4 grid gap-2">
          <button
            type="button"
            onClick={() => onPick("event")}
            className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl px-4 text-left transition-colors hover:bg-surface/70"
          >
            <CalendarDays className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.75} />
            <span>
              <span className="block text-base font-semibold text-foreground">
                일반 일정
              </span>
              <span className="block text-base text-muted">제목·시간·메모</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => onPick("meeting")}
            className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl px-4 text-left transition-colors hover:bg-surface/70"
          >
            <Mic className="h-5 w-5 shrink-0 text-foreground" strokeWidth={1.75} />
            <span>
              <span className="block text-base font-semibold text-foreground">
                회의 일정
              </span>
              <span className="block text-base text-muted">
                장소·참석·안건 포함
              </span>
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 flex h-12 w-full cursor-pointer items-center justify-center text-base font-semibold text-muted hover:text-foreground"
        >
          취소
        </button>
      </div>
    </div>
  );
}

/** 녹음 영역과 회의 기록 사이 — 워크스페이스별 예정/일정. */
export function MeetingMidPanel({
  searchQuery = "",
  onSearchChange,
  hideTitle = false,
  hideSearch = false,
}: {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  hideTitle?: boolean;
  hideSearch?: boolean;
}) {
  const { workspaceId, currentUser } = useAppContext();
  const { scenarioId, isLive } = usePageUxPreview();
  const profile = getWorkspaceProfile(workspaceId);
  const isMdUp = useMdUp();
  /** 1차: 개인 대시보드만 일정 관리 달력. */
  const useCalendarShell = workspaceId === "personal";
  const seed = useMemo(
    () => getUpcomingByWorkspace(workspaceId),
    [workspaceId],
  );
  const [items, setItems] = useState<UpcomingItem[]>(() =>
    seed.map((i) => normalizeUpcomingItem(i)),
  );
  const [selected, setSelected] = useState<UpcomingItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<"view" | "create">("view");
  const [selectedIso, setSelectedIso] = useState(() => seoulDateKey());
  const [monthView, setMonthView] = useState(false);
  const [kindPickerOpen, setKindPickerOpen] = useState(false);

  useEffect(() => {
    setItems(readStoredUpcoming(workspaceId, seed));
    setDetailOpen(false);
    setSelected(null);
    setDetailMode("view");
    setSelectedIso(seoulDateKey());
    setMonthView(false);
    setKindPickerOpen(false);
  }, [seed, workspaceId]);

  const sourceItems = useMemo(() => {
    if (scenarioId === "empty") return [];
    if (
      scenarioId === "full" ||
      scenarioId === "popup-upcoming" ||
      scenarioId === "popup-upcoming-create"
    ) {
      const base = seed.length > 0 ? seed : getUpcomingByWorkspace(workspaceId);
      if (base.length >= 8) return base.map((i) => normalizeUpcomingItem(i));
      const padded = [...base];
      for (let i = padded.length; i < 8; i += 1) {
        const src =
          base[i % Math.max(base.length, 1)] ??
          createUpcomingDraft(workspaceId, currentUser.name);
        padded.push({
          ...src,
          id: `ux-up-${i + 1}`,
          title: `${src.title} ${i + 1}`,
        });
      }
      const list =
        padded.length > 0
          ? padded
          : [createUpcomingDraft(workspaceId, currentUser.name)];
      return list.map((i) => normalizeUpcomingItem(i));
    }
    return items;
  }, [scenarioId, seed, items, workspaceId, currentUser.name]);

  useEffect(() => {
    if (
      scenarioId !== "popup-upcoming" &&
      scenarioId !== "popup-upcoming-create"
    ) {
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
      setSelected(
        createUpcomingDraft(workspaceId, currentUser.name, {
          kind: "meeting",
          dateIso: selectedIso,
        }),
      );
      setDetailOpen(true);
      return;
    }
    const target =
      sourceItems[0] ??
      createUpcomingDraft(workspaceId, currentUser.name, {
        dateIso: selectedIso,
      });
    setDetailMode("view");
    setSelected(target);
    setDetailOpen(true);
  }, [scenarioId, sourceItems, workspaceId, currentUser.name, selectedIso]);

  const markedIsos = useMemo(() => {
    const set = new Set<string>();
    for (const item of sourceItems) set.add(scheduleIsoOf(item));
    return set;
  }, [sourceItems]);

  const dayFiltered = useMemo(() => {
    if (!useCalendarShell) return sourceItems;
    return sourceItems.filter((item) => scheduleIsoOf(item) === selectedIso);
  }, [sourceItems, selectedIso, useCalendarShell]);

  const visibleItems = useMemo(() => {
    const pool = useCalendarShell ? dayFiltered : sourceItems;
    const filtered = !searchQuery.trim()
      ? pool
      : pool.filter((item) =>
          matchesSearchText(
            [
              item.title,
              item.location,
              item.organizer,
              ...item.participants,
              ...item.agenda,
              item.notes,
            ],
            searchQuery,
          ),
        );
    return [...filtered].sort(compareUpcoming);
  }, [sourceItems, dayFiltered, searchQuery, useCalendarShell]);

  const pageSize = upcomingPageSize(isMdUp);
  const [upcomingPage, setUpcomingPage] = useState(1);
  const upcomingTotalPages = Math.max(
    1,
    Math.ceil(visibleItems.length / pageSize),
  );
  const pagedUpcoming = useMemo(() => {
    const page = Math.min(upcomingPage, upcomingTotalPages);
    const start = (page - 1) * pageSize;
    return visibleItems.slice(start, start + pageSize);
  }, [visibleItems, upcomingPage, upcomingTotalPages, pageSize]);

  useEffect(() => {
    setUpcomingPage(1);
  }, [searchQuery, workspaceId, pageSize, selectedIso]);

  useEffect(() => {
    setUpcomingPage((p) => Math.min(p, upcomingTotalPages));
  }, [upcomingTotalPages]);

  const openDetail = useCallback((item: UpcomingItem) => {
    setDetailMode("view");
    setSelected(normalizeUpcomingItem(item));
    setDetailOpen(true);
  }, []);

  const openCreateWithKind = useCallback(
    (kind: ScheduleKind) => {
      setKindPickerOpen(false);
      setDetailMode("create");
      setSelected(
        createUpcomingDraft(workspaceId, currentUser.name, {
          kind,
          dateIso: useCalendarShell ? selectedIso : seoulDateKey(),
        }),
      );
      setDetailOpen(true);
    },
    [workspaceId, currentUser.name, selectedIso, useCalendarShell],
  );

  const openCreate = useCallback(() => {
    if (useCalendarShell) {
      setKindPickerOpen(true);
      return;
    }
    openCreateWithKind("meeting");
  }, [useCalendarShell, openCreateWithKind]);

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
      const normalized = normalizeUpcomingItem(next);
      if (!isLive) {
        setSelected(normalized);
        setDetailMode("view");
        return;
      }
      setItems((prev) => {
        const exists = prev.some((item) => item.id === normalized.id);
        const list = exists
          ? prev.map((item) =>
              item.id === normalized.id ? normalized : item,
            )
          : [...prev, normalized];
        writeStoredUpcoming(workspaceId, list);
        return list;
      });
      if (normalized.dateIso) setSelectedIso(normalized.dateIso);
      setSelected(normalized);
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

  const onMonthSelect = useCallback((iso: string) => {
    setSelectedIso(iso);
    setMonthView(false);
  }, []);

  return (
    <>
      <section className="outline-none">
        {hideTitle && hideSearch ? null : (
          <div className="space-y-0 pb-0 pt-1">
            {hideTitle ? null : (
              <h2 className="mb-3 text-xl font-bold tracking-tight text-foreground">
                {profile.upcomingTitle}
              </h2>
            )}
            {hideSearch ? null : (
              <MeetingSearch
                value={searchQuery}
                onChange={onSearchChange ?? (() => undefined)}
                placeholder={
                  useCalendarShell
                    ? "일정, 회의 검색"
                    : profile.searchPlaceholder
                }
                label={`${profile.upcomingTitle} 검색`}
                className="h-12 min-w-0 max-w-none flex-1 rounded-xl md:h-11"
              />
            )}
          </div>
        )}

        {useCalendarShell ? (
          <div className="mb-3 mt-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-base font-medium text-muted">
                {monthView
                  ? "월 달력"
                  : isoToUpcomingDateLabel(selectedIso)}
              </p>
              <button
                type="button"
                onClick={() => setMonthView((v) => !v)}
                className={cn(
                  "inline-flex h-12 min-w-12 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-full px-2.5 text-base font-semibold transition-colors",
                  monthView
                    ? "text-primary ring-2 ring-inset ring-primary"
                    : "text-muted hover:bg-surface/70 hover:text-foreground",
                )}
                aria-pressed={monthView}
                aria-label={monthView ? "일 보기로 돌아가기" : "월 달력 보기"}
                title={monthView ? "일 보기" : "월 달력"}
              >
                <CalendarRange className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            {monthView ? (
              <MonthDayCalendar
                selectedIso={selectedIso}
                markedIsos={markedIsos}
                onSelect={onMonthSelect}
              />
            ) : (
              <ScheduleDayStrip
                selectedIso={selectedIso}
                markedIsos={markedIsos}
                onSelect={setSelectedIso}
              />
            )}
          </div>
        ) : null}

        {visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
            <CalendarPlus
              className="h-12 w-12 text-muted-2"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-base text-muted">
              {searchQuery.trim()
                ? "검색 결과가 없습니다."
                : useCalendarShell
                  ? "이 날짜에 일정이 없습니다."
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
        ) : (
          <>
            <ul className="divide-y divide-border">
              {pagedUpcoming.map((item) => (
                <li key={item.id}>
                  <UpcomingListItem
                    item={item}
                    onOpen={openDetail}
                    hideDateColumn={useCalendarShell}
                  />
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={openCreate}
                  className={cn(
                    TOUCH_ROW,
                    "flex w-full cursor-pointer items-center justify-center gap-2 text-base font-semibold text-muted transition-colors hover:bg-surface/70 hover:text-foreground",
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
        )}
      </section>

      <KindPicker
        open={kindPickerOpen}
        onPick={openCreateWithKind}
        onClose={() => setKindPickerOpen(false)}
      />

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
