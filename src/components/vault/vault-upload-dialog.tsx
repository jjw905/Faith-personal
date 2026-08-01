"use client";

import { Loader2, Upload, X } from "lucide-react";
import { useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  validateVaultUploadFiles,
  type VaultUsage,
} from "@/lib/vault";
import { cn } from "@/lib/utils";

const FORMAT_GUIDES = [
  { ext: ".mp3", hint: "음성" },
  { ext: ".m4a", hint: "녹음" },
  { ext: ".wav", hint: "고음질" },
  { ext: ".pdf", hint: "문서" },
  { ext: ".docx", hint: "워드" },
  { ext: ".hwp", hint: "한글" },
  { ext: ".xlsx", hint: "엑셀" },
  { ext: ".pptx", hint: "발표" },
  { ext: ".jpg", hint: "사진" },
  { ext: ".png", hint: "이미지" },
  { ext: ".webp", hint: "웹 이미지" },
  { ext: ".heic", hint: "아이폰 사진" },
  { ext: ".txt", hint: "텍스트" },
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
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onClick={blockDismiss ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="파일 올리기"
        className="panel-surface relative w-full max-w-2xl overflow-hidden rounded-t-3xl shadow-float sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-2.5 top-2.5 z-20 h-11 w-11 cursor-pointer text-foreground/70 hover:bg-surface-2 hover:text-foreground sm:right-4 sm:top-4"
          onClick={onClose}
          disabled={blockDismiss}
          aria-label="올리기 닫기"
        >
          <X className="h-5 w-5" />
        </Button>

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
            "relative flex min-h-[18rem] w-full flex-col items-center justify-center gap-3.5 px-5 py-10 transition-colors sm:min-h-[22rem] sm:gap-4 sm:px-8 sm:py-12",
            dragOver
              ? "bg-primary-soft"
              : "bg-surface/40 hover:bg-surface/70",
          )}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <Loader2
                className="h-9 w-9 animate-spin text-primary sm:h-8 sm:w-8"
                strokeWidth={1.75}
              />
              <p className="text-lg font-semibold text-foreground sm:text-base">
                올리는 중
              </p>
            </div>
          ) : (
            <>
              {/* 보이는 버튼이 진입점. 데스크톱은 영역 탭으로도 열림. */}
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
                className="relative z-10 h-9 w-9 text-foreground sm:h-8 sm:w-8"
                strokeWidth={1.75}
                aria-hidden
              />
              <label
                htmlFor={inputId}
                className={cn(
                  "relative z-10 inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-full bg-primary px-6 text-base font-bold text-primary-foreground transition-colors hover:bg-primary-hover peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
                  quotaFull && "pointer-events-none opacity-50",
                )}
              >
                파일 올리기
              </label>
              <p className="relative z-10 text-base text-muted">
                여러 파일을 한 번에 올릴 수 있습니다.
              </p>
              <ul className="relative z-10 flex max-w-xl flex-wrap justify-center gap-2 px-1 sm:gap-2.5">
                {FORMAT_GUIDES.map((item) => (
                  <li
                    key={item.ext}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-2.5 py-1.5 sm:px-3 sm:py-2"
                  >
                    <span className="font-mono text-base font-bold tracking-tight text-primary sm:text-sm">
                      {item.ext}
                    </span>
                    {/* 한국어 설명은 좁은 화면에서 생략. 확장자만으로 충분. */}
                    <span className="hidden text-muted sm:inline sm:text-xs">
                      {item.hint}
                    </span>
                  </li>
                ))}
              </ul>
              {alertText ? (
                <p
                  className="relative z-20 max-w-xl px-2 text-center text-base font-medium text-red-600"
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
