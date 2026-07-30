"use client";

import {
  Link2,
  MapPin,
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
  dateLabelToIso,
  formatUpcomingScheduleSummary,
  isoToUpcomingDateLabel,
  relativeUpcomingHint,
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
          "w-16 shrink-0 text-base font-medium leading-5 text-muted md:w-14 md:text-xs",
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
      className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 text-base font-medium text-muted transition-colors hover:border-foreground/25 hover:bg-surface hover:text-foreground md:h-9 md:px-3 md:text-xs"
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
      <span className="shrink-0 text-base text-muted md:text-sm">분</span>
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
    <div className="min-w-0 space-y-2">
      {/* 라벨 옆에 현재 값을 바로 보여줘 아래 문구와 중복 표기하지 않는다 */}
      <div className="flex items-center justify-between gap-2">
        <p className="text-base font-medium text-muted md:text-xs">소요</p>
        <p className="text-base font-semibold tabular-nums text-foreground md:text-sm">
          {label}
        </p>
      </div>

      {/* 방식·프리셋·직접 입력을 한 카드로 묶어 따로 노는 느낌을 없앤다 */}
      <div className="min-w-0 space-y-3 rounded-xl border border-border p-3">
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
                  "h-11 cursor-pointer rounded-md px-4 text-base font-medium transition-colors md:h-8 md:px-3 md:text-xs",
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

        <div className="space-y-1.5 border-t border-border pt-3">
          <p className="text-sm font-medium text-muted md:text-xs">
            직접 입력
          </p>
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
              <span className="text-base text-muted md:text-sm" aria-hidden>
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

/** M3 outlined text field */
const outlinedFieldClass =
  "flex h-12 w-full rounded-md border border-border bg-transparent px-3.5 text-base text-foreground placeholder:text-muted-2 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary md:text-sm";

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
        "inline-flex h-11 cursor-pointer items-center rounded-lg px-3.5 text-base font-medium transition-colors md:h-8 md:px-2.5 md:text-xs",
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
      <p className="text-base font-medium tabular-nums tracking-tight text-foreground md:text-sm">
        {summary}
      </p>
      {hint ? (
        <p className="mt-1 text-sm text-muted md:mt-0.5 md:text-xs">{hint}</p>
      ) : null}
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
        <p className="mb-1.5 text-base font-medium text-muted">날짜</p>
        <MonthDayCalendar
          selectedIso={selectedIso}
          minIso={todayIso}
          onSelect={(iso) => onDateChange(isoToUpcomingDateLabel(iso))}
        />
      </div>

      <label className="block min-w-0">
        <span className="mb-1 block text-base font-medium text-muted">시작</span>
        <input
          type="time"
          value={toTimeInputValue(timeLabel)}
          onChange={(e) => onTimeChange(fromTimeInputValue(e.target.value))}
          className={cn(
            outlinedFieldClass,
            "h-14 max-w-[10.5rem] cursor-pointer text-base font-semibold tabular-nums md:h-11",
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
  const sheetTitle = isCreate
    ? "예정 회의 추가"
    : editing
      ? "예정 회의 수정"
      : "예정 회의";

  if (!open || !view || !data) return null;

  return (
    <>
      {/* M3: 모바일은 full-screen dialog라 스크림 없음. md+ side sheet만 스크림. */}
      <div
        className={cn(
          "fixed inset-0 z-[70] hidden bg-black/40 transition-opacity duration-200 md:block",
          "opacity-100",
        )}
        onClick={onClose}
        aria-hidden
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={sheetTitle}
        className={cn(
          // 모바일: edge-to-edge full-screen dialog. md+: 우측 side sheet.
          "fixed inset-0 z-[70] flex h-dvh w-full flex-col overflow-hidden bg-card transition-transform duration-200 ease-out",
          "md:inset-y-0 md:right-0 md:left-auto md:max-w-md md:shadow-[0_0_40px_rgba(17,24,46,0.12)]",
          "translate-x-0",
        )}
      >
        {/* M3 top app bar: X(취소/닫기) 좌측, 편집 중엔 저장 액션 우측(모바일 full-screen dialog 규칙) */}
        <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2 sm:px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              TOUCH_ICON_BUTTON,
              "shrink-0 cursor-pointer text-foreground/70 hover:bg-surface hover:text-foreground",
            )}
            onClick={editing ? cancelEdit : onClose}
            aria-label={editing ? "편집 취소" : "상세 닫기"}
          >
            <X />
          </Button>
          <div className="min-w-0 flex-1 px-1">
            <p className="truncate text-base font-medium text-foreground">
              {sheetTitle}
            </p>
          </div>
          {editing ? (
            <Button
              type="button"
              className={cn(
                TOUCH_BUTTON,
                "shrink-0 cursor-pointer px-4 text-base md:hidden",
              )}
              onClick={handleSave}
            >
              {isCreate ? "추가" : "저장"}
            </Button>
          ) : null}
          {/* 보기 모드 수정, 삭제는 하단 액션 바에만 둔다. 헤더 중복 시 같은 기능이 위아래로 겹침 */}
        </div>

        {view && data ? (
          <>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
              <div className="min-w-0 space-y-0 px-4 py-2 sm:px-5">
                {/* Title */}
                <div className="border-b border-border py-4">
                  {editing ? (
                    <input
                      value={data.title}
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
                        dateLabel={data.dateLabel}
                        timeLabel={data.timeLabel}
                        duration={data.duration}
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
                                    "inline-flex min-h-11 min-w-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg px-2 py-1.5 transition-colors",
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
                                      "text-sm font-medium md:text-xs",
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
                                  className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground md:h-7 md:w-7"
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
                                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground md:h-7 md:w-7"
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
                            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-border py-1 pl-1 pr-3 transition-colors hover:bg-surface md:min-h-0"
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
                                      "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pl-1 pr-2.5 transition-colors md:min-h-0",
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
                                    <span className="text-base font-medium leading-5 md:text-sm">
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
                                className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border py-1.5 pl-1 pr-1 md:min-h-0"
                              >
                                <PersonAvatar name={name} size="sm" />
                                <span className="max-w-[8rem] truncate text-base font-medium leading-5 text-foreground md:text-sm">
                                  {name}
                                </span>
                                <button
                                  type="button"
                                  className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-surface hover:text-foreground md:h-6 md:w-6"
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
                                        "inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border py-1.5 pl-1 pr-2.5 transition-colors md:min-h-0",
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
                                      <span className="text-base font-medium leading-5 md:text-sm">
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
                                  className="min-h-11 cursor-pointer text-base font-medium text-muted hover:text-foreground md:min-h-0 md:text-xs"
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
                              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border py-1.5 pl-1 pr-2.5 md:min-h-0"
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
                        className="min-h-11 cursor-pointer text-base font-medium text-primary hover:underline md:min-h-0 md:text-xs"
                      >
                        추가
                      </button>
                    ) : null}
                  </div>

                  {editing ? (
                    data.agenda.length === 0 ? (
                      <p className="text-base text-muted md:text-xs">
                        미리 적어 두면 회의 때 흐름을 잡기 좋아요.
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
                              className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-masked hover:bg-masked-soft md:h-10 md:w-10"
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
            </div>

            {/* M3 action bar: 편집 중엔 저장이 상단으로 옮겨가서 모바일에서 숨김(키보드 겹침 방지). 데스크탑 side sheet는 유지. */}
            <div
              className={cn(
                "shrink-0 border-t border-border bg-card px-4 pt-3",
                "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
                "sm:px-5 sm:pb-4",
                editing && "hidden md:block",
              )}
            >
              {editing ? (
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    className={cn(
                      TOUCH_BUTTON,
                      "w-full cursor-pointer text-base sm:w-auto sm:min-w-[4.5rem] sm:text-sm",
                    )}
                    onClick={cancelEdit}
                  >
                    취소
                  </Button>
                  <Button
                    type="button"
                    className={cn(
                      TOUCH_BUTTON,
                      "w-full cursor-pointer text-base sm:w-auto sm:min-w-[5rem] sm:text-sm",
                    )}
                    onClick={handleSave}
                  >
                    {isCreate ? "추가" : "저장"}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
                  {onDelete ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className={cn(
                        TOUCH_BUTTON,
                        "cursor-pointer justify-self-stretch text-base text-masked hover:bg-masked-soft hover:text-masked sm:mr-auto sm:w-auto sm:text-sm",
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
                    type="button"
                    variant="outline"
                    className={cn(
                      TOUCH_BUTTON,
                      "cursor-pointer justify-self-stretch text-base sm:w-auto sm:min-w-[4.5rem] sm:text-sm",
                      !onDelete && "col-span-2 sm:col-span-1",
                    )}
                    onClick={startEdit}
                  >
                    수정
                  </Button>
                  <Button
                    asChild
                    className={cn(
                      TOUCH_BUTTON,
                      "col-span-2 w-full cursor-pointer text-base sm:col-span-1 sm:w-auto sm:min-w-[5.5rem] sm:text-sm",
                    )}
                  >
                    <Link href={view.href} onClick={onClose}>
                      회의 시작
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}
