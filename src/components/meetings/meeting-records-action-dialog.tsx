"use client";

import { Check, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { ExportFormatIcon } from "@/components/meetings/export-format-icon";
import { MeetingCaptureIcon } from "@/components/meetings/meeting-capture-label";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  POPULAR_MEETING_EXPORT_FORMATS,
  type MeetingExportFormat,
} from "@/lib/meeting-export";
import type { MaskStyle } from "@/lib/masking";
import { formatSeoulListLeading } from "@/lib/meeting-date";
import type { Meeting } from "@/types/meeting";
import { cn } from "@/lib/utils";

export type RecordsActionMode = "delete" | "download" | "share";

/** 마스킹 on/off 단일 토글. 버튼 섹션 배경 없음. */
function MaskToggle({
  on,
  disabled,
  onChange,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <span className="text-base font-semibold text-foreground">마스킹</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="개인정보 마스킹"
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={cn(
          "relative inline-flex h-12 w-[52px] shrink-0 cursor-pointer items-center",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-45",
        )}
      >
        <span
          className={cn(
            "absolute inset-x-0 top-1/2 h-8 -translate-y-1/2 rounded-full transition-colors",
            on ? "bg-primary" : "bg-border-strong/40",
          )}
          aria-hidden
        />
        <span
          className={cn(
            "absolute top-1/2 block h-6 w-6 -translate-y-1/2 rounded-full bg-card shadow-[0_1px_2px_rgba(17,24,46,0.18)] transition-transform",
            on ? "translate-x-6" : "translate-x-1",
          )}
          aria-hidden
        />
      </button>
    </div>
  );
}

/** 목록·상세 공통. 삭제·내보내기·공유 확인. */
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
  onConfirm: (format?: MeetingExportFormat, maskStyle?: MaskStyle) => void;
}) {
  const { isLive } = usePageUxPreview();
  const blockDismiss = busy && isLive;
  const [format, setFormat] = useState<MeetingExportFormat>("docx");
  const [maskStyle, setMaskStyle] = useState<MaskStyle>("partial");

  useEffect(() => {
    if (!open || (mode !== "download" && mode !== "share")) return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      if (mode === "download") setFormat("docx");
      setMaskStyle("partial");
    });
    return () => {
      active = false;
    };
  }, [open, mode]);

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
  const isDownload = mode === "download";
  const formatOptions = [...POPULAR_MEETING_EXPORT_FORMATS].sort((a, b) => {
    const order = ["docx", "pdf", "txt", "csv"];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
  const maskOn = maskStyle !== "off";

  const title = isDelete
    ? single
      ? "이 기록을 삭제할까요?"
      : "선택한 기록을 삭제할까요?"
    : isDownload
      ? single
        ? "내보내기"
        : `내보내기 · ${count}`
      : "공유";

  const desc = isDelete ? "삭제 후 복구할 수 없습니다." : null;

  const confirmLabel = isDelete
    ? single
      ? "삭제"
      : `${count}건 삭제`
    : isDownload
      ? "내보내기"
      : "링크 복사";

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
        aria-describedby={desc ? "records-action-confirm-desc" : undefined}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card shadow-float sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 sm:px-7 sm:pt-7">
          <h2
            id="records-action-confirm-title"
            className="text-xl font-bold tracking-tight text-foreground sm:text-lg"
          >
            {title}
          </h2>
          {desc ? (
            <p
              id="records-action-confirm-desc"
              className="mt-2 text-base leading-relaxed text-muted"
            >
              {desc}
            </p>
          ) : null}

          {!isDelete ? (
            <div className={cn("mt-5", busy && "pointer-events-none opacity-50")}>
              <MaskToggle
                on={maskOn}
                disabled={busy}
                onChange={(next) => setMaskStyle(next ? "partial" : "off")}
              />
            </div>
          ) : null}

          {!isDelete && isDownload ? (
            <div className={cn("mt-5", busy && "pointer-events-none opacity-50")}>
              <p className="text-base font-semibold text-foreground">형식</p>
              <div
                className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1 sm:grid-cols-4 sm:gap-x-1"
                role="radiogroup"
                aria-label="저장 형식"
              >
                {formatOptions.map((item) => {
                  const selected = format === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${item.label}${item.blurb ? ` · ${item.blurb}` : ""}`}
                      title={item.blurb ? `${item.label} · ${item.blurb}` : item.label}
                      disabled={busy}
                      onClick={() => setFormat(item.id)}
                      className={cn(
                        "relative flex min-h-14 min-w-0 flex-col items-center justify-center gap-2 bg-transparent px-1 py-2.5 transition-opacity sm:min-h-12 sm:py-2",
                        selected
                          ? "text-foreground"
                          : "text-muted hover:text-foreground hover:opacity-90",
                      )}
                    >
                      <span className="relative inline-flex">
                        <ExportFormatIcon
                          format={item.id}
                          size={40}
                          className={cn(selected ? "scale-105" : "opacity-90")}
                        />
                        {selected ? (
                          <span className="absolute -right-1 -bottom-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                            <Check className="h-3 w-3" strokeWidth={2.5} />
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "text-base font-semibold tracking-tight",
                          selected ? "text-foreground" : "text-muted",
                        )}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {isDelete ? (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-base font-semibold text-muted">
                  {single ? "대상 기록" : "선택 목록"}
                </p>
                {single ? null : (
                  <span className="text-base font-semibold tabular-nums text-muted">
                    {count}개
                  </span>
                )}
              </div>
              <ul className="max-h-[min(40vh,16rem)] divide-y divide-border overflow-y-auto">
                {meetings.map((meeting) => (
                  <ActionConfirmMeetingRow key={meeting.id} meeting={meeting} />
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="shrink-0 bg-card px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:px-7 sm:pb-6">
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface/70 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-0 sm:w-auto sm:rounded-xl"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() =>
                onConfirm(
                  isDelete || !isDownload ? undefined : format,
                  isDelete ? undefined : maskStyle,
                )
              }
              disabled={busy}
              className={
                isDelete
                  ? "inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-foreground px-4 text-base font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-0 sm:w-auto sm:rounded-xl"
                  : "inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-primary px-4 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-0 sm:w-auto sm:rounded-xl"
              }
            >
              {isDelete ? (
                <Trash2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              ) : null}
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionConfirmMeetingRow({ meeting }: { meeting: Meeting }) {
  const { day, time } = formatSeoulListLeading(meeting.date);

  return (
    <li className="flex min-w-0 items-center gap-3 py-3.5">
      <div className="w-[5.75rem] shrink-0 space-y-0.5 sm:w-[5rem]">
        <p className="text-base leading-5 tracking-tight text-muted">{day}</p>
        <p className="text-lg tabular-nums leading-6 tracking-tight text-foreground">
          {time}
        </p>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <MeetingCaptureIcon meeting={meeting} size="sm" className="shrink-0" />
        <p
          className="min-w-0 flex-1 truncate text-lg font-semibold leading-6 tracking-tight text-foreground"
          title={meeting.title}
        >
          {meeting.title}
        </p>
      </div>
    </li>
  );
}
