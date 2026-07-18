"use client";

import { ArrowRight, LayoutGrid, List, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { UpcomingDetailPanel } from "@/components/dashboard/upcoming-detail-panel";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-context";
import { formatDdayLabel } from "@/lib/meeting-date";
import {
  inferMeetingPlatform,
  MeetingPlatformIcon,
} from "@/lib/meeting-platform";
import {
  getUpcomingByWorkspace,
  type UpcomingItem,
} from "@/lib/workspace-data";
import { cn } from "@/lib/utils";

const LAYOUT_KEY = "faith.upcoming.layout";
const COMPACT_SLOT_COUNT = 4;
const COMPACT_CARD_HEIGHT = "h-[7.25rem]";
type UpcomingLayout = "compact" | "expanded";

function readLayout(): UpcomingLayout {
  if (typeof window === "undefined") return "compact";
  const saved = window.localStorage.getItem(LAYOUT_KEY);
  return saved === "expanded" ? "expanded" : "compact";
}

function platformOf(item: UpcomingItem) {
  return item.platform ?? inferMeetingPlatform(item.location);
}

function DetailArrow() {
  return (
    <ArrowRight
      className="h-5 w-5 shrink-0 text-foreground/45"
      strokeWidth={2.25}
      absoluteStrokeWidth
      aria-hidden
    />
  );
}

function ParticipantsLine({
  participants,
  className,
}: {
  participants: string[];
  className?: string;
}) {
  return (
    <p
      className={cn(
        "flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground/75",
        className,
      )}
    >
      <Users
        className="h-3.5 w-3.5 shrink-0 text-foreground/40"
        strokeWidth={1.5}
        absoluteStrokeWidth
        aria-hidden
      />
      <span className="truncate">
        {participants.slice(0, 3).join(", ")}
        {participants.length > 3 ? ` 외 ${participants.length - 3}명` : ""}
      </span>
    </p>
  );
}

function DdayBadge({ dateLabel }: { dateLabel: string }) {
  const dday = formatDdayLabel(dateLabel);
  if (!dday) return null;
  return (
    <span className="inline-flex items-center justify-center rounded-md border border-border px-1.5 py-0.5 text-[11px] font-medium tabular-nums tracking-tight text-muted">
      {dday}
    </span>
  );
}

function CompactCard({
  item,
  onOpen,
}: {
  item: UpcomingItem;
  onOpen: (item: UpcomingItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-3 text-left transition-colors hover:bg-surface-2",
        COMPACT_CARD_HEIGHT,
      )}
    >
      <div className="flex w-28 shrink-0 flex-col items-center gap-1">
        <MeetingPlatformIcon platform={platformOf(item)} size="md" />
        <p className="w-full text-center text-[10px] font-medium leading-snug text-muted">
          {item.location}
        </p>
        <DdayBadge dateLabel={item.dateLabel} />
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-snug text-foreground">
          {item.title}
        </p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-medium tabular-nums tracking-tight text-foreground">
          <span>{item.dateLabel}</span>
          <span className="text-base font-semibold">{item.timeLabel}</span>
          <span className="text-xs font-medium text-muted">{item.duration}</span>
        </p>
        <ParticipantsLine participants={item.participants} className="mt-1.5" />
      </div>

      <DetailArrow />
    </button>
  );
}

function CompactEmptySlot() {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center rounded-xl border border-dashed border-border bg-surface/60 px-3",
        COMPACT_CARD_HEIGHT,
      )}
      aria-hidden
    >
      <p className="text-xs font-medium text-muted">비어 있음</p>
    </div>
  );
}

