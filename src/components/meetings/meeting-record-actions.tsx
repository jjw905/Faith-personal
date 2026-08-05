"use client";

import {
  Download,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  MeetingAttachmentsList,
  collectTranscriptFiles,
} from "@/components/meetings/meeting-attachments";
import { MeetingRecordsActionDialog } from "@/components/meetings/meeting-records-action-dialog";
import { MonthDayCalendar } from "@/components/meetings/month-day-calendar";
import {
  exportMeetingDownload,
  exportMeetingsListDownload,
  type MeetingExportFormat,
} from "@/lib/meeting-export";
import {
  formatSeoulDateParts,
  seoulDateKey,
  toSeoulDateTimeLocal,
} from "@/lib/meeting-date";
import {
  buildMeetingShareUrl,
  shareMeetingLink,
} from "@/lib/meeting-share";
import type { MaskStyle } from "@/lib/masking";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";
import { cn } from "@/lib/utils";

export { exportMeetingDownload, exportMeetingsListDownload };

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
  /** 헤더 「수정」 클릭 시 증가 → 편집 모드 진입 */
  editNonce = 0,
}: {
  meetingId: string;
  title: string;
  canEdit: boolean;
  className?: string;
  align?: "start" | "center";
  /** page: 상세 본문, header: 대화·다시듣기 상단 */
  size?: "page" | "header";
  editNonce?: number;
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
    if (!editNonce || !canEdit) return;
    setEditing(true);
  }, [editNonce, canEdit]);

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
            className="ml-1 inline-block h-5 w-5 shrink-0 translate-y-[-0.1em] text-muted transition-colors group-hover:text-foreground"
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
  /** 헤더에는 분석(기록) 시각만. 재생 길이(duration)는 붙이지 않음 — 어지러움 방지. */
  const headerLabel = `${day} · ${time}`;

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
            "flex w-full min-w-0 items-center justify-center",
            className,
          )}
        >
          <button
            type="button"
            onClick={() => {
              if (canEdit) {
                setEditing(true);
                return;
              }
              setExpanded((v) => !v);
            }}
            aria-expanded={expanded}
            title={
              canEdit ? `날짜 수정: ${headerLabel}` : headerLabel
            }
            className="min-w-0 max-w-full cursor-pointer text-center outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <time
              dateTime={date}
              className={cn(
                "block max-w-full truncate text-xl font-bold tabular-nums tracking-tight text-foreground sm:text-2xl md:text-xl",
                expanded ? "line-clamp-2 whitespace-normal break-words" : null,
              )}
            >
              {headerLabel}
            </time>
          </button>
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
            className="h-5 w-5 shrink-0 text-muted transition-colors group-hover:text-foreground md:h-4 md:w-4"
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
  canEdit = false,
  onEdit,
}: {
  meetingId: string;
  tags?: string[];
  meeting: Meeting;
  timeline?: MeetingTimeline;
  transcript?: MeetingTranscript;
  summary?: string;
  /** 분석 중에는 아직 완성되지 않은 기록이므로 다운로드·삭제를 막는다. */
  processing?: boolean;
  /** 제목·날짜 수정 가능(본인 업로드). 수정 아이콘은 항상 노출. */
  canEdit?: boolean;
  onEdit?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [actionMode, setActionMode] = useState<
    "delete" | "download" | "share" | null
  >(null);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const disabled = busy || processing;
  const attachmentCount = transcript
    ? collectTranscriptFiles(transcript).length
    : 0;

  useEffect(() => {
    if (!shareHint) return;
    const t = window.setTimeout(() => setShareHint(null), 1800);
    return () => window.clearTimeout(t);
  }, [shareHint]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!attachmentsOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAttachmentsOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [attachmentsOpen]);

  function handleEdit() {
    if (disabled) return;
    if (!canEdit) {
      setShareHint("본인이 올린 기록만 수정할 수 있습니다");
      return;
    }
    onEdit?.();
  }

  const iconBtnClass =
    "h-12 w-12 shrink-0 text-muted hover:bg-surface-2 hover:text-foreground md:h-10 md:w-10 lg:h-11 lg:w-11 [&_svg]:size-6 md:[&_svg]:size-5 lg:[&_svg]:size-6 disabled:pointer-events-none disabled:opacity-40";

  const menuItemClass =
    "inline-flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-base font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40";

  function closeMenuThen(fn: () => void) {
    setMenuOpen(false);
    fn();
  }

  async function confirmAction(
    format?: MeetingExportFormat,
    maskStyle: MaskStyle = "partial",
  ) {
    if (busy || !actionMode) return;
    const mode = actionMode;
    setActionMode(null);

    if (mode === "download") {
      await exportMeetingDownload(
        {
          meeting,
          timeline,
          transcript,
          summary,
        },
        format ?? "txt",
        maskStyle,
      );
      return;
    }

    if (mode === "share") {
      if (meeting.workspace === "team") {
        try {
          const res = await fetch(
            `/api/team-meetings/${encodeURIComponent(meetingId)}/share`,
            { method: "POST" },
          );
          const data = (await res.json()) as {
            message?: string;
          };
          if (!res.ok) {
            setShareHint(data.message ?? "팀 기록은 외부 공유할 수 없습니다");
            return;
          }
        } catch {
          setShareHint("팀 기록 공유를 확인하지 못했습니다");
          return;
        }
      }
      const result = await shareMeetingLink({
        title: meeting.title,
        url: buildMeetingShareUrl(maskStyle),
      });
      if (result === "shared") setShareHint("공유했습니다");
      else if (result === "copied") {
        setShareHint(
          maskStyle === "off"
            ? "원문 링크를 복사했습니다"
            : "마스킹 적용 링크를 복사했습니다",
        );
      } else if (result === "failed") setShareHint("공유에 실패했습니다");
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
      <div className="relative flex min-h-12 shrink-0 items-center justify-end md:min-h-11">
        {/* md+: 아이콘 한 줄 */}
        <div className="hidden items-center gap-0 md:flex">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={iconBtnClass}
            aria-label="수정"
            title={
              processing
                ? "분석이 끝나면 수정할 수 있습니다"
                : canEdit
                  ? "제목 수정"
                  : "본인이 올린 기록만 수정할 수 있습니다"
            }
            disabled={disabled}
            onClick={handleEdit}
          >
            <Pencil strokeWidth={1.75} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={iconBtnClass}
            aria-label={
              attachmentCount > 0 ? `첨부 ${attachmentCount}개` : "첨부"
            }
            title={
              processing
                ? "분석이 끝나면 첨부를 볼 수 있습니다"
                : attachmentCount > 0
                  ? `첨부 ${attachmentCount}개`
                  : "첨부 파일"
            }
            disabled={disabled || !transcript}
            onClick={() => setAttachmentsOpen(true)}
          >
            <Paperclip strokeWidth={1.75} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={iconBtnClass}
            aria-label="다운로드"
            title={
              processing ? "분석이 끝나면 다운로드할 수 있습니다" : "다운로드"
            }
            disabled={disabled}
            onClick={() => setActionMode("download")}
          >
            <Download strokeWidth={1.75} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={iconBtnClass}
            aria-label="공유"
            title={processing ? "분석이 끝나면 공유할 수 있습니다" : "공유"}
            disabled={disabled}
            onClick={() => setActionMode("share")}
          >
            <Share2 strokeWidth={1.75} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              iconBtnClass,
              "text-muted hover:bg-surface/70 hover:text-foreground",
            )}
            aria-label="기록 삭제"
            title={processing ? "분석이 끝나면 삭제할 수 있습니다" : "기록 삭제"}
            disabled={disabled}
            onClick={() => setActionMode("delete")}
          >
            <Trash2 strokeWidth={1.75} />
          </Button>
        </div>

        {/* 좁은 폭: 메인보드처럼 … → 세로 메뉴 */}
        <div ref={menuRef} className="relative md:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "h-12 w-12 shrink-0 [&_svg]:size-6",
              menuOpen
                ? "bg-foreground text-background hover:bg-foreground hover:text-background"
                : "text-muted hover:bg-surface-2 hover:text-foreground",
            )}
            aria-label={menuOpen ? "도구 닫기" : "도구 더보기"}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-controls={menuId}
            title={menuOpen ? "닫기" : "도구"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? (
              <X strokeWidth={1.75} />
            ) : (
              <MoreHorizontal strokeWidth={1.75} />
            )}
          </Button>

          {menuOpen ? (
            <div
              id={menuId}
              role="menu"
              aria-label="회의 기록 도구"
              className="absolute right-0 top-[calc(100%+0.5rem)] z-40 flex min-w-[12.5rem] flex-col gap-1 rounded-2xl border border-border bg-card p-1.5 shadow-float"
            >
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                className={cn(
                  menuItemClass,
                  "text-foreground hover:bg-surface-2",
                )}
                onClick={() =>
                  closeMenuThen(() => {
                    handleEdit();
                  })
                }
              >
                <Pencil className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                수정
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={disabled || !transcript}
                className={cn(
                  menuItemClass,
                  "text-foreground hover:bg-surface-2",
                )}
                onClick={() =>
                  closeMenuThen(() => setAttachmentsOpen(true))
                }
              >
                <Paperclip className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                {attachmentCount > 0 ? `첨부 ${attachmentCount}개` : "첨부"}
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                className={cn(
                  menuItemClass,
                  "text-foreground hover:bg-surface-2",
                )}
                onClick={() =>
                  closeMenuThen(() => setActionMode("download"))
                }
              >
                <Download className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                다운로드
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                className={cn(
                  menuItemClass,
                  "text-foreground hover:bg-surface-2",
                )}
                onClick={() => closeMenuThen(() => setActionMode("share"))}
              >
                <Share2 className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                공유
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={disabled}
                className={cn(
                  menuItemClass,
                  "text-foreground hover:bg-surface/70",
                )}
                onClick={() => closeMenuThen(() => setActionMode("delete"))}
              >
                <Trash2 className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                삭제
              </button>
            </div>
          ) : null}
        </div>

        {shareHint ? (
          <p
            role="status"
            className="absolute right-0 top-[calc(100%+0.35rem)] z-40 whitespace-nowrap rounded-xl bg-foreground px-3 py-1.5 text-sm font-medium text-background shadow-soft"
          >
            {shareHint}
          </p>
        ) : null}
      </div>

      <MeetingRecordsActionDialog
        open={actionMode !== null}
        mode={actionMode ?? "delete"}
        meetings={[meeting]}
        busy={busy}
        onCancel={() => setActionMode(null)}
        onConfirm={(format, maskStyle) =>
          void confirmAction(format, maskStyle)
        }
      />

      {attachmentsOpen && transcript ? (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="presentation"
          onClick={() => setAttachmentsOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-attachments-title"
            className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card shadow-float sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 pt-6 sm:px-7 sm:pt-7">
              <h2
                id="meeting-attachments-title"
                className="text-xl font-bold tracking-tight text-foreground sm:text-lg"
              >
                첨부
              </h2>
              <Button
                type="button"
                variant="ghost"
                className="h-12 min-w-12 px-3 text-base font-semibold text-muted hover:bg-transparent hover:text-foreground md:h-11 md:text-sm"
                onClick={() => setAttachmentsOpen(false)}
              >
                닫기
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 sm:px-7 sm:pb-7">
              <MeetingAttachmentsList
                transcript={transcript}
                onSelectLine={(lineId) => {
                  setAttachmentsOpen(false);
                  router.push(`/meetings/${meetingId}/chat?line=${lineId}`);
                }}
              />
            </div>
          </div>
        </div>
      ) : null}
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
