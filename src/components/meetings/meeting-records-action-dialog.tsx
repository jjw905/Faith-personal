"use client";

import { Download, Trash2 } from "lucide-react";
import { useEffect } from "react";

import { MeetingCaptureOverline } from "@/components/meetings/meeting-capture-label";
import { formatSeoulListLeading } from "@/lib/meeting-date";
import type { Meeting } from "@/types/meeting";
import { cn } from "@/lib/utils";

export type RecordsActionMode = "delete" | "download";

/** 목록·상세 공통. 삭제/다운로드 확인. */
export function MeetingRecordsActionDialog({
  open,
  mode,
  meetings,
  busy,
  contained,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  mode: RecordsActionMode;
  meetings: Meeting[];
  busy: boolean;
  /** 디자인 랩: 프리뷰 영역 안에만 표시 */
  contained?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open || contained) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, busy, onCancel, contained]);

  if (!open || meetings.length === 0) return null;

  const count = meetings.length;
  const single = count === 1;
  const isDelete = mode === "delete";

  const title = isDelete
    ? single
      ? "이 기록을 삭제할까요?"
      : "선택한 기록을 삭제할까요?"
    : single
      ? "이 기록을 받을까요?"
      : "선택한 기록을 받을까요?";

  const desc = isDelete
    ? "삭제 후 복구할 수 없습니다."
    : "텍스트 파일로 저장합니다.";

  const confirmLabel = isDelete
    ? single
      ? "삭제"
      : `${count}건 삭제`
    : single
      ? "받기"
      : `${count}건 받기`;

  const ConfirmIcon = isDelete ? Trash2 : Download;

  return (
    <div
      className={cn(
        "flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4",
        contained
          ? "absolute inset-0 z-10"
          : "fixed inset-0 z-[70]",
      )}
      role="presentation"
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="records-action-confirm-title"
        aria-describedby="records-action-confirm-desc"
        className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-float sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="records-action-confirm-title"
          className="text-base font-bold tracking-tight text-foreground"
        >
          {title}
        </h2>
        <p
          id="records-action-confirm-desc"
          className="mt-1.5 text-sm leading-relaxed text-muted"
        >
          {desc}
        </p>

        <div className="mt-4 rounded-2xl bg-surface px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold tracking-wide text-muted-2">
              선택 목록
            </p>
            <span className="text-xs font-semibold tabular-nums text-muted-2">
              {count}건
            </span>
          </div>
          <ul className="max-h-52 space-y-3 overflow-y-auto">
            {meetings.map((meeting) => (
              <ActionConfirmMeetingRow key={meeting.id} meeting={meeting} />
            ))}
          </ul>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl px-4 text-sm font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-auto"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              isDelete
                ? "inline-flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-masked px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-auto"
                : "inline-flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-auto"
            }
          >
            <ConfirmIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionConfirmMeetingRow({ meeting }: { meeting: Meeting }) {
  const { day, time } = formatSeoulListLeading(meeting.date);

  return (
    <li className="flex min-w-0 gap-3.5 px-1 py-0.5">
      <div className="w-[4.75rem] shrink-0 pt-0.5">
        <p className="whitespace-nowrap text-xs font-medium leading-4 text-muted">
          {day}
        </p>
        <p className="mt-1 whitespace-nowrap text-sm font-semibold tabular-nums leading-5 text-foreground">
          {time}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <MeetingCaptureOverline meeting={meeting} />
        <p
          className="truncate text-sm font-medium leading-5 text-foreground"
          title={meeting.title}
        >
          {meeting.title}
        </p>
        <p className="text-sm font-medium tabular-nums text-muted">
          {meeting.duration}
        </p>
      </div>
    </li>
  );
}
