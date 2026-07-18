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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatRecentDaysLabel,
  formatSeoulDateParts,
  getPeriodRange,
  isCurrentPeriod,
  isMeetingInPeriod,
  shiftPeriodAnchor,
  type PeriodUnit,
} from "@/lib/meeting-date";
import type { Meeting, Participant } from "@/types/meeting";
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
 * 표시 우선순위
 * 1) 제목, 날짜, 참석자
 * 2) AI 요약 (최대 3줄, 초과는 말줄임)
 * 3) 다운로드(제목 옆 소형), 소요 시간(가장 먼저 숨김)
 */
const col = {
  title: "w-[28%] pl-5 text-left",
  date: "w-[14%] text-center",
  participants: "w-[18%] text-center",
  summary: "w-[28%] text-left",
  duration: "w-[12%] text-left max-xl:hidden",
} as const;

const headCellClass =
  "h-12 whitespace-nowrap bg-surface/70 px-3 text-xs font-semibold text-muted";
const bodyCellClass = "px-3 py-4 align-middle";

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

function DateTimeCell({ date }: { date: string }) {
  const { day, time } = formatSeoulDateParts(date);
  const recent = formatRecentDaysLabel(date);
  return (
    <div className="leading-snug text-center">
      <p className="text-sm font-medium text-foreground">{day}</p>
      <p className="text-xs text-muted-2">{time}</p>
      {recent ? (
        <p className="mt-0.5 text-[11px] font-medium text-primary">{recent}</p>
      ) : null}
    </div>
  );
}

function MeetingTags({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="mt-1 flex min-w-0 flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-full truncate rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function MeetingSummary({ meeting }: { meeting: Meeting }) {
  const tags =
    meeting.summaryTags.length > 0
      ? meeting.summaryTags
      : meeting.status === "in_progress"
        ? ["처리 중"]
        : meeting.status === "scheduled"
          ? ["예정"]
          : [];

  if (tags.length === 0) {
    return <span className="text-xs text-muted-2">-</span>;
  }

  const full = tags.join(", ");

  return (
    <div
      className="flex max-h-[4.75rem] min-w-0 flex-wrap content-start gap-1 overflow-hidden"
      title={full}
    >
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex shrink-0 rounded-full border border-primary/15 bg-primary-soft px-2 py-0.5 text-[11px] font-medium leading-5 text-primary"
        >
          {tag}
        </span>
      ))}
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
    <div className="flex min-w-0 items-center justify-center gap-1">
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
      <p className="min-w-0 truncate px-1 text-center text-sm font-medium tabular-nums text-foreground">
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

