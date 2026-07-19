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
import { useEffect, useRef, useState, type ReactNode } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  dateLabelToIso,
  formatUpcomingDateLabel,
  isoToUpcomingDateLabel,
  listUpcomingDays,
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
    duration: item.duration,
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

function AddIconButton({
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
      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border bg-card px-3 text-xs font-semibold text-muted transition-colors hover:border-foreground/30 hover:bg-surface-2 hover:text-foreground"
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

  return {
    ...item,
    title: form.title.trim() || item.title,
    dateLabel: form.dateLabel.trim() || item.dateLabel,
    timeLabel: form.timeLabel.trim() || item.timeLabel,
    duration: form.duration.trim() || item.duration,
    location,
    platform: form.platform,
    organizer: form.organizer.trim() || item.organizer,
    participants: participants.length ? participants : item.participants,
    agenda: agenda.length ? agenda : item.agenda,
    notes: form.notes.trim(),
    when: `${form.dateLabel.trim()} ${form.timeLabel.trim()}, ${form.duration.trim()}`,
  };
}

const QUICK_DATE_OFFSETS = [0, 1, 2] as const;
const DURATION_PRESETS = [
  "15분",
  "30분",
  "40분",
  "45분",
  "1시간",
  "1시간 30분",
] as const;

const fieldClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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
        "inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-xs font-semibold transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-card text-foreground hover:bg-surface-2",
        className,
      )}
    >
      {children}
    </button>
  );
}

