"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  TEAM_PREVIEW_ROLE_LABEL,
  TEAM_PREVIEW_ROLES,
  useTeamRolePreview,
} from "@/context/team-role-preview-context";
import { cn } from "@/lib/utils";

/** 관리자: 화면 UX + 팀 역할 미리보기. */
export function PageUxPreviewControl() {
  const { enabled, supported, surface, scenario, next, prev, isLive } =
    usePageUxPreview();
  const {
    enabled: roleEnabled,
    activeOnPage: roleActive,
    previewRole,
    setPreviewRole,
  } = useTeamRolePreview();

  const showUx = enabled && supported;
  const showRole = roleEnabled && roleActive;
  if (!showUx && !showRole) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[90] flex h-16 items-center justify-start gap-2 pl-14 pr-16 sm:pr-[4.5rem] lg:px-6">
      {showUx ? (
        <div
          className={cn(
            "pointer-events-auto inline-flex h-10 max-w-full items-center gap-0.5 rounded-full bg-card px-1 shadow-soft",
            !isLive && "ring-1 ring-primary/25",
          )}
          role="group"
          aria-label={`${surface.label} UX 미리보기`}
        >
          <button
            type="button"
            onClick={prev}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface"
            aria-label="이전 UX 상태"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <span className="min-w-0 max-w-[12rem] select-none truncate px-0.5 text-center text-sm font-semibold text-foreground sm:max-w-[16rem]">
            <span className="text-muted">{surface.label}</span>
            <span className="mx-1 text-muted-2">,</span>
            {scenario.label}
          </span>
          <button
            type="button"
            onClick={next}
            className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface"
            aria-label="다음 UX 상태"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      ) : null}

      {showRole ? (
        <div
          className={cn(
            "pointer-events-auto inline-flex h-10 max-w-full items-center gap-0.5 rounded-full bg-card p-1 shadow-soft",
            previewRole && "ring-1 ring-primary/25",
          )}
          role="group"
          aria-label="팀 역할 미리보기"
        >
          <button
            type="button"
            aria-pressed={previewRole === null}
            onClick={() => setPreviewRole(null)}
            className={cn(
              "min-h-8 rounded-full px-3 text-sm font-semibold transition-colors",
              previewRole === null
                ? "bg-primary text-primary-foreground"
                : "text-muted hover:bg-surface hover:text-foreground",
            )}
          >
            실제
          </button>
          {TEAM_PREVIEW_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              aria-pressed={previewRole === role}
              onClick={() => setPreviewRole(role)}
              className={cn(
                "min-h-8 rounded-full px-3 text-sm font-semibold transition-colors",
                previewRole === role
                  ? "bg-primary text-primary-foreground"
                  : "text-muted hover:bg-surface hover:text-foreground",
              )}
            >
              {TEAM_PREVIEW_ROLE_LABEL[role]}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
