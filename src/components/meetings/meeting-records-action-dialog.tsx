"use client";

import { Download, Trash2 } from "lucide-react";
import { useEffect } from "react";

import { MeetingCaptureOverline } from "@/components/meetings/meeting-capture-label";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
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
  const { isLive } = usePageUxPreview();
  const blockDismiss = busy && isLive;

  useEffect(() => {
    if (!open || contained) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !blockDismiss) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, blockDismiss, onCancel, contained]);

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
        contained ? "absolute inset-0 z-10" : "fixed inset-0 z-[70]",
      )}
      role="presentation"
      onClick={blockDismiss ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="records-action-confirm-title"
        aria-describedby="records-action-confirm-desc"
        className="w-full max-w-md rounded-t-3xl bg-card px-5 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] shadow-float sm:rounded-3xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="records-action-confirm-title"
          className="text-xl font-bold tracking-tight text-foreground sm:text-lg"
        >
          {title}
        </h2>
        <p
          id="records-action-confirm-desc"
          className="mt-2 text-base leading-relaxed text-muted"
        >
          {desc}
        </p>

        <div className="mt-5 rounded-2xl bg-surface px-3 py-3.5">
          <div className="mb-3 flex items-center justify-between gap-2 px-1">
            <p className="text-base font-semibold text-muted">선택 목록</p>
            <span className="text-base font-semibold tabular-nums text-muted">
              {count}건
            </span>
          </div>
          <ul className="max-h-[min(40vh,16rem)] space-y-4 overflow-y-auto">
            {meetings.map((meeting) => (
              <ActionConfirmMeetingRow key={meeting.id} meeting={meeting} />
            ))}
          </ul>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-14 w-full cursor-pointer items-center justify-center rounded-2xl px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-0 sm:w-auto sm:rounded-xl sm:text-base"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              isDelete
                ? "inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-masked px-4 text-base font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-0 sm:w-auto sm:rounded-xl"
                : "inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-0 sm:w-auto sm:rounded-xl"
            }
          >
            <ConfirmIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
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
    <li className="flex min-w-0 gap-3 px-1 py-0.5">
      <div className="w-[5.25rem] shrink-0">
        <p className="whitespace-nowrap text-base font-medium leading-5 text-muted">
          {day}
        </p>
        <p className="mt-1 whitespace-nowrap text-lg font-semibold tabular-nums leading-6 tracking-tight text-foreground">
          {time}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <MeetingCaptureOverline meeting={meeting} />
        <p
          className="truncate text-lg font-semibold leading-6 tracking-tight text-foreground"
          title={meeting.title}
        >
          {meeting.title}
        </p>
        <p className="text-base font-medium tabular-nums text-muted">
          {meeting.duration}
        </p>
      </div>
    </li>
  );
}
