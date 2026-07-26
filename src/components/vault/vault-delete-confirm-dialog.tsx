"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { VaultFileIcon } from "@/components/vault/vault-file-icon";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { formatVaultSize, type VaultItemMeta } from "@/lib/vault";
import { cn } from "@/lib/utils";

/** 보관함 선택 삭제 확인. */
export function VaultDeleteConfirmDialog({
  open,
  items,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  items: VaultItemMeta[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { isLive } = usePageUxPreview();
  const blockDismiss = busy && isLive;
  const listRef = useRef<HTMLUListElement>(null);
  const peekPlayedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !blockDismiss) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, blockDismiss, onCancel]);

  useEffect(() => {
    if (!open) {
      peekPlayedRef.current = false;
      return;
    }

    let cancelled = false;
    let returnTimer = 0;
    const startTimer = window.setTimeout(() => {
      const el = listRef.current;
      if (!el || cancelled || peekPlayedRef.current) return;
      if (el.scrollHeight <= el.clientHeight + 1) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      peekPlayedRef.current = true;
      const peek = Math.min(56, el.scrollHeight - el.clientHeight);
      el.scrollTo({ top: peek, behavior: "smooth" });
      returnTimer = window.setTimeout(() => {
        if (!cancelled) el.scrollTo({ top: 0, behavior: "smooth" });
      }, 520);
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearTimeout(returnTimer);
    };
  }, [open, items]);

  if (!open || items.length === 0) return null;

  const count = items.length;
  const single = count === 1;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={blockDismiss ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vault-delete-confirm-title"
        aria-describedby="vault-delete-confirm-desc"
        className="w-full max-w-md rounded-t-3xl bg-card p-6 shadow-float sm:rounded-3xl sm:p-7"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="vault-delete-confirm-title"
          className="text-lg font-bold tracking-tight text-foreground"
        >
          {single ? "이 파일을 삭제할까요?" : "선택한 파일을 삭제할까요?"}
        </h2>
        <p
          id="vault-delete-confirm-desc"
          className="mt-2 text-base leading-relaxed text-muted"
        >
          삭제 후 복구할 수 없습니다.
        </p>

        <div className="mt-5">
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-muted">선택 목록</p>
            <span className="text-sm font-semibold tabular-nums text-muted">
              {count}개
            </span>
          </div>
          <ul ref={listRef} className="max-h-52 space-y-1 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex min-w-0 items-center gap-3 py-2"
              >
                <VaultFileIcon
                  name={item.name}
                  mime={item.mime}
                  size={18}
                  className="h-9 w-9"
                />
                <p
                  className="min-w-0 flex-1 truncate text-base font-semibold text-foreground"
                  title={item.name}
                >
                  {item.name}
                </p>
                <span className="shrink-0 text-sm tabular-nums text-muted">
                  {formatVaultSize(item.size)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
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
            className={cn(
              "inline-flex h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-masked px-5 text-base font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto",
            )}
          >
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}
