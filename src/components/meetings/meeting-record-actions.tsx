"use client";

import { Download, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import {
  formatSeoulDateParts,
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
}: {
  meetingId: string;
  title: string;
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
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
    if (!next || next === title || busy) {
      setEditing(false);
      setValue(title);
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
      setEditing(false);
      router.refresh();
    } catch {
      setValue(title);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setValue(title);
    setEditing(false);
  }

  if (!canEdit) {
    return (
      <h1
        className={cn(
          "min-w-0 text-2xl font-bold tracking-tight text-foreground",
          className,
        )}
      >
        {title}
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
          className="w-full border-b border-foreground bg-transparent py-0.5 text-2xl font-bold tracking-tight text-foreground outline-none placeholder:text-muted disabled:opacity-60"
        />
      </form>
    );
  }

  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group max-w-full cursor-text rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        title="제목 수정"
        aria-label={`제목 수정: ${title}`}
      >
        <span className="text-2xl font-bold tracking-tight text-foreground decoration-muted/50 underline-offset-4 group-hover:underline">
          {title}
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

/** 날짜·시간 인라인 수정. 미지정 업로드는 업로드 시각이 기본값. */
export function MeetingDateTimeMeta({
  meetingId,
  date,
  duration,
  canEdit,
  className,
}: {
  meetingId: string;
  date: string;
  duration: string;
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const { day, time } = formatSeoulDateParts(date);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(() => toSeoulDateTimeLocal(date));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setValue(toSeoulDateTimeLocal(date));
  }, [date]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    try {
      el.showPicker?.();
    } catch {
      // ignore
    }
  }, [editing]);

  async function saveDate() {
    const next = value.trim();
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

  const durationNode = (
    <>
      <span className="text-muted-2" aria-hidden>
        ,
      </span>
      <span className="font-medium tabular-nums text-muted">{duration}</span>
    </>
  );

  if (!canEdit) {
    return (
      <div
        className={cn(
          "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm",
          className,
        )}
      >
        <time
          dateTime={date}
          className="font-semibold tabular-nums tracking-tight text-foreground"
        >
          {day}
        </time>
        <span className="text-muted-2" aria-hidden>
          ,
        </span>
        <span className="font-semibold tabular-nums tracking-tight text-foreground">
          {time}
        </span>
        {durationNode}
      </div>
    );
  }

  if (editing) {
    return (
      <div
        className={cn(
          "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm",
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
          className="rounded-lg bg-surface-2 px-2 py-1 font-semibold tabular-nums tracking-tight text-foreground outline-none ring-1 ring-border focus:ring-2 focus:ring-primary disabled:opacity-60"
        />
        {durationNode}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex max-w-full cursor-pointer items-center gap-x-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        title="날짜 수정"
        aria-label={`날짜 수정: ${day} ${time}`}
      >
        <time
          dateTime={date}
          className="font-semibold tabular-nums tracking-tight text-foreground decoration-muted/50 underline-offset-4 group-hover:underline"
        >
          {day}
        </time>
        <span className="text-muted-2" aria-hidden>
          ,
        </span>
        <span className="font-semibold tabular-nums tracking-tight text-foreground decoration-muted/50 underline-offset-4 group-hover:underline">
          {time}
        </span>
        <Pencil
          className="h-3 w-3 shrink-0 text-muted transition-colors group-hover:text-foreground"
          strokeWidth={2}
          aria-hidden
        />
      </button>
      {durationNode}
    </div>
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
}: {
  meetingId: string;
  tags?: string[];
  meeting: Meeting;
  timeline?: MeetingTimeline;
  transcript?: MeetingTranscript;
  summary?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [actionMode, setActionMode] = useState<"delete" | "download" | null>(
    null,
  );

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
      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-muted hover:bg-surface-2 hover:text-foreground"
          aria-label="다운로드"
          disabled={busy}
          onClick={() => setActionMode("download")}
        >
          <Download className="h-4 w-4" strokeWidth={1.75} />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-9 w-9 text-masked hover:bg-masked-soft hover:text-masked"
          aria-label="기록 삭제"
          disabled={busy}
          onClick={() => setActionMode("delete")}
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.75} />
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
