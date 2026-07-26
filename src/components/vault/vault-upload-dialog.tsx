"use client";

import { Loader2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";

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
}: {
  open: boolean;
  usage: VaultUsage | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onUpload: (files: FileList | File[]) => Promise<void> | void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const { isLive } = usePageUxPreview();
  const blockDismiss = busy && isLive;

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
          {!busy && !quotaFull ? (
            <input
              type="file"
              multiple
              onChange={(event) => {
                if (event.target.files) tryUpload(event.target.files);
                event.target.value = "";
              }}
              className="absolute inset-0 z-10 cursor-pointer opacity-0"
              aria-label="파일 올리기"
            />
          ) : null}

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
              <Upload
                className="h-9 w-9 text-foreground sm:h-8 sm:w-8"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="text-lg font-semibold text-foreground sm:text-base">
                드래그하거나 클릭해서 업로드
              </p>
              <p className="text-base text-muted sm:text-sm">
                여러 파일을 한 번에 올릴 수 있습니다.
              </p>
              <ul className="flex max-w-xl flex-wrap justify-center gap-2 px-1 sm:gap-2.5">
                {FORMAT_GUIDES.map((item) => (
                  <li
                    key={item.ext}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-surface px-2.5 py-1.5 sm:px-3 sm:py-2"
                  >
                    <span className="font-mono text-base font-bold tracking-tight text-primary sm:text-sm">
                      {item.ext}
                    </span>
                    <span className="text-sm text-muted sm:text-xs">
                      {item.hint}
                    </span>
                  </li>
                ))}
              </ul>
              {alertText || quotaFull ? (
                <p
                  className="relative z-20 max-w-xl px-2 text-center text-sm font-medium text-red-600"
                  role="alert"
                >
                  {alertText ??
                    "보관함 용량이 가득 찼습니다. 파일을 비운 뒤 다시 올려 주세요."}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
