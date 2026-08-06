"use client";

import { Download, Share2, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";

import { VaultFileIcon } from "@/components/vault/vault-file-icon";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { formatVaultSize, type VaultItemMeta } from "@/lib/vault";
import { cn } from "@/lib/utils";

export type VaultConfirmAction = "delete" | "download" | "share";

/**
 * 보관함 다운로드, 공유, 삭제 확인.
 * 모바일은 바텀시트(확인 위, 취소 아래 = HIG 액션시트 순서), 데스크톱은 중앙 모달.
 * 톤: 기록 확인창(MeetingRecordsActionDialog)과 동일.
 */
export function VaultActionConfirmDialog({
  open,
  action,
  items,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  action: VaultConfirmAction;
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
  const destructive = action === "delete";
  const totalSize = items.reduce((sum, item) => sum + item.size, 0);

  const title = destructive
    ? single
      ? "이 파일을 삭제할까요?"
      : `파일 ${count}개를 삭제할까요?`
    : action === "download"
      ? single
        ? "이 파일을 받을까요?"
        : `파일 ${count}개를 받을까요?`
      : single
        ? "이 파일을 공유할까요?"
        : `파일 ${count}개를 공유할까요?`;

  const description = destructive
    ? "삭제 후 복구할 수 없습니다."
    : action === "download"
      ? `기기 저장 공간에 ${formatVaultSize(totalSize)}를 내려받습니다.`
      : "기기 공유 시트로 파일 원본이 전달됩니다.";

  const confirmLabel = destructive
    ? "삭제"
    : action === "download"
      ? "다운로드"
      : "공유";

  const ConfirmIcon = destructive ? Trash2 : action === "download" ? Download : Share2;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={blockDismiss ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="vault-action-confirm-title"
        aria-describedby="vault-action-confirm-desc"
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card shadow-float sm:max-h-[calc(100dvh-2rem)] sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-6 sm:px-7 sm:pt-7">
          <h2
            id="vault-action-confirm-title"
            className="text-xl font-bold tracking-tight text-foreground sm:text-lg"
          >
            {title}
          </h2>
          <p
            id="vault-action-confirm-desc"
            className="mt-2 text-base leading-relaxed text-muted"
          >
            {description}
          </p>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-base font-semibold text-muted">
                {single ? "대상 파일" : "선택 목록"}
              </p>
              {single ? null : (
                <span className="text-base font-semibold tabular-nums text-muted">
                  {count}개
                </span>
              )}
            </div>
            <ul
              ref={listRef}
              className="max-h-[min(40vh,16rem)] divide-y divide-border overflow-y-auto"
            >
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex min-w-0 items-center gap-3 py-3"
                >
                  <VaultFileIcon
                    name={item.name}
                    mime={item.mime}
                    size={20}
                    className="h-10 w-10 shrink-0 rounded-full border border-border bg-transparent"
                  />
                  <p
                    className="min-w-0 flex-1 truncate text-lg font-semibold leading-6 tracking-tight text-foreground"
                    title={item.name}
                  >
                    {item.name}
                  </p>
                  <span className="shrink-0 text-base tabular-nums text-muted">
                    {formatVaultSize(item.size)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
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
              onClick={onConfirm}
              disabled={busy}
              className={cn(
                "inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 text-base font-bold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-11 sm:min-h-0 sm:w-auto sm:rounded-xl",
                destructive
                  ? "bg-foreground text-background"
                  : "bg-primary text-primary-foreground",
              )}
            >
              <ConfirmIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
