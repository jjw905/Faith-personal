"use client";

import { Download, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import { MonthDayCalendar } from "@/components/meetings/month-day-calendar";
import {
  formatSeoulDateParts,
  seoulDateKey,
  toSeoulDateTimeLocal,
} from "@/lib/meeting-date";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";
import { cn } from "@/lib/utils";

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeFileName(title: string) {
  return title.replace(/[^\w가-힣.\-]+/g, "_").slice(0, 80) || "meeting";
}

export function exportMeetingDownload(payload: {
  meeting: Meeting;
  timeline?: MeetingTimeline;
  transcript?: MeetingTranscript;
  summary?: string;
}) {
  const { meeting, timeline, transcript, summary } = payload;
  const lines: string[] = [
    meeting.title,
    `${meeting.date}, ${meeting.duration}`,
    "",
  ];
  const sum = summary || timeline?.overallSummary;
  if (sum) {
    lines.push("개요", sum, "");
  }
  if (timeline?.decisions?.length) {
    lines.push("결정");
    for (const d of timeline.decisions) lines.push(`- ${d}`);
    lines.push("");
  }
  if (timeline?.actions?.length) {
    lines.push("후속");
    for (const a of timeline.actions) {
      const owner = a.owner?.trim();
      lines.push(`- ${owner ? `${owner}: ${a.task}` : a.task}`);
    }
    lines.push("");
  }
  if (timeline?.segments?.length) {
    lines.push("타임라인");
    for (const s of timeline.segments) {
      lines.push(`[${s.start}-${s.end}] ${s.title}`);
      if (s.summary) lines.push(s.summary);
    }
    lines.push("");
  }
  if (transcript?.lines?.length) {
    lines.push("대화기록");
    for (const l of transcript.lines) {
      lines.push(`${l.time} ${l.speaker}: ${l.text ?? ""}`);
    }
  }
  downloadBlob(
    `${safeFileName(meeting.title)}.txt`,
    lines.join("\n"),
    "text/plain;charset=utf-8",
  );
}

export function exportMeetingsListDownload(meetings: Meeting[]) {
  const body = meetings
    .map(
      (m) =>
        `${m.title}\n${m.date}, ${m.duration}\n${[...m.summaryTags, ...m.tags].join(", ")}\n`,
    )
    .join("\n---\n\n");
  downloadBlob(
    `meetings-${meetings.length}.txt`,
    body,
    "text/plain;charset=utf-8",
  );
}

function isUserMeeting(meetingId: string, tags: string[]) {
  return meetingId.startsWith("mtg-up-") || tags.includes("업로드");
}

function hideMockMeeting(meetingId: string) {
  try {
    const key = "faith.records.hidden";
    const prev = JSON.parse(
      window.localStorage.getItem(key) || "[]",
    ) as string[];
    const next = Array.from(new Set([...prev, meetingId]));
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore
  }
}

/** 제목 인라인 수정. 타이틀·작은 연필을 붙여 이름 변경을 드러냄. */
export function MeetingTitleHeading({
  meetingId,
  title,
  canEdit,
  className,
  align = "start",
  size = "page",
}: {
  meetingId: string;
  title: string;
  canEdit: boolean;
  className?: string;
  align?: "start" | "center";
  /** page: 상세 본문, header: 대화·다시듣기 상단 */
  size?: "page" | "header";
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [displayTitle, setDisplayTitle] = useState(title);
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);

  const titleClass =
    size === "header"
      ? "text-xl font-bold tracking-tight text-foreground sm:text-2xl md:text-xl"
      : "text-2xl font-bold tracking-tight text-foreground";
  const alignClass = align === "center" ? "text-center" : "text-left";

  useEffect(() => {
    setDisplayTitle(title);
    setValue(title);
  }, [title]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  async function saveTitle() {
    const next = value.trim();
    if (!next || next === displayTitle || busy) {
      setEditing(false);
      setValue(displayTitle);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "수정 실패");
      }
      setDisplayTitle(next);
      setValue(next);
      setEditing(false);
      router.refresh();
    } catch {
      setValue(displayTitle);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setValue(displayTitle);
    setEditing(false);
  }

  if (!canEdit) {
    return (
      <h1 className={cn("min-w-0 truncate", titleClass, alignClass, className)}>
        {displayTitle}
      </h1>
    );
  }

  if (editing) {
    return (
      <form
        className={cn("min-w-0 flex-1", className)}
        onSubmit={(e) => {
          e.preventDefault();
          void saveTitle();
        }}
      >
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void saveTitle()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          disabled={busy}
          aria-label="회의 제목"
          className={cn(
            "w-full border-b border-foreground bg-transparent py-0.5 outline-none placeholder:text-muted disabled:opacity-60",
            titleClass,
            alignClass,
          )}
        />
      </form>
    );
  }

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "group max-w-full cursor-text rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          size === "header" ? "min-h-12 py-2" : "",
          align === "center" ? "mx-auto block w-full" : "text-left",
        )}
        title="제목 수정"
        aria-label={`제목 수정: ${displayTitle}`}
      >
        <span
          className={cn(
            "inline max-w-full decoration-muted/50 underline-offset-4 group-hover:underline",
            titleClass,
            align === "center" ? "line-clamp-2 break-words" : "",
          )}
        >
          {displayTitle}
          <Pencil
            className="ml-1 inline-block h-3.5 w-3.5 shrink-0 translate-y-[-0.1em] text-muted transition-colors group-hover:text-foreground"
            strokeWidth={2}
            aria-hidden
          />
        </span>
      </button>
    </div>
  );
}

