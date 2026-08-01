"use client";

import { Download, Share2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { MeetingCaptureOverline } from "@/components/meetings/meeting-capture-label";
import { MaterialSymbol } from "@/components/ui/material-symbol";
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
  const selectedMeta = formatOptions.find((f) => f.id === format);

  const title = isDelete
    ? single
      ? "이 기록을 삭제할까요?"
      : "선택한 기록을 삭제할까요?"
    : isDownload
      ? single
        ? "이 기록을 내보낼까요?"
        : "선택한 기록을 내보낼까요?"
      : "이 기록을 공유할까요?";

  const desc = isDelete
    ? "삭제 후 복구할 수 없습니다."
    : isDownload
      ? selectedMeta
        ? `${selectedMeta.blurb}로 저장합니다.`
        : "선택한 형식으로 저장합니다."
      : "링크는 현재 권한을 유지하며, 아래에서 선택한 가림 방식으로 열립니다.";

  const confirmLabel = isDelete
    ? single
      ? "삭제"
      : `${count}건 삭제`
    : isDownload
      ? single
        ? "내보내기"
        : `${count}건 내보내기`
      : "공유 링크 복사";

  const ConfirmIcon = isDelete ? Trash2 : isDownload ? Download : Share2;

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
        className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card px-5 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] shadow-float sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl sm:p-7"
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

        {!isDelete && isDownload ? (
          <div
            className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2"
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
                  disabled={busy}
                  onClick={() => setFormat(item.id)}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors",
                    selected
                      ? "border-primary bg-surface"
                      : "border-transparent bg-surface-2/80 hover:bg-surface-2",
                    busy && "opacity-50",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                      item.toneClass,
                    )}
                    aria-hidden
                  >
                    <MaterialSymbol name={item.symbol} size={22} weight={500} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-base font-semibold text-foreground">
                      {item.label}
                    </span>
                    <span className="block text-base text-muted">{item.blurb}</span>
                  </span>
                </button>
              );
            })}
            <p className="col-span-full px-1 text-base leading-relaxed text-muted">
              한글 전용 HWP 대신 한글에서 바로 열고 편집할 수 있는 DOCX를
              제공합니다.
            </p>
          </div>
        ) : null}

        {!isDelete ? (
          <div className="mt-4 rounded-2xl bg-surface p-3">
            <div className="px-1">
              <p className="text-base font-semibold text-foreground">
                개인정보 마스킹
              </p>
              <p className="mt-1 text-base leading-relaxed text-muted">
                {isDownload
                  ? "파일에만 적용되며 원본 회의록은 바뀌지 않습니다."
                  : "공유 링크를 연 사람에게 보이는 내용에 적용합니다."}
              </p>
            </div>
            <div
              className="mt-3 grid grid-cols-1 gap-2"
              role="radiogroup"
              aria-label="마스킹 방식"
            >
              {[
                {
                  id: "partial" as const,
                  label: "부분 가림 (권장)",
                  description: "앞·뒤 일부만 남기고 별표로 가립니다.",
                },
                {
                  id: "label" as const,
                  label: "항목명으로 가림",
                  description: "[전화번호], [이메일]처럼 유형만 표시합니다.",
                },
                {
                  id: "off" as const,
                  label: "마스킹 안 함",
                  description: "원문을 그대로 포함합니다. 외부 공유 전 확인하세요.",
                },
              ].map((item) => {
                const selected = maskStyle === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={busy}
                    onClick={() => setMaskStyle(item.id)}
                    className={cn(
                      "flex min-h-12 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
                      selected
                        ? "border-primary bg-card"
                        : "border-transparent bg-surface-2/70 hover:bg-surface-2",
                      busy && "opacity-50",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-foreground">
                        {item.label}
                      </span>
                      <span className="block text-base leading-relaxed text-muted">
                        {item.description}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "h-5 w-5 shrink-0 rounded-full border-2",
                        selected
                          ? "border-primary bg-primary"
                          : "border-muted/60",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

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
            onClick={() =>
              onConfirm(
                isDelete || !isDownload ? undefined : format,
                isDelete ? undefined : maskStyle,
              )
            }
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
