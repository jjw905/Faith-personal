"use client";

import {
  ChevronLeft,
  ChevronRight,
  Link2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  dateLabelToIso,
  formatUpcomingScheduleSummary,
  isoToUpcomingDateLabel,
  listMonthDayCells,
  parseIsoDateParts,
  relativeUpcomingHint,
  seoulDateKey,
  shiftMonth,
} from "@/lib/meeting-date";
import {
  inferMeetingPlatform,
  MeetingPlatformIcon,
  MEETING_PLATFORMS,
  platformDefaultLocation,
  type MeetingPlatform,
} from "@/lib/meeting-platform";
import {
  PLACE_PRESETS,
  resolveWorkspacePerson,
  WORKSPACE_PEOPLE,
  type UpcomingItem,
} from "@/lib/workspace-data";
import { cn } from "@/lib/utils";

interface UpcomingDetailPanelProps {
  item: UpcomingItem | null;
  open: boolean;
  onClose: () => void;
  onSave: (item: UpcomingItem) => void;
  onDelete?: (item: UpcomingItem) => void;
  /** 추가 모드면 처음부터 편집 폼을 연다. */
  mode?: "view" | "create";
}

type FormState = {
  title: string;
  dateLabel: string;
  timeLabel: string;
  duration: string;
  location: string;
  platform: MeetingPlatform;
  organizer: string;
  participants: string[];
  agenda: string[];
  notes: string;
};

function resolvePlatform(item: UpcomingItem): MeetingPlatform {
  return item.platform ?? inferMeetingPlatform(item.location);
}

function toForm(item: UpcomingItem): FormState {
  return {
    title: item.title,
    dateLabel: item.dateLabel,
    timeLabel: item.timeLabel,
    duration: canonicalizeDuration(item.duration),
    location: item.location,
    platform: resolvePlatform(item),
    organizer: item.organizer,
    participants: [...item.participants],
    agenda: [...item.agenda],
    notes: item.notes,
  };
}

function hasExtraLocation(platform: MeetingPlatform, location: string) {
  if (platform === "custom") return Boolean(location.trim());
  return (
    Boolean(location.trim()) &&
    location.trim() !== platformDefaultLocation(platform)
  );
}

/** M3 list/form row: muted section label + content. */
function DetailRow({
  label,
  align = "start",
  children,
}: {
  label: string;
  align?: "start" | "center";
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-4",
        align === "start" ? "items-start" : "items-center",
      )}
    >
      <p
        className={cn(
          "w-14 shrink-0 text-xs font-medium leading-5 text-muted",
          align === "start" && "pt-0.5",
        )}
      >
        {label}
      </p>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function PersonAvatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const person = resolveWorkspacePerson(name);
  return (
    <Avatar
      className={cn(
        size === "sm" ? "h-8 w-8" : "h-9 w-9",
        "border-2 border-card",
        className,
      )}
    >
      <AvatarFallback
        className={cn("text-[11px] font-semibold text-white", person.color)}
      >
        {person.initials}
      </AvatarFallback>
    </Avatar>
  );
}

function AddAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border px-3 text-xs font-medium text-muted transition-colors hover:border-foreground/25 hover:bg-surface hover:text-foreground"
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function fromForm(item: UpcomingItem, form: FormState): UpcomingItem {
  const participants = form.participants.map((v) => v.trim()).filter(Boolean);
  const agenda = form.agenda.map((v) => v.trim()).filter(Boolean);
  const location =
    form.platform === "custom"
      ? form.location.trim() || "직접 입력"
      : form.location.trim() || platformDefaultLocation(form.platform);
  const dateLabel = form.dateLabel.trim() || item.dateLabel;
  const timeLabel = form.timeLabel.trim() || item.timeLabel;
  const duration = canonicalizeDuration(form.duration.trim() || item.duration);

  return {
    ...item,
    title: form.title.trim() || item.title || "새 예정 회의",
    dateLabel,
    timeLabel,
    duration,
    location,
    platform: form.platform,
    organizer: form.organizer.trim() || item.organizer,
    participants: participants.length ? participants : item.participants,
    agenda,
    notes: form.notes.trim(),
    when: formatUpcomingScheduleSummary(dateLabel, timeLabel, duration),
  };
}