/** 날짜·시간 인라인 수정. 미지정 업로드는 업로드 시각이 기본값.
 * 모바일: 48px 셀 월 달력 시트 (MD3 comfortable / Faith 터치).
 * 데스크탑: datetime-local.
 * header: 상단 가운데 제목 자리 (말줄임 → 탭 시 2줄).
 */
export function MeetingDateTimeMeta({
  meetingId,
  date,
  duration,
  canEdit,
  variant = "meta",
  className,
}: {
  meetingId: string;
  date: string;
  duration: string;
  canEdit: boolean;
  variant?: "meta" | "header";
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { day, time } = formatSeoulDateParts(date);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [value, setValue] = useState(() => toSeoulDateTimeLocal(date));
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const titleId = useId();
  const isHeader = variant === "header";

  const datePart = value.slice(0, 10) || seoulDateKey();
  const timePart = value.slice(11, 16) || "12:00";
  const hasDuration = Boolean(duration && duration !== "—");
  const headerLabel = hasDuration
    ? `${day} · ${time} · ${duration}`
    : `${day} · ${time}`;

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setValue(toSeoulDateTimeLocal(date));
  }, [date]);

  useEffect(() => {
    setExpanded(false);
  }, [date, duration]);

  useEffect(() => {
    if (!editing || isMobile) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      // ignore
    }
  }, [editing, isMobile]);

  useEffect(() => {
    if (!editing || !isMobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [editing, isMobile]);

  async function saveDate(nextValue = value) {
    const next = nextValue.trim();
    const currentLocal = toSeoulDateTimeLocal(date);
    if (!next || next === currentLocal || busy) {
      setEditing(false);
      setValue(currentLocal);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: next }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.message ?? "수정 실패");
      }
      setEditing(false);
      router.refresh();
    } catch {
      setValue(currentLocal);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setValue(toSeoulDateTimeLocal(date));
    setEditing(false);
  }

  function setDateIso(iso: string) {
    setValue(`${iso}T${timePart}`);
  }

  function setTimeValue(t: string) {
    setValue(`${datePart}T${t || "12:00"}`);
  }

  const metaSep = (
    <span className="select-none text-muted-2" aria-hidden>
      ·
    </span>
  );

  const durationNode = hasDuration ? (
    <>
      {metaSep}
      <span className="font-medium tabular-nums text-muted">{duration}</span>
    </>
  ) : null;

  const mobileSheet =
    mounted && editing && isMobile
      ? createPortal(
          <div className="fixed inset-0 z-[80] md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label="닫기"
              onClick={cancel}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="absolute inset-x-0 bottom-0 max-h-[min(92dvh,40rem)] overflow-y-auto rounded-t-3xl bg-card px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] pt-3 shadow-float"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" aria-hidden />
              <h2
                id={titleId}
                className="text-xl font-bold tracking-tight text-foreground"
              >
                날짜·시간
              </h2>
              <div className="mt-4 space-y-4">
                <MonthDayCalendar
                  selectedIso={datePart}
                  onSelect={setDateIso}
                />
                <label className="block">
                  <span className="mb-1.5 block text-base font-medium text-muted">
                    시간
                  </span>
                  <input
                    type="time"
                    value={timePart}
                    onChange={(e) => setTimeValue(e.target.value)}
                    disabled={busy}
                    aria-label="회의 시간"
                    className="h-14 w-full max-w-[12rem] cursor-pointer rounded-2xl bg-surface-2 px-4 text-base font-semibold tabular-nums text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary disabled:opacity-60"
                  />
                </label>
              </div>
              <div className="mt-5 flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-14 flex-1 rounded-2xl text-base font-semibold"
                  disabled={busy}
                  onClick={cancel}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  className="h-14 flex-1 rounded-2xl text-base font-semibold"
                  disabled={busy}
                  onClick={() => void saveDate(`${datePart}T${timePart}`)}
                >
                  저장
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  if (isHeader) {
    if (editing && !isMobile) {
      return (
        <div
          className={cn(
            "flex w-full min-w-0 items-center justify-center gap-x-2",
            className,
          )}
        >
          <input
            ref={inputRef}
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => void saveDate()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void saveDate();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            disabled={busy}
            aria-label="회의 날짜와 시간"
            className="h-11 max-w-full rounded-xl bg-surface-2 px-3 text-base font-semibold tabular-nums tracking-tight text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary disabled:opacity-60"
          />
        </div>
      );
    }

    return (
      <>
        <div
          className={cn(
            "flex w-full min-w-0 items-center gap-2 md:gap-0.5",
            className,
          )}
        >
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            title={headerLabel}
            className="min-w-0 flex-1 cursor-pointer text-center outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <time
              dateTime={date}
              className={cn(
                "block text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl md:text-xl",
                expanded ? "line-clamp-2 break-words" : "truncate",
              )}
            >
              {headerLabel}
            </time>
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-foreground md:h-9 md:w-9"
              title="날짜 수정"
              aria-label={`날짜 수정: ${day} ${time}`}
            >
              <Pencil className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={2} />
            </button>
          ) : null}
        </div>
        {mobileSheet}
      </>
    );
  }

  if (!canEdit) {
    return (
      <div
        className={cn(
          "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base md:text-sm",
          className,
        )}
      >
        <time
          dateTime={date}
          className="font-semibold tabular-nums tracking-tight text-foreground"
        >
          {day}
        </time>
        {metaSep}
        <span className="font-semibold tabular-nums tracking-tight text-foreground">
          {time}
        </span>
        {durationNode}
      </div>
    );
  }

  if (editing && !isMobile) {
    return (
      <div
        className={cn(
          "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-base md:text-sm",
          className,
        )}
      >
        <input
          ref={inputRef}
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => void saveDate()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void saveDate();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          disabled={busy}
          aria-label="회의 날짜와 시간"
          className="h-auto rounded-lg bg-surface-2 px-2 py-1 text-sm font-semibold tabular-nums tracking-tight text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary disabled:opacity-60"
        />
        {durationNode}
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "mt-3 flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 text-base md:min-h-0 md:text-sm",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group inline-flex min-h-12 max-w-full cursor-pointer items-center gap-x-2 rounded-lg px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:min-h-0 md:rounded-sm md:px-0"
          title="날짜 수정"
          aria-label={`날짜 수정: ${day} ${time}`}
        >
          <time
            dateTime={date}
            className="font-semibold tabular-nums tracking-tight text-foreground decoration-muted/50 underline-offset-4 group-hover:underline"
          >
            {day}
          </time>
          {metaSep}
          <span className="font-semibold tabular-nums tracking-tight text-foreground decoration-muted/50 underline-offset-4 group-hover:underline">
            {time}
          </span>
          <Pencil
            className="h-4 w-4 shrink-0 text-muted transition-colors group-hover:text-foreground md:h-3 md:w-3"
            strokeWidth={2}
            aria-hidden
          />
        </button>
        {durationNode}
      </div>
      {mobileSheet}
    </>
  );
}

