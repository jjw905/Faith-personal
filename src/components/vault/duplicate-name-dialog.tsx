"use client";

import { useEffect } from "react";

import { cn } from "@/lib/utils";

/** 보관함 동일 이름 → (1) 올리기 확인. 후(결과)를 크게, 전은 보조. */
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
      onClick={busy ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vault-dup-title"
        aria-describedby="vault-dup-desc"
        className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-float sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="vault-dup-title"
          className="text-base font-bold tracking-tight text-foreground"
        >
          중복 파일
        </h2>
        <p
          id="vault-dup-desc"
          className="mt-1.5 text-sm leading-relaxed text-muted"
        >
          같은 이름이 보관함에 있습니다. 새 이름으로 올릴까요?
        </p>

        <div className="mt-5 min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-2">
            올릴 이름
          </p>
          <p
            className="mt-1.5 break-all text-lg font-bold leading-snug tracking-tight text-foreground"
            title={nextName}
          >
            {nextName}
          </p>
        </div>

        <p
          className="mt-4 break-all text-xs leading-relaxed text-muted"
          title={originalName}
        >
          기존{" "}
          <span className="font-medium text-muted">{originalName}</span>
        </p>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-10 sm:w-auto"
          >
            올리기
          </button>
        </div>
      </div>
    </div>
  );
}