function recognitionLabel(p: Participant) {
  if (p.recognition === "voice") return "음성 톤 구분";
  if (p.recognition === "guest") return "외부 게스트";
  if (p.recognition === "member" || p.isMember) return "회원 매칭";
  return "음성 톤 구분";
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
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(32rem,85vh)] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_20px_50px_rgba(17,24,46,0.18)]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">참석자</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              회의록 인식 시 화자를 구분합니다. 회원이 아니어도 음성 톤, 호칭
              등으로 상대방을 매칭할 수 있습니다.
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

        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 py-4">
          {participants.map((p) => (
            <li key={p.id} className="rounded-xl bg-surface px-3 py-3">
              <div className="flex items-center gap-2.5">
                <Avatar className="h-8 w-8">
                  <AvatarFallback
                    className={cn("text-[11px] text-white", p.color)}
                  >
                    {p.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {p.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {p.isMember ? "사이트 회원" : "비회원/외부"},{" "}
                    {recognitionLabel(p)}
                  </p>
                </div>
              </div>
              {p.recognitionNote ? (
                <p className="mt-2 text-xs leading-relaxed text-muted-2">
                  {p.recognitionNote}
                </p>
              ) : (
                <p className="mt-2 text-xs text-muted-2">
                  녹취 시 톤과 호칭으로 이 참석자를 구분합니다.
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function ParticipantsCell({ participants }: { participants: Participant[] }) {
  const [open, setOpen] = useState(false);
  const visible = participants.slice(0, VISIBLE_AVATARS);
  const overflow = Math.max(0, participants.length - VISIBLE_AVATARS);
  const label =
    participants.length === 0
      ? "참석자 없음"
      : participants.map((p) => p.name).join(", ");

  if (participants.length === 0) {
    return <span className="text-xs text-muted-2">-</span>;
  }

  return (
    <>
      <div className="relative inline-flex justify-center">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`참석자 ${participants.length}명: ${label}`}
          title={label}
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex cursor-pointer items-center rounded-full p-0.5 transition-colors",
            "hover:bg-surface-2",
            open && "bg-surface-2",
          )}
        >
          <span className="flex -space-x-1.5">
            {visible.map((participant) => (
              <Avatar
                key={participant.id}
                className="h-7 w-7 border-2 border-white"
              >
                <AvatarFallback
                  className={`${participant.color} text-[10px] text-white`}
                >
                  {participant.initials}
                </AvatarFallback>
              </Avatar>
            ))}
            {overflow > 0 ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-surface-2 text-[10px] font-semibold text-foreground">
                +{overflow}
              </span>
            ) : null}
          </span>
        </button>
      </div>
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

  return (
    <Card>
      <CardHeader className="relative grid grid-cols-1 items-center gap-3 space-y-0 px-6 py-4 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex min-w-0 items-center gap-2 md:justify-self-start">
          <CardTitle>회의 기록</CardTitle>
          <span className="inline-flex min-w-7 items-center justify-center rounded-lg bg-surface px-2 py-1 text-sm font-semibold tabular-nums text-foreground">
            {sorted.length}
          </span>
        </div>

        <div className="md:justify-self-center">
          <PeriodDateNav
            unit={periodUnit}
            anchor={periodAnchor}
            onAnchorChange={setPeriodAnchor}
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 md:justify-self-end">
          <PeriodUnitControl
            unit={periodUnit}
            onUnitChange={(unit) => {
              setPeriodUnit(unit);
              setPeriodAnchor(new Date());
            }}
          />
          <SortControl value={sortKey} onChange={setSortKey} />
        </div>
      </CardHeader>

      <CardContent className="px-0 pb-4 pt-0">
        {sorted.length === 0 ? (
          <p className="mx-6 mb-1 rounded-xl bg-surface px-4 py-8 text-center text-sm text-muted">
            이 기간에 해당하는 회의 기록이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto px-2 sm:px-3">
            <Table className="w-full table-fixed border-separate border-spacing-0">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead
                    className={cn(
                      headCellClass,
                      col.title,
                      "border-t border-b border-r border-border first:rounded-tl-lg",
                    )}
                  >
                    회의 제목
                  </TableHead>
                  <TableHead
                    className={cn(
                      headCellClass,
                      col.date,
                      "border-t border-b border-r border-border",
                    )}
                  >
                    날짜 및 시간
                  </TableHead>
                  <TableHead
                    className={cn(
                      headCellClass,
                      col.participants,
                      "border-t border-b border-r border-border",
                    )}
                  >
                    참석자
                  </TableHead>
                  <TableHead
                    className={cn(
                      headCellClass,
                      col.summary,
                      "border-t border-b border-r border-border",
                    )}
                  >
                    AI 요약
                  </TableHead>
                  <TableHead
                    className={cn(
                      headCellClass,
                      col.duration,
                      "border-t border-b border-border last:rounded-tr-lg",
                    )}
                  >
                    소요 시간
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((meeting, index) => {
                  const isLast = index === sorted.length - 1;
                  return (
                    <TableRow
                      key={meeting.id}
                      className="border-0 hover:bg-surface/50"
                    >
                      <TableCell
                        className={cn(
                          bodyCellClass,
                          col.title,
                          "border-r border-border",
                          !isLast && "border-b",
                          isLast && "rounded-bl-lg",
                        )}
                      >
                        <div className="flex min-w-0 items-start gap-1.5">
                          <Link
                            href={`/meetings/${meeting.id}`}
                            className="group min-w-0 flex-1"
                            title={meeting.title}
                          >
                            <p className="truncate font-medium text-foreground group-hover:text-primary">
                              {meeting.title}
                            </p>
                            <MeetingTags tags={meeting.tags} />
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="mt-0.5 h-6 w-6 shrink-0 text-muted hover:text-foreground"
                            type="button"
                            aria-label={`${meeting.title} 내보내기`}
                            title="내보내기"
                            onClick={(e) => e.preventDefault()}
                          >
                            <Download
                              className="h-3.5 w-3.5"
                              strokeWidth={1.75}
                            />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell
                        className={cn(
                          bodyCellClass,
                          col.date,
                          "border-r border-border",
                          !isLast && "border-b",
                        )}
                      >
                        <DateTimeCell date={meeting.date} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          bodyCellClass,
                          col.participants,
                          "border-r border-border",
                          !isLast && "border-b",
                        )}
                      >
                        <ParticipantsCell
                          participants={meeting.participants}
                        />
                      </TableCell>
                      <TableCell
                        className={cn(
                          bodyCellClass,
                          col.summary,
                          "border-r border-border",
                          !isLast && "border-b",
                        )}
                      >
                        <MeetingSummary meeting={meeting} />
                      </TableCell>
                      <TableCell
                        className={cn(
                          bodyCellClass,
                          col.duration,
                          !isLast && "border-b",
                          isLast && "rounded-br-lg",
                        )}
                      >
                        <span className="inline-flex items-center whitespace-nowrap rounded-lg bg-surface px-2 py-1 text-xs font-semibold tabular-nums text-foreground">
                          {meeting.duration}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