function ExpandedCard({
  item,
  onOpen,
}: {
  item: UpcomingItem;
  onOpen: (item: UpcomingItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="flex h-full w-full flex-col rounded-2xl border border-border bg-surface p-4 text-left transition-colors hover:bg-surface-2"
    >
      <div className="flex items-start gap-3">
        <div className="flex w-32 shrink-0 flex-col items-center gap-1.5">
          <MeetingPlatformIcon platform={platformOf(item)} size="lg" />
          <p className="w-full text-center text-[11px] font-medium leading-snug text-muted">
            {item.location}
          </p>
          <DdayBadge dateLabel={item.dateLabel} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground">
              {item.title}
            </p>
            <DetailArrow />
          </div>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 tabular-nums tracking-tight">
            <span className="text-sm font-semibold text-foreground">
              {item.dateLabel}
            </span>
            <span className="text-xl font-bold text-foreground">
              {item.timeLabel}
            </span>
            <span className="text-sm font-medium text-muted">
              {item.duration}
            </span>
          </p>
          <ParticipantsLine
            participants={item.participants}
            className="mt-2"
          />
        </div>
      </div>

      <ul className="mt-3 space-y-1 border-t border-border pt-3">
        {item.agenda.slice(0, 2).map((line, index) => (
          <li
            key={`${item.id}-preview-${index}`}
            className="truncate text-xs font-medium text-foreground/80"
          >
            {index + 1}. {line}
          </li>
        ))}
        {item.agenda.length > 2 ? (
          <li className="text-xs font-medium text-muted">
            + 안건 {item.agenda.length - 2}개
          </li>
        ) : null}
      </ul>
    </button>
  );
}

/** 녹음 영역과 회의 기록 사이 — 워크스페이스별 예정 회의. */
export function MeetingMidPanel({
  searchQuery = "",
}: {
  searchQuery?: string;
}) {
  const { workspaceId } = useAppContext();
  const seed = useMemo(
    () => getUpcomingByWorkspace(workspaceId),
    [workspaceId],
  );
  const [items, setItems] = useState<UpcomingItem[]>(seed);
  const [layout, setLayout] = useState<UpcomingLayout>("compact");
  const [selected, setSelected] = useState<UpcomingItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    setItems(seed);
    setDetailOpen(false);
    setSelected(null);
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
    setSelected(item);
    setDetailOpen(true);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
  }, []);

  const saveItem = useCallback((next: UpcomingItem) => {
    setItems((prev) => prev.map((item) => (item.id === next.id ? next : item)));
    setSelected(next);
  }, []);

  return (
    <>
      <section className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-sm font-semibold text-foreground">예정 회의</h2>
            {visibleItems.length > 0 ? (
              <span className="inline-flex min-w-7 items-center justify-center rounded-lg bg-surface px-2 py-1 text-sm font-semibold tabular-nums text-foreground">
                {visibleItems.length}
              </span>
            ) : null}
          </div>

          <div
            className="flex items-center rounded-lg bg-surface p-0.5"
            role="group"
            aria-label="예정 회의 레이아웃"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 cursor-pointer text-foreground/55 hover:bg-transparent hover:text-foreground",
                layout === "compact" && "bg-card text-foreground shadow-soft",
              )}
              aria-pressed={layout === "compact"}
              aria-label="축소 보기"
              onClick={() => setLayoutPersist("compact")}
            >
              <List className="h-4 w-4" strokeWidth={1.75} />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                "h-8 w-8 cursor-pointer text-foreground/55 hover:bg-transparent hover:text-foreground",
                layout === "expanded" && "bg-card text-foreground shadow-soft",
              )}
              aria-pressed={layout === "expanded"}
              aria-label="확장 보기"
              onClick={() => setLayoutPersist("expanded")}
            >
              <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

        {layout === "compact" ? (
          <ul className="grid gap-2 sm:grid-cols-2">
            {Array.from({ length: COMPACT_SLOT_COUNT }, (_, index) => {
              const item = visibleItems[index];
              return (
                <li key={item?.id ?? `compact-slot-${index}`}>
                  {item ? (
                    <CompactCard item={item} onOpen={openDetail} />
                  ) : (
                    <CompactEmptySlot />
                  )}
                </li>
              );
            })}
          </ul>
        ) : visibleItems.length === 0 ? (
          <p className="rounded-xl bg-surface px-3 py-4 text-center text-sm text-muted">
            {searchQuery.trim()
              ? "검색 결과가 없습니다."
              : "예정된 회의가 없습니다."}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => (
              <li key={item.id} className="min-h-0">
                <ExpandedCard item={item} onOpen={openDetail} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <UpcomingDetailPanel
        item={selected}
        open={detailOpen}
        onClose={closeDetail}
        onSave={saveItem}
      />
    </>
  );
}
