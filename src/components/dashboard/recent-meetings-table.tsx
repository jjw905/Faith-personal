"use client";

import Link from "next/link";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MeetingCaptureIcon } from "@/components/meetings/meeting-capture-label";
import {
  deleteMeetingRecord,
  exportMeetingsListDownload,
} from "@/components/meetings/meeting-record-actions";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import { MeetingTopicTags } from "@/components/meetings/meeting-topic-tags";
import { MeetingSearch } from "@/components/dashboard/meeting-search";
import {
  RecordsPageNav,
  recordsPageSize,
} from "@/components/dashboard/records-page-nav";
import { DateRangeCalendar } from "@/components/meetings/date-range-calendar";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { useMdUp } from "@/hooks/use-md-up";
import { meetingCaptureLabel } from "@/lib/meeting-capture";
import type { MeetingExportFormat } from "@/lib/meeting-export";
import type { MaskStyle } from "@/lib/masking";
import {
  defaultRecordsRange,
  formatDottedDate,
  formatDottedRangeLabel,
  formatRecordsDayParts,
  formatRecordsRangeLabel,
  formatSeoulListLeading,
  isMeetingInDateRange,
  normalizeDateRange,
  parseFlexibleDateInput,
  recordsQuickRanges,
  seoulDateKey,
  shiftDateRange,
} from "@/lib/meeting-date";
import { meetingDisplayKeywords } from "@/lib/meeting-keywords";
import {
  friendlyProcessStageLabel,
  MEETING_PROCESS_LABEL,
} from "@/lib/meeting-process";
import { matchesSearchText } from "@/lib/search-text";
import { getWorkspaceProfile } from "@/lib/workspaces";
import type { Meeting } from "@/types/meeting";
import { TOUCH_ICON_BUTTON } from "@/lib/touch-target";
import { cn } from "@/lib/utils";

interface RecentMeetingsTableProps {
  meetings: Meeting[];
  onMeetingRemoved?: (meetingId: string) => void;
  /** 페이지 통합 검색. 없으면 섹션 로컬 검색. */
  searchQuery?: string;
  onSearchChange?: (value: string) => void;
  /** 일정 탭으로 나갈 때 선택 모드 해제 */
  onMobileBarChange?: (state: {
    onExitSelect: () => void;
  } | null) => void;
  /** 상위 탭이 제목을 그릴 때 섹션 h2 숨김 */
  hideTitle?: boolean;
  /** 상위(탭 행)에서 검색을 그릴 때 섹션 검색 숨김 */
  hideSearch?: boolean;
}

type SelectMode = "delete" | "download" | null;

function matchesMeetingSearch(meeting: Meeting, query: string) {
  return matchesSearchText(
    [
      meeting.title,
      ...meeting.participants.map((p) => p.name),
      ...meeting.tags,
      ...meeting.summaryTags,
      meetingCaptureLabel(meeting),
      meeting.duration,
    ],
    query,
  );
}

type SortKey = "date_desc" | "date_asc" | "title" | "duration";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "date_desc", label: "최신순" },
  { value: "date_asc", label: "오래된순" },
  { value: "title", label: "제목순" },
  { value: "duration", label: "소요시간순" },
];

/** 정렬 트리거. 선택·열림에 섹션면(bg-surface) 금지 — 색·굵기만. */
const SORT_TRIGGER_CLASS =
  "inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-xl px-2.5 text-base font-semibold text-muted transition-colors hover:bg-surface/70 hover:text-foreground md:min-h-9";

function formatDottedDraft(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}.${digits.slice(4)}`;
  return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6)}`;
}

