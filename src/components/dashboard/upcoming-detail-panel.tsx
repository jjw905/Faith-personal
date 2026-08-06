"use client";

import {
  Link2,
  MapPin,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthDayCalendar } from "@/components/meetings/month-day-calendar";
import {
  MeetingRecordPortal,
} from "@/components/meetings/meeting-record-layout";
import {
  dateLabelToIso,
  formatUpcomingScheduleSummary,
  isoToUpcomingDateLabel,
  relativeUpcomingHint,
  resolveUpcomingListDate,
  seoulDateKey,
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
  TEAM_ONLINE_LOCATION_PRESETS,
  resolveWorkspacePerson,
  WORKSPACE_PEOPLE,
  type UpcomingItem,
} from "@/lib/workspace-data";
import { TOUCH_BUTTON, TOUCH_ICON_BUTTON } from "@/lib/touch-target";
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
          "w-[3.25rem] shrink-0 text-base font-semibold leading-6 text-muted",
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
      className="inline-flex h-12 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full border border-dashed border-border px-3.5 text-base font-semibold leading-none text-muted transition-colors hover:border-foreground/25 hover:bg-surface hover:text-foreground"
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
const DURATION_MAX = 120;

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
    <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
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
          "h-14 min-w-0 flex-1 px-3 text-center text-lg font-semibold tabular-nums sm:w-[5.5rem] sm:flex-none",
        )}
        aria-label={ariaLabel}
      />
      <span className="shrink-0 text-base font-medium text-muted">분</span>
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
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-semibold text-muted">소요</p>
        <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
          {label}
        </p>
      </div>

      <div className="min-w-0 space-y-3 rounded-2xl border border-border p-3.5">
        <div
          className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1"
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
                  "inline-flex h-12 cursor-pointer items-center justify-center rounded-lg text-base font-semibold transition-colors",
                  active
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted hover:bg-card/70 hover:text-foreground",
                )}
              >
                {text}
              </button>
            );
          })}
        </div>

        <div
          className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
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
                className="w-full justify-center sm:w-auto"
              >
                {preset}
              </Chip>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-base font-semibold text-muted">직접 입력</p>
          {mode === "exact" ? (
            <MinuteInput
              value={minMins}
              onChange={applyExact}
              ariaLabel="소요 분"
            />
          ) : (
            <div className="flex items-center gap-2">
              <MinuteInput
                value={minMins}
                onChange={(mins) => applyRange(mins, maxMins)}
                ariaLabel="최소 소요 분"
              />
              <span className="shrink-0 text-lg font-semibold text-muted" aria-hidden>
                ~
              </span>
              <MinuteInput
                value={maxMins}
                onChange={(mins) => applyRange(minMins, mins)}
                ariaLabel="최대 소요 분"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** M3 outlined text field — 모바일 본문/입력 16px+ */
const outlinedFieldClass =
  "flex h-14 w-full rounded-xl border border-border bg-transparent px-3.5 text-base text-foreground placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

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
        "inline-flex h-12 cursor-pointer items-center justify-center rounded-xl px-3.5 text-base font-semibold leading-none transition-colors",
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
      <p className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
        {summary}
      </p>
      {hint ? (
        <p className="mt-1 text-base font-medium text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** M3: 월 달력 + 시간/소요. 모바일에서 시간·소요를 크게 잡기 쉽게. */
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
    <div className="min-w-0 space-y-5">
      <ScheduleSummary
        dateLabel={dateLabel}
        timeLabel={timeLabel}
        duration={duration}
        className="rounded-2xl border border-border px-4 py-3.5"
      />

      <div className="min-w-0">
        <p className="mb-2 text-base font-semibold text-muted">날짜</p>
        <MonthDayCalendar
          selectedIso={selectedIso}
          minIso={todayIso}
          onSelect={(iso) => onDateChange(isoToUpcomingDateLabel(iso))}
        />
      </div>

      <label className="block min-w-0">
        <span className="mb-2 block text-base font-semibold text-muted">
          시작 시간
        </span>
        <input
          type="time"
          value={toTimeInputValue(timeLabel)}
          onChange={(e) => onTimeChange(fromTimeInputValue(e.target.value))}
          className={cn(
            outlinedFieldClass,
            "h-14 w-full cursor-pointer text-lg font-semibold tabular-nums tracking-tight",
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

function upcomingHeaderLabel(
  dateLabel: string,
  timeLabel: string,
  duration: string,
) {
  const { label } = resolveUpcomingListDate(dateLabel);
  const time = timeLabel.trim() || "--:--";
  const dur = duration.trim();
  if (dur && dur !== "—") return `${label} · ${time} · ${dur}`;
  return `${label} · ${time}`;
}

/** 회의 기록 상세와 같은 페이지 셸(포털). MeetingRecordPortal만 사용. */
function UpcomingAnalysisPageShell({
  ariaLabel,
  onBack,
  headerLabel,
  trailing,
  leading,
  title,
  children,
  footer,
}: {
  ariaLabel: string;
  onBack: () => void;
  headerLabel: string;
  trailing?: ReactNode;
  leading?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <MeetingRecordPortal
      open
      ariaLabel={ariaLabel}
      onBack={onBack}
      leading={leading}
      headerCenter={
        <time
          className="block truncate text-center text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl md:text-xl"
          title={headerLabel}
        >
          {headerLabel}
        </time>
      }
      trailing={trailing}
      title={title}
      footer={footer}
    >
      {children}
    </MeetingRecordPortal>
  );
}

/** 보기 본문 — 일정·제목은 셸 헤더. 장소·참석·안건·메모만. */
function UpcomingDetailViewBody({ item }: { item: UpcomingItem }) {
  const platform = resolvePlatform(item);
  const hasAgenda = item.agenda.length > 0;
  const hasNotes = Boolean(item.notes.trim());
  const hasPeople = item.participants.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-lg font-medium text-muted">
          <MeetingPlatformIcon platform={platform} size="sm" />
          <span className="min-w-0 truncate">{item.location}</span>
        </div>
        {hasPeople ? (
          <div
            className="flex shrink-0 -space-x-2"
            aria-label={`참석자 ${item.participants.length}명`}
          >
            {item.participants.slice(0, 3).map((name) => (
              <PersonAvatar key={name} name={name} size="sm" />
            ))}
          </div>
        ) : null}
      </div>

      {hasAgenda ? (
        <div className="space-y-2.5">
          <p className="text-base font-semibold text-muted">안건</p>
          <ol className="space-y-2.5">
            {item.agenda.map((line, index) => (
              <li
                key={`${item.id}-agenda-${index}`}
                className="flex gap-2.5 text-lg leading-snug text-foreground"
              >
                <span className="shrink-0 tabular-nums text-muted-2">
                  {index + 1}.
                </span>
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {hasNotes ? (
        <div className="space-y-2.5">
          <p className="text-base font-semibold text-muted">메모</p>
          <p className="text-lg leading-relaxed text-foreground">{item.notes}</p>
        </div>
      ) : null}
    </div>
  );
}

export function UpcomingDetailPanel({
  item,
  open,
  onClose,
  onSave,
  onDelete,
  mode = "view",
}: UpcomingDetailPanelProps) {
  const isCreate = mode === "create";
  const [editing, setEditing] = useState(isCreate);
  const [form, setForm] = useState<FormState | null>(() =>
    item ? toForm(item) : null,
  );
  const [participantDraft, setParticipantDraft] = useState("");
  const [linkDraft, setLinkDraft] = useState("");
  const [showLinkEditor, setShowLinkEditor] = useState(false);
  const [showPlaceEditor, setShowPlaceEditor] = useState(false);
  const [showParticipantAdd, setShowParticipantAdd] = useState(false);
  const [showOrganizerPick, setShowOrganizerPick] = useState(false);
  const [showCustomParticipant, setShowCustomParticipant] = useState(false);

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
  const data = editing
    ? form
    : view
      ? form ?? toForm(view)
      : null;
  if (!open || !view || !data) return null;

  const dialogLabel = isCreate
    ? "일정 추가"
    : editing
      ? "일정 수정"
      : view.title;

  if (!editing) {
    return (
      <UpcomingAnalysisPageShell
        ariaLabel={dialogLabel}
        onBack={onClose}
        headerLabel={upcomingHeaderLabel(
          view.dateLabel,
          view.timeLabel,
          view.duration,
        )}
        leading={
          <span
            className="pointer-events-none invisible inline-flex h-12 w-12 shrink-0 md:h-9 md:w-9"
            aria-hidden
          />
        }
        trailing={
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground md:h-9 md:w-9"
            title="일정 수정"
            aria-label="일정 수정"
          >
            <Pencil className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={2} />
          </button>
        }
        title={
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {view.title}
          </h1>
        }
        footer={
          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                className={cn(
                  TOUCH_BUTTON,
                  "inline-flex w-full cursor-pointer items-center justify-center text-base leading-none text-masked hover:bg-masked-soft hover:text-masked sm:mr-auto sm:w-auto",
                )}
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
              asChild
              className={cn(
                TOUCH_BUTTON,
                "col-span-2 inline-flex w-full cursor-pointer items-center justify-center text-base leading-none sm:col-span-1 sm:ml-auto sm:w-auto sm:min-w-[5.5rem]",
                !onDelete && "col-span-2",
              )}
            >
              <Link href={view.href} onClick={onClose}>
                회의 시작
              </Link>
            </Button>
          </div>
        }
      >
        <UpcomingDetailViewBody item={view} />
      </UpcomingAnalysisPageShell>
    );
  }

  return (
    <UpcomingAnalysisPageShell
      ariaLabel={dialogLabel}
      onBack={cancelEdit}
      headerLabel={upcomingHeaderLabel(
        data.dateLabel,
        data.timeLabel,
        data.duration,
      )}
      leading={
        <Button
          type="button"
          className={cn(
            TOUCH_BUTTON,
            "pointer-events-none invisible inline-flex items-center justify-center px-4 text-base leading-none",
          )}
          tabIndex={-1}
          aria-hidden
        >
          {isCreate ? "추가" : "저장"}
        </Button>
      }
      trailing={
        <Button
          type="button"
          className={cn(
            TOUCH_BUTTON,
            "inline-flex cursor-pointer items-center justify-center px-4 text-base leading-none",
          )}
          onClick={handleSave}
        >
          {isCreate ? "추가" : "저장"}
        </Button>
      }
      title={
        <input
          value={data.title}
          onChange={(e) => update("title", e.target.value)}
          className="w-full border-b border-foreground bg-transparent py-0.5 text-2xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted-2"
          placeholder="회의 제목"
          aria-label="회의 제목"
        />
      }
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            className={cn(
              TOUCH_BUTTON,
              "inline-flex w-full cursor-pointer items-center justify-center text-base leading-none sm:w-auto sm:min-w-[4.5rem]",
            )}
            onClick={cancelEdit}
          >
            취소
          </Button>
          <Button
            type="button"
            className={cn(
              TOUCH_BUTTON,
              "inline-flex w-full cursor-pointer items-center justify-center text-base leading-none sm:w-auto sm:min-w-[5rem]",
            )}
            onClick={handleSave}
          >
            {isCreate ? "추가" : "저장"}
          </Button>
        </div>
      }
    >
      <div className="min-w-0 space-y-0">
                <section className="divide-y divide-border">
                  <div className="py-4">
                      <ScheduleFields
                        dateLabel={data.dateLabel}
                        timeLabel={data.timeLabel}
                        duration={data.duration}
                        onDateChange={(next) => update("dateLabel", next)}
                        onTimeChange={(next) => update("timeLabel", next)}
                        onDurationChange={(next) => update("duration", next)}
                      />
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
                              const selected = data.platform === option.id;
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
                                    "inline-flex min-h-12 min-w-12 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-2 py-1.5 transition-colors",
                                    selected
                                      ? "bg-primary-soft text-primary"
                                      : "text-muted hover:bg-surface hover:text-foreground",
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
                                      "text-sm font-semibold leading-none",
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

                          {data.platform === "custom" ? (
                            hasExtraLocation(data.platform, data.location) ? (
                              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border py-1 pl-2.5 pr-1">
                                <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" />
                                <span className="truncate text-base text-foreground md:text-sm">
                                  {data.location}
                                </span>
                                <button
                                  type="button"
                                  className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
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
                                  {(item.workspace === "team"
                                    ? TEAM_ONLINE_LOCATION_PRESETS
                                    : PLACE_PRESETS
                                  ).map((place) => (
                                    <Chip
                                      key={place}
                                      active={data.location === place}
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
                                  value={data.location}
                                  onChange={(e) =>
                                    update("location", e.target.value)
                                  }
                                  placeholder={
                                    item.workspace === "team"
                                      ? "화상 링크 또는 플랫폼"
                                      : "다른 장소 이름"
                                  }
                                  aria-label={
                                    item.workspace === "team"
                                      ? "온라인 위치"
                                      : "장소 이름"
                                  }
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
                          ) : hasExtraLocation(data.platform, data.location) ? (
                            <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-border py-1 pl-2.5 pr-1">
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                              <span className="truncate text-base text-foreground md:text-sm">
                                {data.location}
                              </span>
                              <button
                                type="button"
                                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
                                aria-label="링크 지우기"
                                onClick={() => {
                                  update(
                                    "location",
                                    platformDefaultLocation(data.platform),
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
                        <div className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-border py-1.5 pl-1 pr-2.5">
                          <MeetingPlatformIcon
                            platform={resolvePlatform(view)}
                            size="sm"
                          />
                          <p className="min-w-0 truncate text-base font-medium leading-5 text-foreground md:text-sm">
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
                            className="inline-flex min-h-12 cursor-pointer items-center gap-1.5 rounded-full border border-border py-1.5 pl-1 pr-3 transition-colors hover:bg-surface"
                            aria-expanded={showOrganizerPick}
                            aria-label="주최자 변경"
                          >
                            <PersonAvatar name={data.organizer} size="sm" />
                            <span className="text-base text-foreground md:text-sm">
                              {data.organizer}
                            </span>
                            <span className="text-sm font-medium text-muted md:text-xs">
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
                                const active = data.organizer === person.name;
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
                                        !data.participants.includes(person.name)
                                      ) {
                                        update("participants", [
                                          person.name,
                                          ...data.participants,
                                        ]);
                                      }
                                    }}
                                    className={cn(
                                      "inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3 transition-colors",
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
                                    <span className="text-base font-semibold leading-none">
                                      {person.name}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-border py-1.5 pl-1 pr-2.5">
                          <PersonAvatar name={view.organizer} size="sm" />
                          <p className="text-base font-medium leading-5 text-foreground md:text-sm">
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
                            {data.participants.map((name) => (
                              <span
                                key={name}
                                className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border border-border py-1.5 pl-1.5 pr-1"
                              >
                                <PersonAvatar name={name} size="sm" />
                                <span className="max-w-[8rem] truncate text-base font-medium leading-5 text-foreground md:text-sm">
                                  {name}
                                </span>
                                <button
                                  type="button"
                                  className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground"
                                  aria-label={`${name} 제거`}
                                  onClick={() =>
                                    update(
                                      "participants",
                                      data.participants.filter(
                                        (p) => p !== name,
                                      ),
                                    )
                                  }
                                >
                                  <X className="h-3.5 w-3.5 md:h-3 md:w-3" />
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
                            <div className="space-y-2.5 rounded-xl border border-border p-3">
                              <p className="text-sm font-medium text-muted md:text-xs">
                                팀원 선택
                              </p>
                              <div
                                className="flex flex-wrap gap-2"
                                role="group"
                                aria-label="참석자 후보"
                              >
                                {WORKSPACE_PEOPLE.map((person) => {
                                  const selected = data.participants.includes(
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
                                      "inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pl-1.5 pr-3 transition-colors",
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
                                      <span className="text-base font-semibold leading-none">
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
                                  className="inline-flex min-h-12 cursor-pointer items-center rounded-lg px-2 text-base font-semibold text-muted transition-colors hover:bg-surface hover:text-foreground"
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
                              className="inline-flex min-h-12 shrink-0 items-center gap-1.5 rounded-full border border-border py-1.5 pl-1.5 pr-3"
                            >
                              <PersonAvatar name={name} size="sm" />
                              <span className="max-w-[8rem] truncate text-base font-medium leading-5 text-foreground md:text-sm">
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
                    <h3 className="text-base font-medium text-muted md:text-xs">안건</h3>
                    {editing ? (
                      <button
                        type="button"
                        onClick={addAgendaRow}
                        className="inline-flex min-h-12 cursor-pointer items-center rounded-lg px-2 text-base font-semibold text-primary transition-colors hover:bg-primary-soft"
                      >
                        추가
                      </button>
                    ) : null}
                  </div>

                  {editing ? (
                    data.agenda.length === 0 ? (
                      <p className="text-base text-muted md:text-xs">
                        미리 적어 두면 회의 때 흐름을 잡기 좋습니다.
                      </p>
                    ) : (
                      <ol className="space-y-2">
                        {data.agenda.map((line, index) => (
                          <li
                            key={`agenda-edit-${index}`}
                            className="flex items-center gap-2"
                          >
                            <span className="w-4 shrink-0 text-base tabular-nums text-muted-2 md:text-sm">
                              {index + 1}.
                            </span>
                            <input
                              value={line}
                              onChange={(e) => {
                                const next = [...data.agenda];
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
                              className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-masked hover:bg-masked-soft"
                              aria-label={`안건 ${index + 1} 삭제`}
                              onClick={() =>
                                update(
                                  "agenda",
                                  data.agenda.filter((_, i) => i !== index),
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
                          className="flex gap-2 text-base text-foreground md:text-sm"
                        >
                          <span className="shrink-0 tabular-nums text-muted-2">
                            {index + 1}.
                          </span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-base text-muted md:text-sm">안건 없음</p>
                  )}
                </section>

                <section className="border-t border-border py-4">
                  <h3 className="mb-3 text-base font-medium text-muted md:text-xs">메모</h3>
                  {editing ? (
                    <textarea
                      value={data.notes}
                      onChange={(e) => update("notes", e.target.value)}
                      rows={4}
                      className={cn(
                        outlinedFieldClass,
                        "h-auto min-h-[96px] resize-y py-3",
                      )}
                      placeholder="참고할 내용, 링크 등"
                    />
                  ) : (
                    <p className="text-base leading-relaxed text-foreground md:text-sm">
                      {view.notes || (
                        <span className="text-muted">메모 없음</span>
                      )}
                    </p>
                  )}
                </section>
      </div>
    </UpcomingAnalysisPageShell>
  );
}
