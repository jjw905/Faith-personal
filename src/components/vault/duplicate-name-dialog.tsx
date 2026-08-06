"use client";

import { useEffect } from "react";

import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { cn } from "@/lib/utils";

/** 보관함 동일 이름 → (1) 올리기 확인. 기존 vs 올릴 파일을 대비. */
export function DuplicateVaultNameDialog({
  open,
  originalName,
  nextName,
  busy,
  contained,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  originalName: string;
  nextName: string;
  busy?: boolean;
  /** 디자인 랩: 프리뷰 영역 안에만 표시 */
  contained?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { isLive } = usePageUxPreview();
  const blockDismiss = Boolean(busy && isLive);

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

  if (!open) return null;

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
        aria-labelledby="vault-dup-title"
        aria-describedby="vault-dup-desc"
        className="w-full max-w-md rounded-t-3xl bg-card px-5 pt-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] shadow-float sm:rounded-3xl sm:px-7 sm:pt-7 sm:pb-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="vault-dup-title"
          className="text-xl font-bold tracking-tight text-foreground sm:text-lg"
        >
          중복 파일
        </h2>
        <p
          id="vault-dup-desc"
          className="mt-2 text-base leading-relaxed text-muted"
        >
          같은 이름이 보관함에 있습니다. 새 이름으로 올릴까요?
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-base font-semibold text-primary">올릴 파일</p>
            <p
              className="mt-1.5 break-all text-lg font-semibold leading-relaxed tracking-tight text-foreground"
              title={nextName}
            >
              {nextName}
            </p>
          </div>

          <div>
            <p className="text-base font-semibold text-muted">기존</p>
            <p
              className="mt-1.5 break-all text-base font-medium leading-relaxed text-muted"
              title={originalName}
            >
              {originalName}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:mt-7 sm:flex-row sm:justify-end sm:gap-2.5">
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
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-primary px-4 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-0 sm:w-auto sm:rounded-xl"
          >
            올리기
          </button>
        </div>
      </div>
    </div>
  );
}