const DURATION_PRESETS = [
  "15분",
  "30분",
  "45분",
  "1시간",
  "1시간 30분",
  "2시간",
] as const;

const DURATION_MIN = 5;
const DURATION_MAX = 480;

function clampDurationMinutes(mins: number) {
  if (!Number.isFinite(mins)) return 30;
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, Math.round(mins)));
}

/** 분 → 표시 라벨 (30분, 1시간, 1시간 30분) */
function formatMinutesLabel(mins: number): string {
  const m = clampDurationMinutes(mins);
  if (m < 60) return `${m}분`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  if (rest === 0) return `${hours}시간`;
  return `${hours}시간 ${rest}분`;
}

function durationPartToMinutes(label: string): number | null {
  const trimmed = label.trim();
  if (!trimmed) return null;
  const hourMin = trimmed.match(/^(\d+)\s*시간(?:\s*(\d+)\s*분)?$/);
  if (hourMin) {
    return Number(hourMin[1]) * 60 + Number(hourMin[2] ?? 0);
  }
  const minOnly = trimmed.match(/^(\d+)\s*분$/);
  if (minOnly) return Number(minOnly[1]);
  const bare = trimmed.match(/^(\d+)$/);
  if (bare) return Number(bare[1]);
  return null;
}

/** 정확히(30분) 또는 구간(30분~45분) 파싱 */
function parseDurationValue(value: string): { min: number; max: number | null } {
  const trimmed = value
    .trim()
    .replace(/\s*[~～\-–—]\s*/g, "~");
  if (trimmed.includes("~")) {
    const [left, right] = trimmed.split("~");
    const a = durationPartToMinutes(left ?? "");
    const b = durationPartToMinutes(right ?? "");
    const min = clampDurationMinutes(a ?? 30);
    const max = clampDurationMinutes(b ?? min + 15);
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
    };
  }
  const only = durationPartToMinutes(trimmed);
  return { min: clampDurationMinutes(only ?? 30), max: null };
}

function formatDurationValue(min: number, max: number | null): string {
  const lo = formatMinutesLabel(min);
  if (max === null || max === min) return lo;
  return `${lo}~${formatMinutesLabel(max)}`;
}

function canonicalizeDuration(value: string): string {
  const { min, max } = parseDurationValue(value);
  return formatDurationValue(min, max);
}

function MinuteInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (mins: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={DURATION_MIN}
        max={DURATION_MAX}
        step={5}
        value={value}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isFinite(next)) return;
          onChange(clampDurationMinutes(next));
        }}
        className={cn(
          outlinedFieldClass,
          "w-[4.75rem] px-2 text-center text-base font-semibold tabular-nums",
        )}
        aria-label={ariaLabel}
      />
      <span className="shrink-0 text-sm text-muted">분</span>
    </div>
  );
}

