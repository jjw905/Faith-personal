"use client";

import { Loader2, Upload, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { TOUCH_ICON_BUTTON } from "@/lib/touch-target";
import {
  validateVaultUploadFiles,
  type VaultUsage,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

const FORMAT_EXTS = [
  ".mp3",
  ".m4a",
  ".wav",
  ".pdf",
  ".docx",
  ".hwp",
  ".xlsx",
  ".pptx",
  ".jpg",
  ".png",
  ".webp",
  ".heic",
  ".txt",
] as const;

/** 보관함 올리기. 음성·문서·사진 (채팅 첨부용 포함). */
export function VaultUploadDialog({
  open,
  usage,
  busy,
  error,
  onClose,
  onUpload,
  onQuotaFull,
}: {
  open: boolean;
  usage: VaultUsage | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onUpload: (files: FileList | File[]) => Promise<void> | void;
  /** 용량 가득 참이면 부모 UsageLimitDialog로 넘긴다. */
  onQuotaFull?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const { isLive } = usePageUxPreview();
  const blockDismiss = busy && isLive;
  const inputId = useId();

  useEffect(() => {
    if (!open) {
      setDragOver(false);
      setGuideError(null);
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !blockDismiss) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, blockDismiss, onClose]);

  function tryUpload(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    if ((usage?.remaining ?? 1) <= 0) {
      onQuotaFull?.();
      return;
    }
    const remaining = usage?.remaining ?? null;
    const message = validateVaultUploadFiles(files, remaining);
    if (message) {
      setGuideError(message);
      return;
    }
    setGuideError(null);
    void onUpload(files);
  }

  if (!open) return null;

  const alertText = guideError || error;
  const quotaFull = (usage?.remaining ?? 1) <= 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={blockDismiss ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-upload-title"
        className="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-card shadow-float sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start gap-2 px-5 pt-6 sm:px-7 sm:pt-7">
          <div className="min-w-0 flex-1">
            <h2
              id="vault-upload-title"
              className="text-xl font-bold tracking-tight text-foreground sm:text-lg"
            >
              파일 올리기
            </h2>
            <p className="mt-1 text-base leading-relaxed text-muted">
              음성·문서·사진을 보관함에 저장합니다.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={blockDismiss}
            className={cn(
              TOUCH_ICON_BUTTON,
              "shrink-0 cursor-pointer rounded-xl text-muted hover:bg-surface/70 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50",
            )}
            aria-label="올리기 닫기"
          >
            <X strokeWidth={1.75} />
          </button>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            if (!quotaFull) setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            if (busy || quotaFull) return;
            tryUpload(event.dataTransfer.files);
          }}
          className={cn(
            "relative mx-5 mb-5 mt-4 flex min-h-[16rem] w-auto flex-col items-center justify-center gap-3.5 rounded-2xl px-4 py-8 transition-colors sm:mx-7 sm:mb-7 sm:min-h-[18rem] sm:gap-4 sm:px-6 sm:py-10",
            dragOver
              ? "bg-primary-soft ring-1 ring-primary/30"
              : "ring-1 ring-border/70",
          )}
        >
          {busy ? (
            <div
              className="flex flex-col items-center gap-3 text-center"
              role="status"
              aria-live="polite"
            >
              <Loader2
                className="h-8 w-8 animate-spin text-primary"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="text-lg font-semibold text-foreground">올리는 중</p>
              <p className="text-base text-muted">잠시만 기다려 주세요.</p>
            </div>
          ) : (
            <>
              <input
                id={inputId}
                type="file"
                multiple
                disabled={quotaFull}
                onChange={(event) => {
                  if (event.target.files) tryUpload(event.target.files);
                  event.target.value = "";
                }}
                className="peer sr-only"
              />
              {!quotaFull ? (
                <label
                  htmlFor={inputId}
                  className="absolute inset-0 z-0 hidden cursor-pointer md:block"
                >
                  <span className="sr-only">파일 올리기</span>
                </label>
              ) : null}

              <Upload
                className="relative z-10 h-9 w-9 text-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
              <label
                htmlFor={inputId}
                className={cn(
                  "relative z-10 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-primary px-6 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 sm:rounded-xl",
                  quotaFull && "pointer-events-none opacity-50",
                )}
              >
                파일 올리기
              </label>
              <p className="relative z-10 text-center text-base text-muted">
                여러 파일을 한 번에 올릴 수 있습니다.
              </p>
              <p className="relative z-10 max-w-md text-center text-base leading-relaxed text-muted-2 sm:text-sm">
                {FORMAT_EXTS.join(" · ")}
              </p>
              {alertText ? (
                <p
                  className="relative z-20 max-w-md px-2 text-center text-base font-medium text-red-600"
                  role="alert"
                >
                  {alertText}
                </p>
              ) : null}
              {quotaFull && !alertText ? (
                <button
                  type="button"
                  className="relative z-20 min-h-12 rounded-xl px-4 text-base font-semibold text-primary hover:underline"
                  onClick={() => onQuotaFull?.()}
                >
                  용량이 가득 찼습니다. 자세히 보기
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