function PeriodDateNav({
  fromIso,
  toIso,
  onRangeChange,
}: {
  fromIso: string;
  toIso: string;
  onRangeChange: (fromIso: string, toIso: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isMdUp = useMdUp();
  const [draftFrom, setDraftFrom] = useState(fromIso);
  const [draftTo, setDraftTo] = useState(toIso);
  const [draftFromText, setDraftFromText] = useState(() =>
    formatDottedDate(fromIso),
  );
  const [draftToText, setDraftToText] = useState(() => formatDottedDate(toIso));
  const [draftError, setDraftError] = useState<string | null>(null);
  const presets = useMemo(() => recordsQuickRanges(), []);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(fromIso);
    setDraftTo(toIso);
    setDraftFromText(formatDottedDate(fromIso));
    setDraftToText(formatDottedDate(toIso));
    setDraftError(null);
  }, [open, fromIso, toIso]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const headerLabel = isMdUp
    ? formatRecordsRangeLabel(fromIso, toIso)
    : formatDottedRangeLabel(fromIso, toIso);

  function commitRange(nextFrom: string, nextTo: string) {
    const next = normalizeDateRange(nextFrom, nextTo);
    onRangeChange(next.fromIso, next.toIso);
    setDraftError(null);
    setOpen(false);
  }

  function applyDraftText() {
    const nextFrom = parseFlexibleDateInput(draftFromText);
    const nextTo = parseFlexibleDateInput(draftToText);
    if (!nextFrom || !nextTo) {
      setDraftError("날짜를 2027.09.09 형식으로 입력해 주세요.");
      return;
    }
    commitRange(nextFrom, nextTo);
  }

  function applyPreset(range: { fromIso: string; toIso: string }) {
    setDraftFrom(range.fromIso);
    setDraftTo(range.toIso);
    setDraftFromText(formatDottedDate(range.fromIso));
    setDraftToText(formatDottedDate(range.toIso));
    setDraftError(null);
    if (!isMdUp) commitRange(range.fromIso, range.toIso);
  }

  return (
    <div ref={rootRef} className="relative flex min-w-0 max-w-full items-center justify-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          TOUCH_ICON_BUTTON,
          "shrink-0 cursor-pointer text-muted hover:bg-card hover:text-foreground",
        )}
        aria-label="이전 기간"
        onClick={() => {
          const next = shiftDateRange(fromIso, toIso, -1);
          onRangeChange(next.fromIso, next.toIso);
        }}
      >
        <ChevronLeft strokeWidth={1.75} />
      </Button>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="기간 조회"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "min-h-12 min-w-0 max-w-[14rem] truncate rounded-lg px-1.5 py-2 text-center text-base font-semibold tabular-nums text-foreground transition-colors hover:bg-card sm:max-w-[18rem] sm:px-2 md:min-h-0 md:max-w-[22rem]",
          open && "bg-card",
        )}
      >
        {headerLabel}
      </button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          TOUCH_ICON_BUTTON,
          "shrink-0 cursor-pointer text-muted hover:bg-card hover:text-foreground",
        )}
        aria-label="다음 기간"
        onClick={() => {
          const next = shiftDateRange(fromIso, toIso, 1);
          onRangeChange(next.fromIso, next.toIso);
        }}
      >
        <ChevronRight strokeWidth={1.75} />
      </Button>

      {open ? (
        <div
          role="dialog"
          aria-label="기간 조회"
          className="absolute left-1/2 top-[calc(100%+0.5rem)] z-40 w-[min(100vw-2rem,24rem)] -translate-x-1/2 rounded-2xl border border-border bg-card p-3 shadow-[0_12px_28px_rgba(17,24,46,0.12)] md:w-[24rem]"
        >
          {isMdUp ? (
            <DateRangeCalendar
              from={draftFrom}
              to={draftTo}
              onChange={(nextFrom, nextTo) => {
                const next = normalizeDateRange(nextFrom, nextTo);
                setDraftFrom(next.fromIso);
                setDraftTo(next.toIso);
              }}
              onComplete={(nextFrom, nextTo) => {
                commitRange(nextFrom, nextTo);
              }}
            />
          ) : (
            <div className="space-y-3">
              <div
                className="flex flex-wrap items-center justify-center gap-1.5"
                role="group"
                aria-label="빠른 선택"
              >
                {(
                  [
                    { id: "today", label: "오늘", range: presets.today },
                    { id: "week", label: "이번 주", range: presets.week },
                    { id: "month", label: "이번 달", range: presets.month },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => applyPreset(item.range)}
                    className="inline-flex min-h-12 items-center rounded-full px-3 text-base font-semibold text-muted transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <label className="sr-only" htmlFor="records-range-from">
                  시작일
                </label>
                <input
                  id="records-range-from"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="2027.09.09"
                  value={draftFromText}
                  onChange={(e) => {
                    setDraftFromText(formatDottedDraft(e.target.value));
                    setDraftError(null);
                  }}
                  className="h-14 min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 text-center text-lg font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
                <span className="shrink-0 text-base text-muted" aria-hidden>
                  ~
                </span>
                <label className="sr-only" htmlFor="records-range-to">
                  종료일
                </label>
                <input
                  id="records-range-to"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="2028.09.10"
                  value={draftToText}
                  onChange={(e) => {
                    setDraftToText(formatDottedDraft(e.target.value));
                    setDraftError(null);
                  }}
                  className="h-14 min-w-0 flex-1 rounded-xl border border-border bg-transparent px-3 text-center text-lg font-semibold tabular-nums text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                />
              </div>
              {draftError ? (
                <p role="alert" className="text-center text-base text-muted">
                  {draftError}
                </p>
              ) : null}
              <Button
                type="button"
                className="h-12 w-full text-base"
                onClick={applyDraftText}
              >
                조회
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * M3 List 슬롯
 * - overline: 날짜·시간
 * - headline: 제목
 * - supporting: 기록 방식, 키워드
 * - disclosure: >
 * 참고: m3.material.io/components/lists
 */
const KEYWORD_VISIBLE = 3;

function parseDurationMinutes(duration: string) {
  const hour = duration.match(/(\d+)\s*시간/);
  const min = duration.match(/(\d+)\s*분/);
  return (hour ? Number(hour[1]) * 60 : 0) + (min ? Number(min[1]) : 0);
}

function compareProcessFast(a: Meeting, b: Meeting) {
  const aw = a.process?.waiting ? 1 : 0;
  const bw = b.process?.waiting ? 1 : 0;
  if (aw !== bw) return aw - bw;
  if (aw === 1) {
    return (a.process?.queueAhead ?? 99) - (b.process?.queueAhead ?? 99);
  }
  return (b.process?.progressPercent ?? 0) - (a.process?.progressPercent ?? 0);
}

function sortMeetings(list: Meeting[], sortKey: SortKey) {
  const active = list.filter((m) => m.status === "in_progress");
  const rest = list.filter((m) => m.status !== "in_progress");
  active.sort(compareProcessFast);
  rest.sort((a, b) => {
    if (sortKey === "date_desc") {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    }
    if (sortKey === "date_asc") {
      return new Date(a.date).getTime() - new Date(b.date).getTime();
    }
    if (sortKey === "title") {
      return a.title.localeCompare(b.title, "ko");
    }
    return parseDurationMinutes(b.duration) - parseDurationMinutes(a.duration);
  });
  return [...active, ...rest];
}

function MeetingKeywords({ meeting }: { meeting: Meeting }) {
  const tags = meetingDisplayKeywords(meeting, KEYWORD_VISIBLE + 2);

  if (tags.length === 0) return null;

  const visible = tags.slice(0, KEYWORD_VISIBLE);
  const overflow = tags.length - visible.length;

  return <MeetingTopicTags tags={visible} overflow={overflow} />;
}

/** 기록 목록: 서울 캘린더 일 기준 그룹 (오늘·어제·내일은 상대만, 그 외 절대 날짜). */
function groupRecordsByDay(
  items: Meeting[],
): {
  key: string;
  relative: string | null;
  absolute: string;
  items: Meeting[];
}[] {
  const groups: {
    key: string;
    relative: string | null;
    absolute: string;
    items: Meeting[];
  }[] = [];
  for (const item of items) {
    const key = seoulDateKey(item.date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.items.push(item);
    } else {
      const { relative, absolute } = formatRecordsDayParts(item.date);
      groups.push({
        key,
        relative,
        absolute,
        items: [item],
      });
    }
  }
  return groups;
}

export function SortControl({
  value,
  onChange,
  forceOpen,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
  /** 디자인 랩: 목록 고정 오픈 */
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(Boolean(forceOpen));
  const rootRef = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((o) => o.value === value)?.label ?? "최신순";
  const listOpen = forceOpen || open;

  useEffect(() => {
    if (!listOpen || forceOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [listOpen, forceOpen]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={listOpen}
        aria-haspopup="listbox"
        aria-label={`정렬, ${current}`}
        onClick={(e) => {
          e.stopPropagation();
          if (forceOpen) return;
          setOpen((v) => !v);
        }}
        className={cn(
          SORT_TRIGGER_CLASS,
          listOpen && "text-foreground",
        )}
      >
        <ArrowDownWideNarrow className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        {current}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted transition-transform",
            listOpen && "rotate-180 text-foreground",
          )}
          strokeWidth={1.75}
        />
      </button>

      {listOpen ? (
        <ul
          role="listbox"
          aria-label="정렬"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-40 max-h-[min(50vh,18rem)] min-w-[10.5rem] overflow-y-auto overflow-x-hidden rounded-2xl bg-card py-1.5 shadow-[0_12px_28px_rgba(17,24,46,0.12)] ring-1 ring-border"
        >
          {SORT_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(option.value);
                    if (!forceOpen) setOpen(false);
                  }}
                  className={cn(
                    "flex min-h-12 w-full cursor-pointer items-center gap-3 px-3.5 text-left text-base transition-colors md:min-h-11",
                    selected
                      ? "font-semibold text-foreground"
                      : "font-medium text-muted hover:bg-surface/70 hover:text-foreground",
                  )}
                >
                  <span className="min-w-0 flex-1">{option.label}</span>
                  {selected ? (
                    <Check
                      className="h-4 w-4 shrink-0 text-primary"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  ) : (
                    <span className="h-4 w-4 shrink-0" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function RecentMeetingsTable({
  meetings,
  onMeetingRemoved,
  searchQuery: searchQueryProp,
  onSearchChange,
  onMobileBarChange,
  hideTitle = false,
  hideSearch = false,
}: RecentMeetingsTableProps) {
  const { workspaceId } = useAppContext();
  const { scenarioId, isLive } = usePageUxPreview();
  const profile = getWorkspaceProfile(workspaceId);
  const isMdUp = useMdUp();
  const pageSize = recordsPageSize(isMdUp);
  const [localSearch, setLocalSearch] = useState("");
  const recordSearch = searchQueryProp ?? localSearch;
  const setRecordSearch = onSearchChange ?? setLocalSearch;
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [rangeFrom, setRangeFrom] = useState(() => defaultRecordsRange().fromIso);
  const [rangeTo, setRangeTo] = useState(() => {
    // from과 같은 주 구간으로 맞춤. 초기 렌더에서 Date 흔들림을 피하려고 동일 헬퍼 재사용.
    return defaultRecordsRange().toIso;
  });
  const [selectMode, setSelectMode] = useState<SelectMode>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionConfirmOpen, setActionConfirmOpen] = useState(false);
  const [recordsPage, setRecordsPage] = useState(1);

  const activeQuery = recordSearch.trim();

  const filtered = useMemo(() => {
    const records = meetings.filter((m) => m.status !== "scheduled");
    if (
      scenarioId === "popup-records-delete" ||
      scenarioId === "popup-records-download"
    ) {
      return records;
    }
    if (activeQuery) {
      return records.filter((m) => matchesMeetingSearch(m, activeQuery));
    }
    // 분석 중은 기간과 무관하게 항상 위에 둔다.
    return records.filter(
      (m) =>
        m.status === "in_progress" ||
        isMeetingInDateRange(m.date, rangeFrom, rangeTo),
    );
  }, [meetings, rangeFrom, rangeTo, activeQuery, scenarioId]);

  const sorted = useMemo(
    () => sortMeetings(filtered, sortKey),
    [filtered, sortKey],
  );

  const recordsTotalPages = Math.max(
    1,
    Math.ceil(sorted.length / pageSize),
  );
  const pagedRecords = useMemo(() => {
    const page = Math.min(recordsPage, recordsTotalPages);
    const start = (page - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, recordsPage, recordsTotalPages, pageSize]);

  const groupedRecords = useMemo(
    () => groupRecordsByDay(pagedRecords),
    [pagedRecords],
  );

  useEffect(() => {
    setRecordsPage(1);
  }, [workspaceId, rangeFrom, rangeTo, activeQuery, sortKey, pageSize]);

  useEffect(() => {
    setRecordsPage((p) => Math.min(p, recordsTotalPages));
  }, [recordsTotalPages]);

  useEffect(() => {
    if (
      scenarioId === "popup-records-delete" ||
      scenarioId === "popup-records-download"
    ) {
      return;
    }
    setSelected(new Set());
    setSelectMode(null);
    setActionConfirmOpen(false);
  }, [workspaceId, rangeFrom, rangeTo, activeQuery, scenarioId]);

  useEffect(() => {
    if (searchQueryProp === undefined) setLocalSearch("");
  }, [workspaceId, searchQueryProp]);

  useEffect(() => {
    if (scenarioId === "popup-records-delete") {
      setSelectMode("delete");
      const ids = sorted.slice(0, Math.min(2, sorted.length)).map((m) => m.id);
      setSelected(new Set(ids));
      setActionConfirmOpen(ids.length > 0);
      return;
    }
    if (scenarioId === "popup-records-download") {
      setSelectMode("download");
      const ids = sorted.slice(0, Math.min(2, sorted.length)).map((m) => m.id);
      setSelected(new Set(ids));
      setActionConfirmOpen(ids.length > 0);
      return;
    }
    if (
      scenarioId === "live" ||
      scenarioId === "empty" ||
      scenarioId === "full"
    ) {
      setSelectMode(null);
      setSelected(new Set());
      setActionConfirmOpen(false);
    }
  }, [scenarioId, sorted]);

  function enterMode(mode: Exclude<SelectMode, null>) {
    setSelectMode(mode);
    setSelected(new Set());
  }

  function exitMode() {
    setSelectMode(null);
    setSelected(new Set());
    setActionConfirmOpen(false);
  }

  function toggleId(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === sorted.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(sorted.map((m) => m.id)));
  }

  const selectedMeetings = useMemo(
    () => sorted.filter((m) => selected.has(m.id)),
    [sorted, selected],
  );

  function runSelectionAction() {
    if (busy || selected.size === 0 || !selectMode) return;
    setActionConfirmOpen(true);
  }

  async function confirmSelectionAction(
    format?: MeetingExportFormat,
    maskStyle: MaskStyle = "partial",
  ) {
    if (busy || selectedMeetings.length === 0 || !selectMode) return;
    setActionConfirmOpen(false);
    setBusy(true);
    try {
      if (!isLive) {
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        exitMode();
        return;
      }
      if (selectMode === "download") {
        await exportMeetingsListDownload(
          selectedMeetings,
          format ?? "txt",
          maskStyle,
        );
        exitMode();
        return;
      }
      for (const m of selectedMeetings) {
        await deleteMeetingRecord(m);
        onMeetingRemoved?.(m.id);
      }
      exitMode();
    } catch {
      // keep selection for retry
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!onMobileBarChange) return;
    onMobileBarChange({
      onExitSelect: exitMode,
    });
    return () => onMobileBarChange(null);
  }, [onMobileBarChange, selectMode]);

  const sortControl = !selectMode ? (
    <SortControl
      value={sortKey}
      onChange={setSortKey}
      forceOpen={scenarioId === "popup-sort"}
    />
  ) : null;

  const batchActions = (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      {selectMode ? (
        <>
          <Button
            type="button"
            variant="ghost"
            className={cn(
              TOUCH_ICON_BUTTON,
              "min-w-0 cursor-pointer px-3 text-base font-semibold md:h-9 md:min-h-9 md:min-w-0 md:px-2.5 md:text-xs",
            )}
            onClick={toggleAll}
            disabled={sorted.length === 0 || busy}
          >
            {selected.size === sorted.length && sorted.length > 0
              ? "선택 해제"
              : "전체"}
          </Button>
          <Button
            type="button"
            className={cn(
              "h-12 min-w-12 cursor-pointer gap-1.5 px-3 text-base md:h-9 md:min-w-0 md:px-3 md:text-sm",
              selectMode === "delete" &&
                "bg-foreground text-background hover:bg-foreground/90",
            )}
            disabled={selected.size === 0 || busy}
            onClick={() => void runSelectionAction()}
          >
            {selectMode === "delete" ? (
              <Trash2 className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />
            ) : (
              <Download className="h-5 w-5 md:h-4 md:w-4" strokeWidth={1.75} />
            )}
            <span className="tabular-nums">{selected.size}</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(TOUCH_ICON_BUTTON, "cursor-pointer")}
            aria-label="선택 취소"
            disabled={busy}
            onClick={exitMode}
          >
            <X strokeWidth={1.75} />
          </Button>
        </>
      ) : (
        <>
          {sortControl}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              TOUCH_ICON_BUTTON,
              "cursor-pointer text-muted hover:bg-surface/70 hover:text-foreground",
            )}
            aria-label="다운로드"
            disabled={sorted.length === 0}
            onClick={() => enterMode("download")}
          >
            <Download strokeWidth={1.75} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              TOUCH_ICON_BUTTON,
              "cursor-pointer text-muted hover:bg-surface/70 hover:text-foreground",
            )}
            aria-label="삭제"
            disabled={sorted.length === 0}
            onClick={() => enterMode("delete")}
          >
            <Trash2 strokeWidth={1.75} />
          </Button>
        </>
      )}
    </div>
  );

  const titleBlock = hideTitle ? null : (
    <div className="flex min-w-0 items-center gap-2.5">
      <h2 className="text-xl font-bold tracking-tight text-foreground">
        {profile.recordsTitle}
      </h2>
    </div>
  );

  /** 기간 이동 + 날짜 클릭 구간 조회. 주간/배경면 없음. */
  const periodCluster =
    selectMode ? (
      <p className="text-center text-base font-medium text-muted">
        {selectMode === "delete" ? "삭제할 기록 선택" : "받을 기록 선택"}
      </p>
    ) : activeQuery ? (
      <p className="text-center text-base font-medium text-muted">검색 결과</p>
    ) : (
      <div className="inline-flex max-w-full items-center justify-center" role="group" aria-label="기간">
        <PeriodDateNav
          fromIso={rangeFrom}
          toIso={rangeTo}
          onRangeChange={(from, to) => {
            setRangeFrom(from);
            setRangeTo(to);
          }}
        />
      </div>
    );

  return (
    <section className="outline-none">
      <div className="space-y-3 pb-0 pt-1">
        {titleBlock ? (
          <div className="flex min-w-0 items-center justify-between gap-3">
            {titleBlock}
          </div>
        ) : null}

        {!selectMode && !hideSearch ? (
          <MeetingSearch
            value={recordSearch}
            onChange={setRecordSearch}
            placeholder={profile.searchPlaceholder}
            label={`${profile.recordsTitle} 검색`}
            className="h-12 max-w-none rounded-xl sm:h-11"
          />
        ) : null}

        {/* 모바일: 기간 → 정렬/액션 세로. 데스크톱: 3열(좌 스페이서·기간·액션)로 겹침 방지 */}
        <div className="flex flex-col gap-2 md:grid md:min-h-9 md:grid-cols-[11.5rem_minmax(0,1fr)_11.5rem] md:items-center md:gap-1.5">
          <div className="hidden md:block" aria-hidden />
          <div className="flex min-h-12 min-w-0 items-center justify-center md:min-h-0">
            {periodCluster}
          </div>
          <div className="flex items-center justify-end">{batchActions}</div>
        </div>
      </div>

      <div>
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-base text-muted">
            {activeQuery ? "검색 결과가 없습니다." : profile.recordsEmpty}
          </p>
        ) : (
            <>
              <div>
                {groupedRecords.map((group) => (
                  <div key={group.key}>
                    <p className="px-0 pb-2 pt-5 first:pt-3">
                      {group.relative ? (
                        <span className="text-base font-semibold tracking-tight text-foreground">
                          {group.relative}
                        </span>
                      ) : (
                        <span className="text-base font-semibold tracking-tight text-muted">
                          {group.absolute}
                        </span>
                      )}
                    </p>
                    <ul className="divide-y divide-border">
                      {group.items.map((meeting) => (
                        <li key={meeting.id}>
                          <MeetingRecordListItem
                            meeting={meeting}
                            selecting={Boolean(selectMode)}
                            checked={selected.has(meeting.id)}
                            onToggle={() => toggleId(meeting.id)}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <RecordsPageNav
                page={Math.min(recordsPage, recordsTotalPages)}
                totalPages={recordsTotalPages}
                onPageChange={setRecordsPage}
              />
            </>
        )}
      </div>

      <MeetingRecordsActionDialog
        open={
          actionConfirmOpen ||
          scenarioId === "popup-records-delete" ||
          scenarioId === "popup-records-download"
        }
        mode={
          scenarioId === "popup-records-download" || selectMode === "download"
            ? "download"
            : "delete"
        }
        meetings={
          selectedMeetings.length > 0
            ? selectedMeetings
            : sorted.slice(0, 2)
        }
        busy={busy}
        onCancel={() => {
          if (
            scenarioId === "popup-records-delete" ||
            scenarioId === "popup-records-download"
          ) {
            return;
          }
          setActionConfirmOpen(false);
        }}
        onConfirm={(format, maskStyle) => {
          void confirmSelectionAction(format, maskStyle);
        }}
      />
    </section>
  );
}

function MeetingRecordListItem({
  meeting,
  selecting,
  checked,
  onToggle,
}: {
  meeting: Meeting;
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const { time } = formatSeoulListLeading(meeting.date);
  const href = `/meetings/${meeting.id}`;
  const process = meeting.status === "in_progress" ? meeting.process : undefined;
  const waiting = Boolean(process?.waiting);
  const percent = process?.progressPercent ?? 0;
  const stage = process
    ? friendlyProcessStageLabel(
        process.stageLabel?.trim() || MEETING_PROCESS_LABEL[process.phase],
      )
    : null;
  const queueHint =
    waiting && typeof process?.queueAhead === "number"
      ? process.queueAhead <= 0
        ? "곧 시작"
        : `앞 ${process.queueAhead}건`
      : null;

  return (
    <div
      className={cn(
        "group relative flex min-h-[5.5rem] items-center gap-3 py-6 transition-colors hover:bg-surface/70 sm:min-h-[6.25rem] sm:gap-4 sm:py-8",
        selecting && checked && "bg-primary-soft/40",
      )}
    >
      {selecting ? (
        <button
          type="button"
          className="absolute inset-0 z-0"
          aria-label={`${meeting.title} 선택`}
          onClick={onToggle}
        />
      ) : (
        <Link
          href={href}
          className="absolute inset-0 z-0"
          aria-label={
            process
              ? `${meeting.title}, ${waiting ? "대기 중" : `진행 ${percent}퍼센트`}`
              : `${meeting.title} 보기`
          }
        />
      )}

      {selecting ? (
        <span
          className={cn(
            "relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border-strong bg-card",
          )}
          aria-hidden
        >
          {checked ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : null}
        </span>
      ) : null}

      {/* leading: 시간만 (날짜는 그룹 헤더) */}
      <div className="relative z-10 w-[4.75rem] shrink-0 pointer-events-none sm:w-[5.25rem]">
        <p className="text-lg tabular-nums leading-6 tracking-tight text-foreground">
          {time}
        </p>
      </div>

      <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
        {process ? (
          <div className="flex min-w-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p
                className="min-w-0 truncate text-lg font-semibold leading-none tracking-tight text-foreground group-hover:text-primary"
                title={meeting.title}
              >
                {meeting.title}
              </p>
              <p className="mt-2 truncate text-base text-muted">
                {[stage, queueHint].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <MeetingCaptureIcon
              meeting={meeting}
              size="lg"
              className="shrink-0"
            />
            <div className="min-w-0 flex-1">
              <p
                className="min-w-0 truncate text-lg font-semibold leading-none tracking-tight text-foreground group-hover:text-primary"
                title={meeting.title}
              >
                {meeting.title}
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <MeetingKeywords meeting={meeting} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 pointer-events-none flex shrink-0 items-center self-center">
        {process ? (
          <span
            className={cn(
              "min-w-[2.75rem] text-right text-base font-semibold tabular-nums tracking-tight",
              waiting ? "text-muted" : "text-primary",
            )}
            aria-hidden
          >
            {waiting ? "대기" : `${percent}%`}
          </span>
        ) : !selecting ? (
          <span
            className="inline-flex h-12 w-12 items-center justify-center text-foreground opacity-0 transition-opacity group-hover:opacity-100 max-md:hidden"
            aria-hidden
          >
            <ArrowRight className="h-5 w-5" strokeWidth={2.25} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