/** 상세: 다운로드·삭제 (목록과 같은 확인 다이얼로그) */
export function MeetingRecordActions({
  meetingId,
  tags = [],
  meeting,
  timeline,
  transcript,
  summary,
  processing = false,
}: {
  meetingId: string;
  tags?: string[];
  meeting: Meeting;
  timeline?: MeetingTimeline;
  transcript?: MeetingTranscript;
  summary?: string;
  /** 분석 중에는 아직 완성되지 않은 기록이므로 다운로드·삭제를 막는다. */
  processing?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [actionMode, setActionMode] = useState<"delete" | "download" | null>(
    null,
  );
  const disabled = busy || processing;

  async function confirmAction() {
    if (busy || !actionMode) return;
    const mode = actionMode;
    setActionMode(null);

    if (mode === "download") {
      exportMeetingDownload({
        meeting,
        timeline,
        transcript,
        summary,
      });
      return;
    }

    setBusy(true);
    try {
      if (isUserMeeting(meetingId, tags)) {
        const res = await fetch(`/api/meetings/${meetingId}`, {
          method: "DELETE",
        });
        const data = (await res.json()) as { ok?: boolean; message?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.message ?? "삭제 실패");
        }
      } else {
        hideMockMeeting(meetingId);
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex h-12 shrink-0 items-center gap-2 md:h-9 md:gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-12 w-12 text-muted hover:bg-surface-2 hover:text-foreground md:h-9 md:w-9 [&_svg]:size-6 md:[&_svg]:size-4 disabled:pointer-events-none disabled:opacity-40"
          aria-label="다운로드"
          title={processing ? "분석이 끝나면 다운로드할 수 있어요" : "다운로드"}
          disabled={disabled}
          onClick={() => setActionMode("download")}
        >
          <Download strokeWidth={1.75} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-12 w-12 text-masked hover:bg-masked-soft hover:text-masked md:h-9 md:w-9 [&_svg]:size-6 md:[&_svg]:size-4 disabled:pointer-events-none disabled:opacity-40"
          aria-label="기록 삭제"
          title={processing ? "분석이 끝나면 삭제할 수 있어요" : "기록 삭제"}
          disabled={disabled}
          onClick={() => setActionMode("delete")}
        >
          <Trash2 strokeWidth={1.75} />
        </Button>
      </div>

      <MeetingRecordsActionDialog
        open={actionMode !== null}
        mode={actionMode ?? "delete"}
        meetings={[meeting]}
        busy={busy}
        onCancel={() => setActionMode(null)}
        onConfirm={() => void confirmAction()}
      />
    </>
  );
}

export async function deleteMeetingRecord(meeting: Meeting) {
  if (isUserMeeting(meeting.id, meeting.tags)) {
    const res = await fetch(`/api/meetings/${meeting.id}`, {
      method: "DELETE",
    });
    const data = (await res.json()) as { ok?: boolean };
    if (!res.ok || !data.ok) throw new Error("삭제 실패");
    return;
  }
  hideMockMeeting(meeting.id);
}
