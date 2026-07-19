"use client";

import Link from "next/link";
import {
  ArrowDownWideNarrow,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { GroupedParticipantsList } from "@/components/meetings/meeting-participants";
import {
  formatRecentDaysLabel,
  formatSeoulListLeading,
  getPeriodRange,
  isCurrentPeriod,
  isMeetingInPeriod,
  shiftPeriodAnchor,
  type PeriodUnit,
} from "@/lib/meeting-date";
import { meetingTopicKeywords } from "@/lib/meeting-keywords";
import { getWorkspaceProfile } from "@/lib/workspaces";
import type { Meeting, Participant } from "@/types/meeting";
import { useAppContext } from "@/context/app-context";
import { cn } from "@/lib/utils";

interface RecentMeetingsTableProps {
  meetings: Meeting[];
  searchQuery?: string;
}

function matchesMeetingSearch(meeting: Meeting, query: string) {
  const hay = [
    meeting.title,
    ...meeting.participants.map((p) => p.name),
    ...meeting.tags,
    ...meeting.summaryTags,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(query);
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
 * - headline: 제목
 * - supporting: 키워드 · 참석자
 * - trailing: 소요시간 · 내보내기
 * 참고: m3.material.io/components/lists
 */
const KEYWORD_VISIBLE = 5;

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
  const tags = meetingTopicKeywords(
    meeting.summaryTags,
    meeting.tags,
    KEYWORD_VISIBLE + 2,
  );

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
          className="inline-flex max-w-full truncate rounded-lg bg-primary-soft px-2.5 py-1 text-xs font-semibold leading-none text-primary"
        >
          {tag}
        </span>
      ))}
      {overflow > 0 ? (
        <span className="inline-flex shrink-0 text-xs font-semibold text-muted">
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
            "h-8 min-w-8 cursor-pointer rounded-md px-2.5 text-xs font-semibold transition-colors",
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
    <div className="flex w-full min-w-0 max-w-full items-center justify-center gap-0.5 sm:gap-1 xl:w-max">
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
      <p className="min-w-0 flex-1 truncate px-0.5 text-center text-xs font-medium tabular-nums text-foreground sm:px-1 sm:text-sm">
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

function SortControl({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((o) => o.value === value)?.label ?? "최신순";

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors",
          "hover:bg-surface",
          open && "border-primary bg-primary-soft",
        )}
      >
        <ArrowDownWideNarrow className="h-3.5 w-3.5 text-muted" />
        {current}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <ul
          role="listbox"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-40 min-w-[9.5rem] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-[0_12px_28px_rgba(17,24,46,0.12)]"
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
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer px-3 py-2 text-left text-xs font-medium transition-colors",
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

function ParticipantsPopup({
  participants,
  open,
  onClose,
}: {
  participants: Participant[];
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="참석자"
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(32rem,85vh)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_50px_rgba(17,24,46,0.18)]"
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
    return <span className="text-xs text-muted-2">참석자 없음</span>;
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
        <span className="flex shrink-0 whitespace-nowrap -space-x-1.5">
          {visible.map((participant, index) => (
            <Avatar
              key={participant.id}
              className="h-7 w-7 border-2 border-card"
              style={{ zIndex: index + 1 }}
            >
              <AvatarFallback
                className={`${participant.color} text-[10px] text-white`}
              >
                {participant.initials}
              </AvatarFallback>
            </Avatar>
          ))}
          {overflow > 0 ? (
            <span
              className="relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-surface-2 text-[10px] font-semibold text-foreground"
              style={{ zIndex: visible.length + 1 }}
            >
              +{overflow}
            </span>
          ) : null}
        </span>
        {showCount ? (
          <span className="hidden text-xs font-medium text-muted sm:inline">
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
  searchQuery = "",
}: RecentMeetingsTableProps) {
  const { workspaceId } = useAppContext();
  const profile = getWorkspaceProfile(workspaceId);
  const [sortKey, setSortKey] = useState<SortKey>("date_desc");
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>("week");
  const [periodAnchor, setPeriodAnchor] = useState(() => new Date());

  const filtered = useMemo(() => {
    const records = meetings.filter((m) => m.status !== "scheduled");
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return records.filter((m) => matchesMeetingSearch(m, q));
    }
    return records.filter((m) =>
      isMeetingInPeriod(m.date, periodAnchor, periodUnit),
    );
  }, [meetings, periodAnchor, periodUnit, searchQuery]);

  const sorted = useMemo(
    () => sortMeetings(filtered, sortKey),
    [filtered, sortKey],
  );

  const periodFilters = (
    <div className="inline-flex flex-nowrap items-center gap-1 sm:gap-1.5">
      <PeriodUnitControl
        unit={periodUnit}
        onUnitChange={(unit) => {
          setPeriodUnit(unit);
          setPeriodAnchor(new Date());
        }}
      />
      <SortControl value={sortKey} onChange={setSortKey} />
    </div>
  );

  const titleBlock = (
    <div className="flex min-w-0 items-center gap-2">
      <CardTitle>{profile.recordsTitle}</CardTitle>
      <span className="inline-flex min-w-7 items-center justify-center rounded-lg bg-surface px-2 py-1 text-sm font-semibold tabular-nums text-foreground">
        {sorted.length}
      </span>
    </div>
  );

  return (
    <Card>
      <div className="px-4 py-4 sm:px-6">
        {/* 모바일·축소: 제목+필터 한 줄(우끝), 날짜는 아래 가운데 */}
        <div className="flex flex-col gap-3 xl:hidden">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="min-w-0">{titleBlock}</div>
            <div className="shrink-0">{periodFilters}</div>
          </div>
          <PeriodDateNav
            unit={periodUnit}
            anchor={periodAnchor}
            onAnchorChange={setPeriodAnchor}
          />
        </div>

        {/* 넓은 PC: 좌 제목 · 중 날짜 · 우 필터 */}
        <div className="hidden items-center gap-3 xl:grid xl:grid-cols-[1fr_auto_1fr]">
          <div className="justify-self-start">{titleBlock}</div>
          <div className="justify-self-center">
            <PeriodDateNav
              unit={periodUnit}
              anchor={periodAnchor}
              onAnchorChange={setPeriodAnchor}
            />
          </div>
          <div className="justify-self-end">{periodFilters}</div>
        </div>
      </div>

      <CardContent className="px-0 pb-2 pt-0">
        {sorted.length === 0 ? (
          <p className="mx-6 mb-3 rounded-xl bg-surface px-4 py-8 text-center text-sm text-muted">
            {profile.recordsEmpty}
          </p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {sorted.map((meeting) => (
              <li key={meeting.id}>
                <MeetingRecordListItem
                  meeting={meeting}
                  showPeopleDensity={profile.showPeopleDensity}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** M3 three-line list item: leading, headline, supporting, trailing */
function MeetingRecordListItem({
  meeting,
  showPeopleDensity,
}: {
  meeting: Meeting;
  showPeopleDensity: boolean;
}) {
  const { day, time } = formatSeoulListLeading(meeting.date);
  const recent = formatRecentDaysLabel(meeting.date);
  const href = `/meetings/${meeting.id}`;

  return (
    <div className="group flex min-h-[5.5rem] gap-3 px-4 py-3.5 transition-colors hover:bg-surface/70 sm:gap-4 sm:px-6">
      {/* leadingContent — 날짜·시간을 고정 폭으로 스캔 */}
      <Link
        href={href}
        className="flex w-[4.5rem] shrink-0 flex-col items-start pt-0.5 outline-none sm:w-[5.25rem]"
        tabIndex={-1}
        aria-hidden
      >
        <p className="text-[11px] font-medium leading-4 tracking-tight text-muted">
          {day}
        </p>
        <p className="mt-1 text-[1.25rem] font-semibold leading-7 tabular-nums tracking-tight text-foreground">
          {time}
        </p>
        {recent ? (
          <p className="mt-1 text-[11px] font-semibold leading-4 text-primary">
            {recent}
          </p>
        ) : null}
      </Link>

      {/* headline + supporting */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-3">
            <Link
              href={href}
              className="min-w-0 outline-none lg:max-w-[42%]"
              title={meeting.title}
            >
              <p className="truncate text-base font-medium leading-6 text-foreground group-hover:text-primary">
                {meeting.title}
              </p>
            </Link>
            <div className="min-w-0 lg:flex-1">
              <MeetingKeywords meeting={meeting} />
            </div>
          </div>

          {/* trailingSupportingText + action */}
          <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
            <span className="px-1 text-xs font-medium tabular-nums text-muted">
              {meeting.duration}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted hover:text-foreground"
              type="button"
              aria-label={`${meeting.title} 내보내기`}
              title="내보내기"
              onClick={(e) => e.preventDefault()}
            >
              <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
            </Button>
          </div>
        </div>

        {showPeopleDensity ? (
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <ParticipantsCell
              participants={meeting.participants}
              showCount
            />
            {meeting.tags.length > 0 ? (
              <p className="min-w-0 truncate text-xs text-muted-2">
                {meeting.tags.slice(0, 3).join(", ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