function DatePickerField({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const days = listUpcomingDays(14);
  const selectedIso = dateLabelToIso(value) ?? days[0]?.iso ?? "";
  const selectedDay = days.find((d) => d.iso === selectedIso) ?? null;
  const headline = value || selectedDay?.label || "날짜 선택";
  const detail = selectedDay
    ? `${selectedDay.month}월 ${selectedDay.day}일, ${selectedDay.weekdayShort}요일`
    : null;

  useEffect(() => {
    const root = stripRef.current;
    if (!root) return;
    const active = root.querySelector<HTMLElement>('[aria-selected="true"]');
    active?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedIso]);

  return (
    <div className="min-w-0 space-y-3">
      <div className="rounded-xl border border-border bg-card px-3 py-2.5">
        <p className="text-[11px] font-semibold text-muted">선택한 날짜</p>
        <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
          {headline}
        </p>
        {detail && detail !== headline ? (
          <p className="mt-0.5 text-xs font-medium text-muted">{detail}</p>
        ) : null}
      </div>

      <div
        className="flex gap-1.5"
        role="group"
        aria-label="빠른 날짜"
      >
        {QUICK_DATE_OFFSETS.map((offset) => {
          const label = formatUpcomingDateLabel(offset);
          const day = days[offset];
          const active = selectedIso === day?.iso;
          return (
            <Chip
              key={label}
              active={active}
              onClick={() => onChange(label)}
              className="h-9 flex-1 justify-center text-sm"
            >
              {label}
            </Chip>
          );
        })}
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-muted">앞으로 2주</p>
        <div
          ref={stripRef}
          className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
          role="listbox"
          aria-label="날짜 선택"
        >
          {days.map((day) => {
            const active = selectedIso === day.iso;
            return (
              <button
                key={day.iso}
                type="button"
                role="option"
                aria-selected={active}
                aria-label={`${day.label}, ${day.month}월 ${day.day}일`}
                onClick={() => onChange(day.label)}
                className={cn(
                  "flex w-12 shrink-0 cursor-pointer flex-col items-center rounded-xl px-1 py-2 transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "bg-card text-foreground hover:bg-surface-2",
                )}
              >
                <span
                  className={cn(
                    "text-[11px] font-semibold",
                    active ? "text-background/80" : "text-muted",
                  )}
                >
                  {day.weekdayShort}
                </span>
                <span className="mt-0.5 text-base font-bold tabular-nums leading-none">
                  {day.day}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="block min-w-0">
        <span className="mb-1.5 block text-xs font-semibold text-muted">
          달력에서 고르기
        </span>
        <input
          type="date"
          value={selectedIso}
          min={days[0]?.iso}
          onChange={(e) => {
            const iso = e.target.value;
            if (!iso) return;
            onChange(isoToUpcomingDateLabel(iso));
          }}
          className={cn(
            fieldClass,
            "h-11 cursor-pointer text-sm font-semibold tabular-nums",
          )}
          aria-label="달력에서 날짜 선택"
        />
      </label>
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
}: UpcomingDetailPanelProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
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
    setEditing(false);
    setForm(toForm(item));
    resetEditors();
  }, [open, item]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) {
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
  }, [open, onClose, editing, item]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleSave() {
    if (!item || !form) return;
    onSave(fromForm(item, form));
    setEditing(false);
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

  return (
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
        aria-label="예정 회의 상세"
        inert={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-[0_0_40px_rgba(17,24,46,0.12)] transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="min-w-0 flex-1 pr-2">
            <p className="text-xs text-muted">
              {editing ? "예정 회의 수정" : "예정 회의"}
            </p>
            {editing && form ? (
              <Input
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                className="mt-0.5 h-8 border-0 bg-transparent px-0 text-base font-semibold shadow-none focus-visible:ring-0"
                placeholder="회의 제목"
              />
            ) : (
              <h2 className="truncate text-base font-semibold text-foreground">
                {view?.title ?? "상세"}
              </h2>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!editing && view ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 cursor-pointer text-foreground/70 hover:bg-surface-2 hover:text-foreground"
                onClick={startEdit}
                aria-label="수정"
              >
                <Pencil className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 cursor-pointer text-foreground/70 hover:bg-surface-2 hover:text-foreground"
              onClick={onClose}
              aria-label="상세 닫기"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {view && data && form ? (
          <>
            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-6 px-5 py-5">
                <section className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-start gap-x-3 gap-y-4">
                  <p className="pt-0.5 text-sm font-semibold text-foreground">
                    일정
                  </p>
                  {editing ? (
                    <div className="min-w-0 space-y-3 rounded-xl bg-surface p-3">
                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-muted">
                          날짜
                        </p>
                        <DatePickerField
                          value={form.dateLabel}
                          onChange={(next) => update("dateLabel", next)}
                        />
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-muted">
                          시작 시간
                        </p>
                        <input
                          type="time"
                          value={toTimeInputValue(form.timeLabel)}
                          onChange={(e) =>
                            update(
                              "timeLabel",
                              fromTimeInputValue(e.target.value),
                            )
                          }
                          className={cn(
                            fieldClass,
                            "h-11 max-w-[10rem] text-base font-semibold tabular-nums",
                          )}
                          aria-label="시작 시간"
                        />
                      </div>

                      <div>
                        <p className="mb-1.5 text-xs font-semibold text-muted">
                          소요 시간
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {DURATION_PRESETS.map((preset) => (
                            <Chip
                              key={preset}
                              active={form.duration === preset}
                              onClick={() => update("duration", preset)}
                            >
                              {preset}
                            </Chip>
                          ))}
                        </div>
                        {!DURATION_PRESETS.includes(
                          form.duration as (typeof DURATION_PRESETS)[number],
                        ) ? (
                          <Input
                            value={form.duration}
                            onChange={(e) =>
                              update("duration", e.target.value)
                            }
                            className="mt-2"
                            placeholder="예: 20분"
                            aria-label="소요 시간 직접 입력"
                          />
                        ) : (
                          <button
                            type="button"
                            className="mt-2 cursor-pointer text-xs font-medium text-muted hover:text-foreground"
                            onClick={() => update("duration", "")}
                          >
                            다른 시간 직접 입력
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-medium tabular-nums tracking-tight text-foreground">
                        <span>{view.dateLabel}</span>
                        <span className="font-semibold">{view.timeLabel}</span>
                        <span className="text-muted">소요 {view.duration}</span>
                      </p>
                    </div>
                  )}

                  <p className="pt-0.5 text-sm font-semibold text-foreground">
                    장소
                  </p>
                  {editing ? (
                    <div className="min-w-0 space-y-2.5">
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
                                "inline-flex cursor-pointer flex-col items-center gap-1 rounded-xl px-1.5 py-1 transition-colors",
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
                                  "text-[10px] font-medium",
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
                        <div className="space-y-2">
                          {hasExtraLocation(form.platform, form.location) ? (
                            <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-surface px-2.5 py-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted" />
                              <span className="truncate text-sm font-medium text-foreground">
                                {form.location}
                              </span>
                              <button
                                type="button"
                                className="cursor-pointer text-muted hover:text-foreground"
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
                            <div className="space-y-2 rounded-xl bg-surface p-2.5">
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
                              <Input
                                value={form.location}
                                onChange={(e) =>
                                  update("location", e.target.value)
                                }
                                placeholder="다른 장소 이름"
                                aria-label="장소 이름"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <AddIconButton
                              label="장소 추가"
                              onClick={() => setShowPlaceEditor(true)}
                            >
                              <MapPin className="h-3.5 w-3.5" />
                            </AddIconButton>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {hasExtraLocation(form.platform, form.location) ? (
                            <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-surface px-2.5 py-1.5">
                              <Link2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                              <span className="truncate text-sm font-medium text-foreground">
                                {form.location}
                              </span>
                              <button
                                type="button"
                                className="cursor-pointer text-muted hover:text-foreground"
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
                            <Input
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
                            />
                          ) : (
                            <AddIconButton
                              label="링크 추가"
                              onClick={() => {
                                setLinkDraft("");
                                setShowLinkEditor(true);
                              }}
                            >
                              <Link2 className="h-3.5 w-3.5" />
                            </AddIconButton>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2.5">
                      <MeetingPlatformIcon
                        platform={resolvePlatform(view)}
                        size="sm"
                      />
                      <p className="min-w-0 text-sm font-medium text-foreground">
                        {view.location}
                      </p>
                    </div>
                  )}

                  <p className="pt-0.5 text-sm font-semibold text-foreground">
                    주최
                  </p>
                  {editing ? (
                    <div className="min-w-0 space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowOrganizerPick((v) => !v)}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-surface py-1 pl-1 pr-3 transition-colors hover:bg-surface-2"
                        aria-expanded={showOrganizerPick}
                        aria-label="주최자 변경"
                      >
                        <PersonAvatar name={form.organizer} size="sm" />
                        <span className="text-sm font-medium text-foreground">
                          {form.organizer}
                        </span>
                        <span className="text-[11px] font-semibold text-muted">
                          변경
                        </span>
                      </button>
                      {showOrganizerPick ? (
                        <div
                          className="flex flex-wrap gap-2 rounded-xl bg-surface p-2.5"
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
                                  if (!form.participants.includes(person.name)) {
                                    update("participants", [
                                      person.name,
                                      ...form.participants,
                                    ]);
                                  }
                                }}
                                className={cn(
                                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 transition-colors",
                                  active
                                    ? "bg-foreground text-background"
                                    : "bg-card hover:bg-surface-2",
                                )}
                              >
                                <PersonAvatar
                                  name={person.name}
                                  size="sm"
                                  className="border-transparent"
                                />
                                <span className="text-xs font-semibold">
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
                      <p className="text-sm font-medium text-foreground">
                        {view.organizer}
                      </p>
                    </div>
                  )}

                  <p className="pt-0.5 text-sm font-semibold text-foreground">
                    참석자
                  </p>
                  {editing ? (
                    <div className="min-w-0 space-y-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {form.participants.map((name) => (
                          <div
                            key={name}
                            className="group relative inline-flex"
                          >
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-2">
                              <PersonAvatar name={name} size="sm" />
                              <span className="max-w-[5.5rem] truncate text-xs font-semibold text-foreground">
                                {name}
                              </span>
                              <button
                                type="button"
                                className="cursor-pointer text-muted hover:text-foreground"
                                aria-label={`${name} 제거`}
                                onClick={() =>
                                  update(
                                    "participants",
                                    form.participants.filter((p) => p !== name),
                                  )
                                }
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          </div>
                        ))}
                        <AddIconButton
                          label="추가"
                          onClick={() =>
                            setShowParticipantAdd((v) => !v)
                          }
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </AddIconButton>
                      </div>

                      {showParticipantAdd ? (
                        <div className="space-y-2.5 rounded-xl bg-surface p-2.5">
                          <p className="text-[11px] font-semibold text-muted">
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
                                  onClick={() => toggleParticipant(person.name)}
                                  className={cn(
                                    "inline-flex cursor-pointer flex-col items-center gap-1 rounded-xl px-1.5 py-1.5 transition-colors",
                                    selected
                                      ? "bg-foreground text-background"
                                      : "bg-card hover:bg-surface-2",
                                  )}
                                >
                                  <PersonAvatar
                                    name={person.name}
                                    size="sm"
                                    className="border-transparent"
                                  />
                                  <span className="max-w-[3.5rem] truncate text-[10px] font-semibold">
                                    {person.name}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {showCustomParticipant ? (
                            <div className="flex gap-2">
                              <Input
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
                              />
                              <Button
                                type="button"
                                size="icon"
                                className="h-10 w-10 shrink-0"
                                onClick={() => addParticipant(participantDraft)}
                                aria-label="직접 입력 추가"
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="cursor-pointer text-xs font-semibold text-muted hover:text-foreground"
                              onClick={() => setShowCustomParticipant(true)}
                            >
                              목록에 없는 사람 추가
                            </button>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {view.participants.map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-1.5 rounded-full bg-surface py-1 pl-1 pr-2"
                          >
                            <PersonAvatar name={name} size="sm" />
                            <span className="text-xs font-semibold text-foreground">
                              {name}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      안건
                    </h3>
                    {editing ? (
                      <AddIconButton label="안건 추가" onClick={addAgendaRow}>
                        <Plus className="h-3.5 w-3.5" />
                      </AddIconButton>
                    ) : null}
                  </div>

                  {editing ? (
                    form.agenda.length === 0 ? (
                      <p className="text-xs text-muted">
                        필요할 때만 안건을 추가하세요.
                      </p>
                    ) : (
                      <ol className="space-y-2">
                        {form.agenda.map((line, index) => (
                          <li
                            key={`agenda-edit-${index}`}
                            className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2"
                          >
                            <span className="w-4 shrink-0 text-sm font-medium text-muted-2">
                              {index + 1}.
                            </span>
                            <input
                              value={line}
                              onChange={(e) => {
                                const next = [...form.agenda];
                                next[index] = e.target.value;
                                update("agenda", next);
                              }}
                              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-2"
                              placeholder="안건 내용"
                              aria-label={`안건 ${index + 1}`}
                            />
                            <button
                              type="button"
                              className="shrink-0 cursor-pointer text-muted hover:text-foreground"
                              aria-label={`안건 ${index + 1} 삭제`}
                              onClick={() =>
                                update(
                                  "agenda",
                                  form.agenda.filter((_, i) => i !== index),
                                )
                              }
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ol>
                    )
                  ) : (
                    <ol className="space-y-2">
                      {view.agenda.map((line, index) => (
                        <li
                          key={`${view.id}-agenda-${index}`}
                          className="flex gap-2 rounded-xl bg-surface px-3 py-2.5 text-sm text-foreground"
                        >
                          <span className="shrink-0 font-medium text-muted-2">
                            {index + 1}.
                          </span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                <section>
                  <h3 className="mb-2 text-sm font-semibold text-foreground">
                    메모
                  </h3>
                  {editing ? (
                    <textarea
                      value={form.notes}
                      onChange={(e) => update("notes", e.target.value)}
                      rows={4}
                      className={cn(fieldClass, "h-auto min-h-[96px] resize-y")}
                      placeholder="준비물, 주의사항 등"
                    />
                  ) : (
                    <p className="rounded-xl bg-surface px-3 py-3 text-sm leading-relaxed text-muted">
                      {view.notes || "메모 없음"}
                    </p>
                  )}
                </section>
              </div>
            </ScrollArea>

            <div className="flex shrink-0 gap-2 border-t border-border px-5 py-4">
              {editing ? (
                <>
                  <Button type="button" className="flex-1" onClick={handleSave}>
                    저장
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setEditing(false);
                      setForm(toForm(view));
                      resetEditors();
                    }}
                  >
                    취소
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild className="flex-1">
                    <Link href={view.href} onClick={onClose}>
                      회의 시작
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={startEdit}
                  >
                    수정
                  </Button>
                </>
              )}
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}
