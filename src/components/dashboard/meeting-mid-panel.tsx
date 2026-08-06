"use client";

import {
  ArrowRight,
  CalendarPlus,
  Plus,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { UpcomingDetailPanel } from "@/components/dashboard/upcoming-detail-panel";
import {
  RecordsPageNav,
  upcomingPageSize,
} from "@/components/dashboard/records-page-nav";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  daysUntilFromDateLabel,
  resolveUpcomingListDate,
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
  type UpcomingItem,
} from "@/lib/workspace-data";
import { getWorkspaceProfile } from "@/lib/workspaces";
import { TOUCH_ROW } from "@/lib/touch-target";
import { cn } from "@/lib/utils";

const UPCOMING_STORE_KEY = "faith.upcoming.items";
/** 일정 행 아바타: 데스크톱 최대 5, 좁은 폭 3 (제목 폭 확보). 초과는 +N */
const LIST_VISIBLE_PARTICIPANTS_WIDE = 5;
const LIST_VISIBLE_PARTICIPANTS_NARROW = 3;

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
    if (!Array.isArray(parsed)) return seed;
    // 시드 예시 참석자 갱신: 예전 1명(나)만 남은 동일 id는 새 시드로 맞춤
    const seedById = new Map(seed.map((item) => [item.id, item]));
    return parsed.map((item) => {
      const fromSeed = seedById.get(item.id);
      if (
        fromSeed &&
        fromSeed.participants.length > 1 &&
        item.participants.length === 1 &&
        item.participants[0] === "나"
      ) {
        return { ...item, participants: [...fromSeed.participants] };
      }
      return item;
    });
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

/** Faith `md` (768px) — 개인 일정 데스크톱/모바일 분기 */
const MD_UP_QUERY = "(min-width: 768px)";

function subscribeMdUp(onChange: () => void) {
  const mq = window.matchMedia(MD_UP_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function getMdUpSnapshot() {
  return window.matchMedia(MD_UP_QUERY).matches;
}

function getMdUpServerSnapshot() {
  return false;
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

/**
 * M3 list — 왼쪽 시간(세로 가운데) | 오른쪽 제목·안건
 */
function UpcomingListItem({
  item,
  onOpen,
}: {
  item: UpcomingItem;
  onOpen: (item: UpcomingItem) => void;
}) {
  const isMdUp = useSyncExternalStore(
    subscribeMdUp,
    getMdUpSnapshot,
    getMdUpServerSnapshot,
  );
  const { label: dateLabel, days } = resolveUpcomingListDate(item.dateLabel);
  const isToday = days === 0;
  const agendaPreview = item.agenda.slice(0, 2);
  const platform = item.platform ?? inferMeetingPlatform(item.location);
  const placeLabel =
    item.location.trim() || getMeetingPlatform(platform).label;
  const showPlaceIcon =
    platform !== "custom" || Boolean(item.location.trim());
  const participants = item.participants;
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
      <div className="w-[4.5rem] shrink-0 space-y-0.5 pl-3 sm:w-[5rem] sm:pl-4">
        <p className="text-base font-semibold leading-5 tracking-tight text-muted">
          {dateLabel}
        </p>
        <p className="text-lg font-semibold tabular-nums leading-6 tracking-tight text-foreground">
          {item.timeLabel}
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

/** 녹음 영역과 회의 기록 사이 — 워크스페이스별 예정 회의. */
export function MeetingMidPanel({
  searchQuery = "",
  onSearchChange,
  hideTitle = false,
  hideSearch = false,
}: {
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  /** 상위 탭이 제목을 그릴 때 섹션 h2 숨김 */
  hideTitle?: boolean;
  /** 상위(탭 행)에서 검색을 그릴 때 섹션 검색 숨김 */
  hideSearch?: boolean;
}) {
  const { workspaceId, currentUser } = useAppContext();
  const { scenarioId, isLive } = usePageUxPreview();
  const profile = getWorkspaceProfile(workspaceId);
  const isMdUp = useSyncExternalStore(
    subscribeMdUp,
    getMdUpSnapshot,
    getMdUpServerSnapshot,
  );
  const seed = useMemo(
    () => getUpcomingByWorkspace(workspaceId),
    [workspaceId],
  );
  const [items, setItems] = useState<UpcomingItem[]>(seed);
  const [selected, setSelected] = useState<UpcomingItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<"view" | "create">("view");

  useEffect(() => {
    setItems(readStoredUpcoming(workspaceId, seed));
    setDetailOpen(false);
    setSelected(null);
    setDetailMode("view");
  }, [seed, workspaceId]);

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
  }, [searchQuery, workspaceId, pageSize]);

  useEffect(() => {
    setUpcomingPage((p) => Math.min(p, upcomingTotalPages));
  }, [upcomingTotalPages]);

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
                placeholder={profile.searchPlaceholder}
                label={`${profile.upcomingTitle} 검색`}
                className="h-12 min-w-0 max-w-none flex-1 rounded-xl md:h-11"
              />
            )}
          </div>
        )}

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
                  <UpcomingListItem item={item} onOpen={openDetail} />
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
