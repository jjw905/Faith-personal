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

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { GroupedParticipantsList } from "@/components/meetings/meeting-participants";
import { MeetingCaptureOverline } from "@/components/meetings/meeting-capture-label";
import {
  deleteMeetingRecord,
  exportMeetingsListDownload,
} from "@/components/meetings/meeting-record-actions";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { meetingCaptureLabel } from "@/lib/meeting-capture";
import {
  formatRecentDaysLabel,
  formatSeoulListLeading,
  getPeriodRange,
  isCurrentPeriod,
  isMeetingInPeriod,
  shiftPeriodAnchor,
  type PeriodUnit,
} from "@/lib/meeting-date";
import { meetingDisplayKeywords } from "@/lib/meeting-keywords";
import { matchesSearchText } from "@/lib/search-text";
import { getWorkspaceProfile } from "@/lib/workspaces";
import type { Meeting, Participant } from "@/types/meeting";
import { cn } from "@/lib/utils";

interface RecentMeetingsTableProps {
  meetings: Meeting[];
  onMeetingRemoved?: (meetingId: string) => void;
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

const PERIOD_OPTIONS: { value: PeriodUnit; label: string }[] = [
  { value: "week", label: "주" },
  { value: "month", label: "월" },
  { value: "year", label: "년" },
];

const VISIBLE_AVATARS = 3;

/**
 * M3 List 3줄 템플릿
 * - leading: 날짜/시간
 * - overline: 기록 방식(칩)
 * - headline: 제목
 * - supporting: 키워드, 참석자
 * - trailing: 소요시간, 내보내기
 * 참고: m3.material.io/components/lists, m3.material.io/components/chips
 */
const KEYWORD_VISIBLE = 3;

function parseDurationMinutes(duration: string) {
  const hour = duration.match(/(\d+)\s*시간/);
  const min = duration.match(/(\d+)\s*분/);
  return (hour ? Number(hour[1]) * 60 : 0) + (min ? Number(min[1]) : 0);
}

function sortMeetings(list: Meeting[], sortKey: SortKey) {
  const next = [...list];
  next.sort((a, b) => {
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
  return next;
}

function MeetingKeywords({ meeting }: { meeting: Meeting }) {
  const tags = meetingDisplayKeywords(meeting, KEYWORD_VISIBLE + 2);

  if (tags.length === 0) return null;

  const visible = tags.slice(0, KEYWORD_VISIBLE);
  const overflow = tags.length - visible.length;
  const full = tags.join(", ");

  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1.5"
      title={full}
    >
      {visible.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full rounded-md bg-surface px-2.5 py-1 text-base font-medium leading-5 text-muted"
        >
          {tag}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="inline-flex shrink-0 text-base font-medium leading-5 text-muted-2">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}


function PeriodUnitControl({
  unit,
  onUnitChange,
}: {
  unit: PeriodUnit;
  onUnitChange: (unit: PeriodUnit) => void;
}) {
  return (
    <div
      className="flex items-center rounded-lg bg-surface p-0.5"
      role="group"
      aria-label="기간 단위"
    >
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={unit === option.value}
          onClick={() => onUnitChange(option.value)}
          className={cn(
            "h-9 min-w-9 cursor-pointer rounded-md px-2.5 text-base font-semibold transition-colors",
            unit === option.value
              ? "bg-card text-foreground shadow-soft"
              : "text-muted hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function PeriodDateNav({
  unit,
  anchor,
  onAnchorChange,
}: {
  unit: PeriodUnit;
  anchor: Date;
  onAnchorChange: (anchor: Date) => void;
}) {
  const range = getPeriodRange(anchor, unit);
  const current = isCurrentPeriod(anchor, unit);

  return (
    <div className="flex w-max max-w-full items-center justify-center gap-0.5 sm:gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 cursor-pointer text-muted hover:bg-surface-2 hover:text-foreground"
        aria-label="이전 기간"
        onClick={() => onAnchorChange(shiftPeriodAnchor(anchor, unit, -1))}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
      </Button>
      <p className="min-w-0 truncate px-1 text-center text-base font-medium tabular-nums text-foreground sm:px-1.5">
        {range.label}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 cursor-pointer text-muted hover:bg-surface-2 hover:text-foreground"
        aria-label="다음 기간"
        onClick={() => onAnchorChange(shiftPeriodAnchor(anchor, unit, 1))}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
      </Button>
      {!current ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-1 h-8 cursor-pointer px-2.5 text-xs"
          onClick={() => onAnchorChange(new Date())}
        >
          오늘
        </Button>
      ) : null}
    </div>
  );
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
        onClick={(e) => {
          e.stopPropagation();
          if (forceOpen) return;
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-surface px-3 text-base font-semibold text-foreground transition-colors",
          "hover:bg-surface-2",
          listOpen && "bg-card text-foreground shadow-soft ring-1 ring-border",
        )}
      >
        <ArrowDownWideNarrow className="h-3.5 w-3.5 text-muted" />
        {current}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted transition-transform",
            listOpen && "rotate-180",
          )}
        />
      </button>

      {listOpen ? (
        <ul
          role="listbox"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-40 min-w-[9.5rem] overflow-hidden rounded-xl bg-card py-1 shadow-[0_12px_28px_rgba(17,24,46,0.12)]"
        >
          {SORT_OPTIONS.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(option.value);
                  if (!forceOpen) setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer px-3 py-2 text-left text-base font-medium transition-colors",
                  option.value === value
                    ? "bg-primary-soft text-primary"
                    : "text-foreground hover:bg-surface",
                )}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ParticipantsPopup({
  participants,
  open,
  onClose,
  contained,
}: {
  participants: Participant[];
  open: boolean;
  onClose: () => void;
  /** 디자인 랩: 프리뷰 영역 안에만 표시 */
  contained?: boolean;
}) {
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

  if (!open) return null;

  return (
    <>
      <div
        className={cn(
          "bg-black/40",
          contained ? "absolute inset-0 z-10" : "fixed inset-0 z-50",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="참석자"
        className={cn(
          "flex max-h-[min(32rem,85vh)] w-[min(32rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl bg-card shadow-[0_20px_50px_rgba(17,24,46,0.18)]",
          contained
            ? "absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
            : "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2",
        )}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-foreground">참석자</h2>
            <p className="mt-0.5 text-xs font-medium text-muted-2">
              {participants.length}명
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0 cursor-pointer text-muted hover:bg-surface-2"
            onClick={onClose}
            aria-label="참석자 닫기"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <GroupedParticipantsList participants={participants} />
        </div>
      </div>
    </>
  );
}

function ParticipantsCell({
  participants,
  showCount = true,
}: {
  participants: Participant[];
  showCount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const visible = participants.slice(0, VISIBLE_AVATARS);
  const overflow = Math.max(0, participants.length - VISIBLE_AVATARS);
  const label =
    participants.length === 0
      ? "참석자 없음"
      : participants.map((p) => p.name).join(", ");

  if (participants.length === 0) {
    return <span className="text-base text-muted-2">참석자 없음</span>;
  }

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`참석자 ${participants.length}명: ${label}`}
        title={label}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full py-0.5 pr-1.5 transition-colors",
          "hover:bg-surface-2",
          open && "bg-surface-2",
        )}
      >
        <span className="flex shrink-0 whitespace-nowrap -space-x-2">
          {visible.map((participant, index) => (
            <Avatar
              key={participant.id}
              className="h-9 w-9 border-2 border-card"
              style={{ zIndex: index + 1 }}
            >
              <AvatarFallback
                className={`${participant.color} text-xs text-white/95`}
              >
                {participant.initials}
              </AvatarFallback>
            </Avatar>
          ))}
          {overflow > 0 ? (
            <span
              className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-card bg-surface-2 text-xs font-semibold text-muted"
              style={{ zIndex: visible.length + 1 }}
            >
              +{overflow}
            </span>
          ) : null}
        </span>
        {showCount ? (
          <span className="hidden text-base font-medium text-muted sm:inline">
            {participants.length}명
          </span>
        ) : null}
      </button>
      <ParticipantsPopup
        participants={participants}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function RecentMeetingsTable({
  meetings,
  onMeetingRemoved,
}: RecentMeetingsTableProps) {
  const { workspaceId } = useAppContext();
  const { scenarioId, isLive } = usePageUxPreview();
  const profile = getWorkspaceProfile(workspaceId);
  const [recordSearch, setRecordSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>("week");
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date());
  const [selectMode, setSelectMode] = useState<SelectMode>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [actionConfirmOpen, setActionConfirmOpen] = useState(false);

  const activeQuery = recordSearch.trim();

  const filtered = useMemo(() => {
    const records = meetings.filter((m) => m.status !== "scheduled");
    if (
      scenarioId === "popup-participants" ||
      scenarioId === "popup-records-delete" ||
      scenarioId === "popup-records-download"
    ) {
      return records;
    }
    if (activeQuery) {
      return records.filter((m) => matchesMeetingSearch(m, activeQuery));
    }
    return records.filter((m) =>
      isMeetingInPeriod(m.date, periodAnchor, periodUnit),
    );
  }, [meetings, periodAnchor, periodUnit, activeQuery, scenarioId]);

  const sorted = useMemo(
    () => sortMeetings(filtered, sortKey),
    [filtered, sortKey],
  );

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
  }, [workspaceId, periodUnit, periodAnchor, activeQuery, scenarioId]);

  useEffect(() => {
    setRecordSearch("");
  }, [workspaceId]);

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
    if (scenarioId === "popup-participants") {
      setSelectMode(null);
      setSelected(new Set());
      setActionConfirmOpen(false);
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

  const previewParticipants = useMemo(() => {
    const withPeople = sorted.find((m) => m.participants.length > 0);
    return withPeople?.participants ?? sorted[0]?.participants ?? [];
  }, [sorted]);

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

  async function confirmSelectionAction() {
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
        exportMeetingsListDownload(selectedMeetings);
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

  const periodUnitControl =
    !selectMode && !activeQuery ? (
    <PeriodUnitControl
      unit={periodUnit}
      onUnitChange={(unit) => {
        setPeriodUnit(unit);
        setPeriodAnchor(new Date());
      }}
    />
  ) : null;

  const sortControl = !selectMode ? (
    <SortControl
      value={sortKey}
      onChange={setSortKey}
      forceOpen={scenarioId === "popup-sort"}
    />
  ) : null;

  const batchActions = (
    <div className="flex shrink-0 items-center gap-0.5">
      {selectMode ? (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-2.5 text-xs font-semibold"
            onClick={toggleAll}
            disabled={sorted.length === 0 || busy}
          >
            {selected.size === sorted.length && sorted.length > 0
              ? "선택 해제"
              : "전체"}
          </Button>
          <Button
            type="button"
            size="sm"
            className={cn(
              "h-9 gap-1.5 px-3",
              selectMode === "delete" &&
                "bg-masked text-white hover:bg-masked/90",
            )}
            disabled={selected.size === 0 || busy}
            onClick={() => void runSelectionAction()}
          >
            {selectMode === "delete" ? (
              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Download className="h-4 w-4" strokeWidth={1.75} />
            )}
            {selected.size}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            aria-label="선택 취소"
            disabled={busy}
            onClick={exitMode}
          >
            <X className="h-5 w-5" strokeWidth={1.75} />
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted hover:bg-surface-2 hover:text-foreground"
            aria-label="다운로드"
            disabled={sorted.length === 0}
            onClick={() => enterMode("download")}
          >
            <Download className="h-4 w-4" strokeWidth={1.75} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-masked hover:bg-masked-soft hover:text-masked"
            aria-label="삭제"
            disabled={sorted.length === 0}
            onClick={() => enterMode("delete")}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </>
      )}
    </div>
  );

  const titleBlock = (
    <div className="flex min-w-0 items-center gap-2.5">
      <CardTitle className="text-xl">{profile.recordsTitle}</CardTitle>
    </div>
  );

  const periodHint = selectMode ? (
    <p className="text-center text-base font-medium text-muted">
      {selectMode === "delete" ? "삭제할 기록 선택" : "받을 기록 선택"}
    </p>
  ) : activeQuery ? (
    <p className="text-center text-base font-medium text-muted">
      검색 결과
    </p>
  ) : (
    <PeriodDateNav
      unit={periodUnit}
      anchor={periodAnchor}
      onAnchorChange={setPeriodAnchor}
    />
  );

  const filterControls =
    periodUnitControl || sortControl ? (
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {periodUnitControl}
        {sortControl}
      </div>
    ) : null;

  return (
    <Card>
      <div className="space-y-3 rounded-t-2xl border-b border-border/70 bg-card px-4 pb-4 pt-4 sm:px-6">
        {/* 1행: 제목 · 필터 */}
        <div className="flex min-w-0 items-center justify-between gap-3">
          {titleBlock}
          {filterControls}
        </div>

        {/* 검색: 기록 전용, 모바일 전체폭 */}
        {!selectMode ? (
          <MeetingSearch
            value={recordSearch}
            onChange={setRecordSearch}
            placeholder={profile.searchPlaceholder}
            label={`${profile.recordsTitle} 검색`}
            className="h-12 max-w-none rounded-2xl sm:h-11"
          />
        ) : null}

        {/* 기간 / 선택 안내 · 다운로드·삭제 (좌우 동일 폭으로 날짜 광학 중앙) */}
        <div className="grid min-h-9 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div
            className="pointer-events-none invisible justify-self-start"
            aria-hidden
          >
            {batchActions}
          </div>
          <div className="min-w-0 justify-self-center">{periodHint}</div>
          <div className="justify-self-end">{batchActions}</div>
        </div>
      </div>

      <CardContent className="px-0 pb-2 pt-0">
        {sorted.length === 0 ? (
          <p className="mx-6 mb-3 rounded-xl bg-surface px-4 py-8 text-center text-base text-muted">
            {activeQuery ? "검색 결과가 없습니다." : profile.recordsEmpty}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border/60">
            {sorted.map((meeting) => (
              <li key={meeting.id}>
                <MeetingRecordListItem
                  meeting={meeting}
                  showPeopleDensity={profile.showPeopleDensity}
                  selecting={Boolean(selectMode)}
                  checked={selected.has(meeting.id)}
                  onToggle={() => toggleId(meeting.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>

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
        onConfirm={() => {
          void confirmSelectionAction();
        }}
      />

      {scenarioId === "popup-participants" && previewParticipants.length > 0 ? (
        <ParticipantsPopup
          participants={previewParticipants}
          open
          onClose={() => undefined}
        />
      ) : null}
    </Card>
  );
}

function MeetingRecordListItem({
  meeting,
  showPeopleDensity,
  selecting,
  checked,
  onToggle,
}: {
  meeting: Meeting;
  showPeopleDensity: boolean;
  selecting: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const { day, time } = formatSeoulListLeading(meeting.date);
  const recent = formatRecentDaysLabel(meeting.date);
  const href = `/meetings/${meeting.id}`;

  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 px-4 py-4 transition-colors hover:bg-surface/70 sm:gap-4 sm:px-6 sm:py-5",
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
          aria-label={`${meeting.title} 보기`}
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

      <div className="relative z-10 pointer-events-none flex min-w-[8.5rem] shrink-0 flex-col justify-center sm:min-w-[10rem]">
        <p className="whitespace-nowrap text-lg font-semibold leading-6 tracking-tight text-foreground">
          <span className="font-medium text-muted">{day}</span>{" "}
          <span className="tabular-nums">{time}</span>
        </p>
        {recent ? (
          <p className="mt-1 text-base font-medium leading-5 text-muted-2">
            {recent}
          </p>
        ) : null}
      </div>

      <div className="relative z-10 min-w-0 flex-1 pointer-events-none">
        <div className="flex flex-col gap-2">
          <MeetingCaptureOverline meeting={meeting} />
          <p
            className="min-w-0 truncate text-lg font-semibold leading-6 tracking-tight text-foreground group-hover:text-primary"
            title={meeting.title}
          >
            {meeting.title}
          </p>
          <MeetingKeywords meeting={meeting} />
          {showPeopleDensity ? (
            <div className="pointer-events-auto pt-0.5">
              <ParticipantsCell
                participants={meeting.participants}
                showCount
              />
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative z-10 pointer-events-none flex shrink-0 flex-col items-end justify-center gap-1 self-stretch pl-1">
        <span className="text-base font-medium tabular-nums text-muted">
          {meeting.duration}
        </span>
        {!selecting ? (
          <ArrowRight
            className="h-4 w-4 text-foreground/35"
            strokeWidth={2}
            absoluteStrokeWidth
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}
