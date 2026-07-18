"use client";

import {
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  inferMeetingPlatform,
  MeetingPlatformIcon,
  MEETING_PLATFORMS,
  platformDefaultLocation,
  type MeetingPlatform,
} from "@/lib/meeting-platform";
import type { UpcomingItem } from "@/lib/workspace-data";
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
    agenda: item.agenda.length ? [...item.agenda] : [""],
    notes: item.notes,
  };
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

const DATE_PRESETS = ["오늘", "내일", "모레"] as const;
const DURATION_PRESETS = [
  "15분",
  "30분",
  "40분",
  "45분",
  "1시간",
  "1시간 30분",
] as const;

function Chip({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-8 cursor-pointer items-center rounded-lg px-2.5 text-xs font-semibold transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-surface text-foreground hover:bg-surface-2",
      )}
    >
      {children}
    </button>
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

const fieldClass =
  "flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

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

  useEffect(() => {
    if (!open || !item) return;
    setEditing(false);
    setForm(toForm(item));
    setParticipantDraft("");
  }, [open, item]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (editing) {
          setEditing(false);
          if (item) setForm(toForm(item));
          setParticipantDraft("");
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
    setParticipantDraft("");
  }

  function startEdit() {
    if (!item) return;
    setForm(toForm(item));
    setEditing(true);
  }

  function addParticipant() {
    const name = participantDraft.trim();
    if (!name || !form) return;
    update("participants", [...form.participants, name]);
    setParticipantDraft("");
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
                        <div className="flex flex-wrap gap-1.5">
                          {DATE_PRESETS.map((preset) => (
                            <Chip
                              key={preset}
                              active={form.dateLabel === preset}
                              onClick={() => update("dateLabel", preset)}
                            >
                              {preset}
                            </Chip>
                          ))}
                        </div>
                        {!DATE_PRESETS.includes(
                          form.dateLabel as (typeof DATE_PRESETS)[number],
                        ) ? (
                          <Input
                            value={form.dateLabel}
                            onChange={(e) =>
                              update("dateLabel", e.target.value)
                            }
                            className="mt-2"
                            placeholder="예: 수요일, 7월 22일"
                            aria-label="날짜 직접 입력"
                          />
                        ) : (
                          <button
                            type="button"
                            className="mt-2 cursor-pointer text-xs font-medium text-muted hover:text-foreground"
                            onClick={() => update("dateLabel", "")}
                          >
                            다른 날짜 직접 입력
                          </button>
                        )}
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
                                const prev = form.platform;
                                update("platform", option.id);
                                if (option.id === "custom") {
                                  if (prev !== "custom") {
                                    update("location", "");
                                  }
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
                        <Input
                          value={form.location}
                          onChange={(e) => update("location", e.target.value)}
                          placeholder="장소 직접 입력 (예: 3층 회의실)"
                          aria-label="장소 직접 입력"
                        />
                      ) : null}
                      <Input
                        value={form.organizer}
                        onChange={(e) => update("organizer", e.target.value)}
                        placeholder="주최"
                        aria-label="주최"
                      />
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2.5">
                      <MeetingPlatformIcon
                        platform={resolvePlatform(view)}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">
                          {view.location}
                        </p>
                        <p className="mt-0.5 text-xs text-muted">
                          주최 {view.organizer}
                        </p>
                      </div>
                    </div>
                  )}

                  <p className="pt-0.5 text-sm font-semibold text-foreground">
                    참석자
                  </p>
                  {editing ? (
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {form.participants.map((name, index) => (
                          <span
                            key={`${name}-${index}`}
                            className="inline-flex items-center gap-1 rounded-lg bg-surface px-2 py-1 text-xs font-medium text-foreground"
                          >
                            {name}
                            <button
                              type="button"
                              className="cursor-pointer text-muted hover:text-foreground"
                              aria-label={`${name} 제거`}
                              onClick={() =>
                                update(
                                  "participants",
                                  form.participants.filter(
                                    (_, i) => i !== index,
                                  ),
                                )
                              }
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={participantDraft}
                          onChange={(e) => setParticipantDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addParticipant();
                            }
                          }}
                          placeholder="이름 입력 후 Enter"
                          aria-label="참석자 추가"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          onClick={addParticipant}
                          aria-label="참석자 추가"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {view.participants.length}명
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {view.participants.join(", ")}
                      </p>
                    </div>
                  )}
                </section>

                <section>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="mb-2 text-sm font-semibold text-foreground">
                      안건
                    </h3>
                    {editing ? (
                      <button
                        type="button"
                        onClick={addAgendaRow}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        추가
                      </button>
                    ) : null}
                  </div>

                  {editing ? (
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
                                form.agenda.length <= 1
                                  ? [""]
                                  : form.agenda.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ol>
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
                      setParticipantDraft("");
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
