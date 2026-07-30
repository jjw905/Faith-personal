"use client";

import { UsersRound, X } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import {
  TEAM_SETTINGS_DIALOG_COPY,
  type TeamSettingsDialogVariant,
} from "@/lib/team/settings-gate";
import { cn } from "@/lib/utils";

export function CreateTeamFirstDialog({
  open,
  variant,
  onClose,
  contained,
  className,
}: {
  open: boolean;
  variant: TeamSettingsDialogVariant;
  onClose: () => void;
  /** 디자인 프리뷰용: 고정 배치 */
  contained?: boolean;
  className?: string;
}) {
  useEffect(() => {
    if (!open || contained) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [contained, onClose, open]);

  if (!open) return null;

  const copy = TEAM_SETTINGS_DIALOG_COPY[variant];

  const panel = (
    <div
      role="dialog"
      aria-modal="true"
        aria-labelledby="create-team-first-title"
        aria-describedby={copy.body ? "create-team-first-desc" : undefined}
      className={cn(
        "panel-surface relative w-full max-w-md overflow-hidden rounded-t-3xl px-6 pt-7 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] shadow-float sm:rounded-3xl sm:p-7",
        className,
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-3.5 top-3.5 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full text-foreground/70 hover:bg-surface-2 hover:text-foreground sm:right-4 sm:top-4"
      >
        <X className="h-5 w-5" strokeWidth={1.75} />
      </button>

      <div className="flex flex-col items-start gap-4 pr-10">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary-soft text-primary">
          <UsersRound className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 space-y-2">
          <h2
            id="create-team-first-title"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            {copy.title}
          </h2>
          {copy.body ? (
            <p
              id="create-team-first-desc"
              className="text-base leading-relaxed text-muted"
            >
              {copy.body}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-7 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full px-5 text-base font-semibold text-foreground transition-colors hover:bg-surface-2 sm:w-auto"
        >
          {copy.secondaryLabel}
        </button>
        {copy.primaryHref ? (
          <Link
            href={copy.primaryHref}
            onClick={onClose}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:w-auto"
          >
            {copy.primaryLabel}
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-full bg-primary px-5 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover sm:w-auto"
          >
            {copy.primaryLabel}
          </button>
        )}
      </div>
    </div>
  );

  if (contained) {
    return panel;
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onClick={onClose}
    >
      {panel}
    </div>
  );
}
