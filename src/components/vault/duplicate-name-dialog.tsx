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
        contained
          ? "absolute inset-0 z-10"
          : "fixed inset-0 z-[70]",
      )}
      role="presentation"
      onClick={blockDismiss ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vault-dup-title"
        aria-describedby="vault-dup-desc"
        className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-float sm:rounded-3xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="vault-dup-title"
          className="text-lg font-bold tracking-tight text-foreground"
        >
          중복 파일
        </h2>
        <p
          id="vault-dup-desc"
          className="mt-2 text-base leading-relaxed text-muted"
        >
          같은 이름이 보관함에 있습니다. 새 이름으로 올릴까요?
        </p>

        <div className="mt-6 space-y-5">
          <div>
            <p className="text-sm font-bold tracking-wide text-primary">
              올릴 파일
            </p>
            <p
              className="mt-2 break-all text-lg font-bold leading-relaxed tracking-tight text-foreground"
              title={nextName}
            >
              {nextName}
            </p>
          </div>

          <div>
            <p className="text-sm font-bold tracking-wide text-foreground">
              기존
            </p>
            <p
              className="mt-2 break-all text-base font-medium leading-relaxed text-muted"
              title={originalName}
            >
              {originalName}
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl px-5 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            올리기
          </button>
        </div>
      </div>
    </div>
  );
}