/** 빠른 프리셋 + 정확히/구간 분 단위 입력 */
function DurationFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parseDurationValue(value);
  const isRange = parsed.max !== null && parsed.max !== parsed.min;
  const [mode, setMode] = useState<"exact" | "range">(
    isRange ? "range" : "exact",
  );

  useEffect(() => {
    const next = parseDurationValue(value);
    if (next.max !== null && next.max !== next.min) {
      setMode("range");
    }
  }, [value]);

  const minMins = parsed.min;
  const maxMins = parsed.max ?? Math.min(DURATION_MAX, parsed.min + 15);
  const label = canonicalizeDuration(value);

  function applyExact(mins: number) {
    setMode("exact");
    onChange(formatDurationValue(mins, null));
  }

  function applyRange(min: number, max: number) {
    setMode("range");
    const a = clampDurationMinutes(min);
    const b = clampDurationMinutes(max);
    onChange(formatDurationValue(Math.min(a, b), Math.max(a, b)));
  }

  return (
    <div className="min-w-0 space-y-3">
      <p className="text-xs font-medium text-muted">소요</p>

      <div
        className="inline-flex rounded-lg border border-border p-0.5"
        role="radiogroup"
        aria-label="소요 입력 방식"
      >
        {(
          [
            ["exact", "지정"],
            ["range", "구간"],
          ] as const
        ).map(([id, text]) => {
          const active = mode === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (id === "exact") {
                  applyExact(minMins);
                  return;
                }
                applyRange(minMins, Math.max(maxMins, minMins + 15));
              }}
              className={cn(
                "h-8 cursor-pointer rounded-md px-3 text-xs font-medium transition-colors",
                active
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:text-foreground",
              )}
            >
              {text}
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="빠른 소요"
      >
        {DURATION_PRESETS.map((preset) => {
          const mins = durationPartToMinutes(preset) ?? 30;
          const active = mode === "exact" && minMins === mins && !isRange;
          return (
            <Chip
              key={preset}
              active={active}
              onClick={() => applyExact(mins)}
            >
              {preset}
            </Chip>
          );
        })}
      </div>

      {mode === "exact" ? (
        <MinuteInput
          value={minMins}
          onChange={applyExact}
          ariaLabel="소요 분"
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <MinuteInput
            value={minMins}
            onChange={(mins) => applyRange(mins, maxMins)}
            ariaLabel="최소 소요 분"
          />
          <span className="text-sm text-muted" aria-hidden>
            ~
          </span>
          <MinuteInput
            value={maxMins}
            onChange={(mins) => applyRange(minMins, mins)}
            ariaLabel="최대 소요 분"
          />
        </div>
      )}

      <p className="text-xs font-medium tabular-nums text-foreground">
        {label}
      </p>
    </div>
  );
}

/** M3 outlined text field */
const outlinedFieldClass =
  "flex h-12 w-full rounded-md border border-border bg-transparent px-3.5 text-sm text-foreground placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary-soft text-primary"
          : "border border-border bg-transparent text-foreground hover:bg-surface",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ScheduleSummary({
  dateLabel,
  timeLabel,
  duration,
  className,
}: {
  dateLabel: string;
  timeLabel: string;
  duration: string;
  className?: string;
}) {
  const summary = formatUpcomingScheduleSummary(
    dateLabel,
    timeLabel,
    canonicalizeDuration(duration),
  );
  const hint = relativeUpcomingHint(dateLabel);

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-sm font-medium tabular-nums tracking-tight text-foreground">
        {summary}
      </p>
      {hint ? (
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** M3 docked month calendar — 큰 날짜 셀, 월 이동 */
function MonthCalendar({
  selectedIso,
  minIso,
  onSelect,
}: {
  selectedIso: string;
  minIso: string;
  onSelect: (iso: string) => void;
}) {
  const selectedParts = parseIsoDateParts(selectedIso);
  const minParts = parseIsoDateParts(minIso);
  const [view, setView] = useState(() => ({
    year: selectedParts?.year ?? minParts?.year ?? 2026,
    month: selectedParts?.month ?? minParts?.month ?? 1,
  }));

  useEffect(() => {
    const parts = parseIsoDateParts(selectedIso);
    if (!parts) return;
    setView({ year: parts.year, month: parts.month });
  }, [selectedIso]);

  const cells = listMonthDayCells(view.year, view.month);
  const canGoPrev =
    !minParts ||
    view.year > minParts.year ||
    (view.year === minParts.year && view.month > minParts.month);

  return (
    <div
      className="min-w-0 rounded-xl border border-border bg-card px-2 pb-2 pt-3"
      role="group"
      aria-label="날짜 달력"
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <button
          type="button"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, -1))}
          disabled={!canGoPrev}
          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface disabled:pointer-events-none disabled:opacity-30"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {view.year}년 {view.month}월
        </p>
        <button
          type="button"
          onClick={() => setView((v) => shiftMonth(v.year, v.month, 1))}
          className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface"
          aria-label="다음 달"
        >
          <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      <div className="grid grid-cols-7">
        {WEEKDAY_HEADERS.map((label) => (
          <div
            key={label}
            className="flex h-9 items-center justify-center text-xs font-medium text-muted"
          >
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const disabled = cell.iso < minIso;
          const selected = cell.iso === selectedIso;
          const isToday = cell.iso === minIso;
          return (
            <div
              key={cell.iso}
              className="flex items-center justify-center py-0.5"
            >
              <button
                type="button"
                disabled={disabled}
                aria-label={cell.iso}
                aria-pressed={selected}
                onClick={() => onSelect(cell.iso)}
                className={cn(
                  "inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-sm font-medium tabular-nums transition-colors",
                  !cell.inMonth && !selected && "text-muted-2",
                  cell.inMonth &&
                    !selected &&
                    "text-foreground hover:bg-surface",
                  isToday && !selected && "font-semibold text-primary",
                  selected &&
                    "bg-primary font-semibold text-primary-foreground",
                  disabled && "pointer-events-none opacity-30",
                )}
              >
                {cell.day}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** M3: 월 달력 + 시간/소요. 표시는 항상 절대 일정. */
function ScheduleFields({
  dateLabel,
  timeLabel,
  duration,
  onDateChange,
  onTimeChange,
  onDurationChange,
}: {
  dateLabel: string;
  timeLabel: string;
  duration: string;
  onDateChange: (next: string) => void;
  onTimeChange: (next: string) => void;
  onDurationChange: (next: string) => void;
}) {
  const todayIso = seoulDateKey();
  const selectedIso = dateLabelToIso(dateLabel) ?? todayIso;

  return (
    <div className="min-w-0 space-y-4">
      <ScheduleSummary
        dateLabel={dateLabel}
        timeLabel={timeLabel}
        duration={duration}
        className="rounded-md border border-border px-3 py-2.5"
      />

      <div className="min-w-0">
        <p className="mb-1.5 text-xs font-medium text-muted">날짜</p>
        <MonthCalendar
          selectedIso={selectedIso}
          minIso={todayIso}
          onSelect={(iso) => onDateChange(isoToUpcomingDateLabel(iso))}
        />
      </div>

      <label className="block min-w-0">
        <span className="mb-1 block text-xs font-medium text-muted">시작</span>
        <input
          type="time"
          value={toTimeInputValue(timeLabel)}
          onChange={(e) => onTimeChange(fromTimeInputValue(e.target.value))}
          className={cn(
            outlinedFieldClass,
            "max-w-[10.5rem] cursor-pointer text-base font-semibold tabular-nums",
          )}
          aria-label={`시작 시간 ${timeLabel}`}
        />
      </label>

      <DurationFields value={duration} onChange={onDurationChange} />
    </div>
  );
}

function toTimeInputValue(label: string) {
  const m = label.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "16:00";
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

function fromTimeInputValue(value: string) {
  return value || "16:00";
}

/** 예정 회의 상세/수정. 보기 레이아웃을 유지한 채 바로 수정. */
export function UpcomingDetailPanel({
  item,
  open,
  onClose,
  onSave,
  onDelete,
  mode = "view",
}: UpcomingDetailPanelProps) {
  const isCreate = mode === "create";
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [participantDraft, setParticipantDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [showPlaceEditor, setShowPlaceEditor] = useState(false);
  const [showParticipantAdd, setShowParticipantAdd] = useState(false);
  const [showOrganizerPick, setShowOrganizerPick] = useState(false);
  const [showCustomParticipant, setShowCustomParticipant] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  function resetEditors() {
    setParticipantDraft("");
    setLinkDraft("");
    setShowLinkEditor(false);
    setShowPlaceEditor(false);
    setShowParticipantAdd(false);
    setShowOrganizerPick(false);
    setShowCustomParticipant(false);
  }

  useEffect(() => {
    if (!open || !item) return;
    setEditing(isCreate);
    setForm(toForm(item));
    resetEditors();
  }, [open, item, isCreate]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing && !isCreate) {
          setEditing(false);
          if (item) setForm(toForm(item));
          resetEditors();
          return;
        }
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, editing, item, isCreate]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleSave() {
    if (!item || !form) return;
    onSave(fromForm(item, form));
    setEditing(false);
    resetEditors();
  }

  function cancelEdit() {
    if (isCreate) {
      onClose();
      return;
    }
    setEditing(false);
    if (item) setForm(toForm(item));
    resetEditors();
  }

  function startEdit() {
    if (!item) return;
    setForm(toForm(item));
    setEditing(true);
    resetEditors();
  }

  function addParticipant(name: string) {
    const next = name.trim();
    if (!next || !form) return;
    if (form.participants.includes(next)) return;
    update("participants", [...form.participants, next]);
    setParticipantDraft("");
    setShowCustomParticipant(false);
  }

  function toggleParticipant(name: string) {
    if (!form) return;
    if (form.participants.includes(name)) {
      update(
        "participants",
        form.participants.filter((p) => p !== name),
      );
      return;
    }
    update("participants", [...form.participants, name]);
  }

  function addAgendaRow() {
    if (!form) return;
    update("agenda", [...form.agenda, ""]);
  }

  const view = item;
  const data = editing ? form : view ? toForm(view) : null;
  const sheetTitle = isCreate
    ? "예정 회의 추가"
    : editing
      ? "예정 회의 수정"
      : "예정 회의";

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className={cn(
          "fixed inset-0 z-50 bg-black/40 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden={!open}
      />

      <aside
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
        aria-label={sheetTitle}
        inert={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-dvh w-full max-w-[min(100vw,28rem)] flex-col overflow-hidden bg-card shadow-[0_0_40px_rgba(17,24,46,0.12)] transition-transform duration-200 ease-out sm:max-w-md",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* M3 side sheet header */}
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 cursor-pointer text-foreground/70 hover:bg-surface hover:text-foreground"
            onClick={onClose}
            aria-label="상세 닫기"
          >
            <X className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-base font-medium text-foreground">
              {sheetTitle}
            </p>
          </div>
          {!editing && view && !isCreate ? (
            <div className="flex shrink-0 items-center">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 cursor-pointer text-foreground/70 hover:bg-surface hover:text-foreground"
                onClick={startEdit}
                aria-label="수정"
              >
                <Pencil className="h-5 w-5" strokeWidth={1.75} />
              </Button>
              {onDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 cursor-pointer text-masked hover:bg-masked-soft hover:text-masked"
                  onClick={() => {
                    if (!view) return;
                    if (!window.confirm("이 일정을 삭제할까요?")) return;
                    onDelete(view);
                    onClose();
                  }}
                  aria-label="삭제"
                >
                  <Trash2 className="h-5 w-5" strokeWidth={1.75} />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {view && data && form ? (
          <>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
              <div className="min-w-0 space-y-0 px-4 py-2 sm:px-5">
                {/* Title */}
                <div className="border-b border-border py-4">
                  {editing ? (
                    <input
                      value={form.title}
                      onChange={(e) => update("title", e.target.value)}
                      className="w-full bg-transparent text-xl font-medium leading-snug text-foreground outline-none placeholder:text-muted-2"
                      placeholder="회의 제목"
                      aria-label="회의 제목"
                    />
                  ) : (
                    <h2 className="text-xl font-medium leading-snug text-foreground">
                      {view.title}
                    </h2>
                  )}
                </div>

                <section className="divide-y divide-border">
                  <div className="py-4">
                    {editing ? (
                      <ScheduleFields
                        dateLabel={form.dateLabel}
                        timeLabel={form.timeLabel}
                        duration={form.duration}
                        onDateChange={(next) => update("dateLabel", next)}
                        onTimeChange={(next) => update("timeLabel", next)}
                        onDurationChange={(next) => update("duration", next)}
                      />
                    ) : (
                      <DetailRow label="일정" align="start">
                        <ScheduleSummary
                          dateLabel={view.dateLabel}
                          timeLabel={view.timeLabel}
                          duration={view.duration}
                        />
                      </DetailRow>
                    )}
                  </div>

                  <div className="py-4">
                    <DetailRow
                      label="장소"
                      align={editing ? "start" : "center"}
                    >
                      {editing ? (
                        <div className="min-w-0 space-y-3">
                          <div
                            className="flex flex-wrap gap-2"
                            role="group"
                            aria-label="장소 플랫폼"
                          >
                            {MEETING_PLATFORMS.map((option) => {
                              const selected = form.platform === option.id;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  aria-pressed={selected}
                                  aria-label={option.label}
                                  title={option.label}
                                  onClick={() => {
                                    update("platform", option.id);
                                    setShowLinkEditor(false);
                                    setShowPlaceEditor(false);
                                    if (option.id === "custom") {
                                      update("location", "");
                                    } else {
                                      update(
                                        "location",
                                        platformDefaultLocation(option.id),
                                      );
                                    }
                                  }}
                                  className={cn(
                                    "inline-flex cursor-pointer flex-col items-center gap-1 rounded-lg px-1.5 py-1 transition-colors",
                                    selected
                                      ? "bg-primary-soft"
                                      : "hover:bg-surface",
                                  )}
                                >
                                  <MeetingPlatformIcon
                                    platform={option.id}
                                    className={cn(
                                      selected &&
                                        `ring-2 ring-offset-2 ring-offset-card ${option.ringClassName}`,
                                    )}
                                  />
                                  <span
                                    className={cn(
                                      "text-xs font-medium",
                                      selected ? "text-primary" : "text-muted",
                                    )}
                                  >
                                    {option.id === "custom"
                                      ? "기타"
                                      : option.label.replace("Google ", "")}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {form.platform === "custom" ? (
                            hasExtraLocation(form.platform, form.location) ? (
                              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border py-1 pl-2.5 pr-1.5">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" />
                                <span className="truncate text-sm text-foreground">
                                  {form.location}
                                </span>
                                <button
                                  type="button"
                                  className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
                                  aria-label="장소 지우기"
                                  onClick={() => {
                                    update("location", "");
                                    setShowPlaceEditor(false);
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ) : showPlaceEditor ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                  {PLACE_PRESETS.map((place) => (
                                    <Chip
                                      key={place}
                                      active={form.location === place}
                                      onClick={() => {
                                        update("location", place);
                                        setShowPlaceEditor(false);
                                      }}
                                    >
                                      {place}
                                    </Chip>
                                  ))}
                                </div>
                                <input
                                  value={form.location}
                                  onChange={(e) =>
                                    update("location", e.target.value)
                                  }
                                  placeholder="다른 장소 이름"
                                  aria-label="장소 이름"
                                  autoFocus
                                  className={outlinedFieldClass}
                                />
                              </div>
                            ) : (
                              <AddAction
                                label="장소 추가"
                                onClick={() => setShowPlaceEditor(true)}
                              >
                                <MapPin className="h-3.5 w-3.5" />
                              </AddAction>
                            )
                          ) : hasExtraLocation(form.platform, form.location) ? (
                            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border py-1 pl-2.5 pr-1.5">
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                              <span className="truncate text-sm text-foreground">
                                {form.location}
                              </span>
                              <button
                                type="button"
                                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
                                aria-label="링크 지우기"
                                onClick={() => {
                                  update(
                                    "location",
                                    platformDefaultLocation(form.platform),
                                  );
                                  setShowLinkEditor(false);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : showLinkEditor ? (
                            <input
                              value={linkDraft}
                              onChange={(e) => setLinkDraft(e.target.value)}
                              onBlur={() => {
                                const next = linkDraft.trim();
                                if (next) update("location", next);
                                setShowLinkEditor(false);
                                setLinkDraft("");
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const next = linkDraft.trim();
                                  if (next) update("location", next);
                                  setShowLinkEditor(false);
                                  setLinkDraft("");
                                }
                              }}
                              placeholder="회의 링크 붙여넣기"
                              aria-label="회의 링크"
                              inputMode="url"
                              autoComplete="url"
                              autoFocus
                              className={outlinedFieldClass}
                            />
                          ) : (
                            <AddAction
                              label="링크 추가"
                              onClick={() => {
                                setLinkDraft("");
                                setShowLinkEditor(true);
                              }}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </AddAction>
                          )}
                        </div>
                      ) : (
                        <div className="flex min-w-0 items-center gap-2.5">
                          <MeetingPlatformIcon
                            platform={resolvePlatform(view)}
                            size="sm"
                          />
                          <p className="min-w-0 text-sm text-foreground">
                            {view.location}
                          </p>
                        </div>
                      )}
                    </DetailRow>
                  </div>

                  <div className="py-4">
                    <DetailRow
                      label="주최"
                      align={editing ? "start" : "center"}
                    >
                      {editing ? (
                        <div className="min-w-0 space-y-2">
                          <button
                            type="button"
                            onClick={() => setShowOrganizerPick((v) => !v)}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-surface"
                            aria-expanded={showOrganizerPick}
                            aria-label="주최자 변경"
                          >
                            <PersonAvatar name={form.organizer} size="sm" />
                            <span className="text-sm text-foreground">
                              {form.organizer}
                            </span>
                            <span className="text-xs font-medium text-muted">
                              변경
                            </span>
                          </button>
                          {showOrganizerPick ? (
                            <div
                              className="flex flex-wrap gap-2"
                              role="listbox"
                              aria-label="주최자 선택"
                            >
                              {WORKSPACE_PEOPLE.map((person) => {
                                const active = form.organizer === person.name;
                                return (
                                  <button
                                    key={person.name}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    onClick={() => {
                                      update("organizer", person.name);
                                      setShowOrganizerPick(false);
                                      if (
                                        !form.participants.includes(person.name)
                                      ) {
                                        update("participants", [
                                          person.name,
                                          ...form.participants,
                                        ]);
                                      }
                                    }}
                                    className={cn(
                                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 transition-colors",
                                      active
                                        ? "border-primary bg-primary-soft text-primary"
                                        : "border-border hover:bg-surface",
                                    )}
                                  >
                                    <PersonAvatar
                                      name={person.name}
                                      size="sm"
                                      className="border-transparent"
                                    />
                                    <span className="text-xs font-medium">
                                      {person.name}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-2">
                          <PersonAvatar name={view.organizer} size="sm" />
                          <p className="text-sm text-foreground">
                            {view.organizer}
                          </p>
                        </div>
                      )}
                    </DetailRow>
                  </div>

                  <div className="py-4">
                    <DetailRow
                      label="참석자"
                      align={editing ? "start" : "center"}
                    >
                      {editing ? (
                        <div className="min-w-0 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {form.participants.map((name) => (
                              <span
                                key={name}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-1.5"
                              >
                                <PersonAvatar name={name} size="sm" />
                                <span className="max-w-[5.5rem] truncate text-xs font-medium text-foreground">
                                  {name}
                                </span>
                                <button
                                  type="button"
                                  className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
                                  aria-label={`${name} 제거`}
                                  onClick={() =>
                                    update(
                                      "participants",
                                      form.participants.filter(
                                        (p) => p !== name,
                                      ),
                                    )
                                  }
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                            <AddAction
                              label="추가"
                              onClick={() =>
                                setShowParticipantAdd((v) => !v)
                              }
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </AddAction>
                          </div>

                          {showParticipantAdd ? (
                            <div className="space-y-2.5">
                              <p className="text-xs font-medium text-muted">
                                팀원 선택
                              </p>
                              <div
                                className="flex flex-wrap gap-2"
                                role="group"
                                aria-label="참석자 후보"
                              >
                                {WORKSPACE_PEOPLE.map((person) => {
                                  const selected = form.participants.includes(
                                    person.name,
                                  );
                                  return (
                                    <button
                                      key={person.name}
                                      type="button"
                                      aria-pressed={selected}
                                      onClick={() =>
                                        toggleParticipant(person.name)
                                      }
                                      className={cn(
                                        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border py-1 pl-1 pr-2.5 transition-colors",
                                        selected
                                          ? "border-primary bg-primary-soft text-primary"
                                          : "border-border hover:bg-surface",
                                      )}
                                    >
                                      <PersonAvatar
                                        name={person.name}
                                        size="sm"
                                        className="border-transparent"
                                      />
                                      <span className="max-w-[4rem] truncate text-xs font-medium">
                                        {person.name}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                              {showCustomParticipant ? (
                                <div className="flex gap-2">
                                  <input
                                    value={participantDraft}
                                    onChange={(e) =>
                                      setParticipantDraft(e.target.value)
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        addParticipant(participantDraft);
                                      }
                                    }}
                                    placeholder="이름 입력"
                                    aria-label="참석자 이름 직접 입력"
                                    autoFocus
                                    className={outlinedFieldClass}
                                  />
                                  <Button
                                    type="button"
                                    size="icon"
                                    className="h-12 w-12 shrink-0"
                                    onClick={() =>
                                      addParticipant(participantDraft)
                                    }
                                    aria-label="직접 입력 추가"
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="cursor-pointer text-xs font-medium text-muted hover:text-foreground"
                                  onClick={() =>
                                    setShowCustomParticipant(true)
                                  }
                                >
                                  목록에 없는 사람 추가
                                </button>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {view.participants.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-2"
                            >
                              <PersonAvatar name={name} size="sm" />
                              <span className="max-w-[6.5rem] truncate text-xs font-medium text-foreground">
                                {name}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </DetailRow>
                  </div>
                </section>

                <section className="border-t border-border py-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium text-muted">안건</h3>
                    {editing ? (
                      <button
                        type="button"
                        onClick={addAgendaRow}
                        className="cursor-pointer text-xs font-medium text-primary hover:underline"
                      >
                        추가
                      </button>
                    ) : null}
                  </div>

                  {editing ? (
                    form.agenda.length === 0 ? (
                      <p className="text-xs text-muted">
                        미리 적어 두면 회의 때 흐름을 잡기 좋아요.
                      </p>
                    ) : (
                      <ol className="space-y-2">
                        {form.agenda.map((line, index) => (
                          <li
                            key={`agenda-edit-${index}`}
                            className="flex items-center gap-2"
                          >
                            <span className="w-4 shrink-0 text-sm tabular-nums text-muted-2">
                              {index + 1}.
                            </span>
                            <input
                              value={line}
                              onChange={(e) => {
                                const next = [...form.agenda];
                                next[index] = e.target.value;
                                update("agenda", next);
                              }}
                              className={cn(
                                outlinedFieldClass,
                                "min-w-0 flex-1",
                              )}
                              placeholder="안건 내용"
                              aria-label={`안건 ${index + 1}`}
                            />
                            <button
                              type="button"
                              className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-masked hover:bg-masked-soft"
                              aria-label={`안건 ${index + 1} 삭제`}
                              onClick={() =>
                                update(
                                  "agenda",
                                  form.agenda.filter((_, i) => i !== index),
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                            </button>
                          </li>
                        ))}
                      </ol>
                    )
                  ) : view.agenda.length > 0 ? (
                    <ol className="space-y-2">
                      {view.agenda.map((line, index) => (
                        <li
                          key={`${view.id}-agenda-${index}`}
                          className="flex gap-2 text-sm text-foreground"
                        >
                          <span className="shrink-0 tabular-nums text-muted-2">
                            {index + 1}.
                          </span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted">안건 없음</p>
                  )}
                </section>

                <section className="border-t border-border py-4">
                  <h3 className="mb-3 text-xs font-medium text-muted">메모</h3>
                  {editing ? (
                    <textarea
                      value={form.notes}
                      onChange={(e) => update("notes", e.target.value)}
                      rows={4}
                      className={cn(
                        outlinedFieldClass,
                        "h-auto min-h-[96px] resize-y py-3",
                      )}
                      placeholder="참고할 내용, 링크 등"
                    />
                  ) : (
                    <p className="text-sm leading-relaxed text-foreground">
                      {view.notes || (
                        <span className="text-muted">메모 없음</span>
                      )}
                    </p>
                  )}
                </section>
              </div>
            </div>

            {/* M3 action bar: text/outline left, filled primary right */}
            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-3 py-3 sm:px-4">
              {editing ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-w-[4.5rem] cursor-pointer"
                    onClick={cancelEdit}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    className="min-w-[5rem] cursor-pointer"
                    onClick={handleSave}
                  >
                    {isCreate ? "추가" : "저장"}
                  </Button>
                </>
              ) : (
                <>
                  {onDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mr-auto cursor-pointer text-masked hover:bg-masked-soft hover:text-masked"
                      onClick={() => {
                        if (!window.confirm("이 일정을 삭제할까요?")) return;
                        onDelete(view);
                        onClose();
                      }}
                    >
                      삭제
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="min-w-[4.5rem] cursor-pointer"
                    onClick={startEdit}
                  >
                    수정
                  </Button>
                  <Button asChild className="min-w-[5.5rem] cursor-pointer">
                    <Link href={view.href} onClick={onClose}>
                      회의 시작
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </>
        ) : null}
      </aside>
    </>,
    document.body,
  );
}
