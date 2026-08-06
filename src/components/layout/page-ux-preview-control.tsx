"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

import { usePageUxPreview } from "@/context/page-ux-preview-context";
import {
  TEAM_PREVIEW_ROLE_LABEL,
  TEAM_PREVIEW_ROLES,
  useTeamRolePreview,
} from "@/context/team-role-preview-context";
import { cn } from "@/lib/utils";

/**
 * 상단 헤더(돌아가기·일자·기록 액션)와 겹치지 않게 좌하단 고정.
 * 우하단 모바일 추적 바·주요 CTA와 간섭을 피한다.
 * 모바일 하단 추적 바 위: safe-area + 5.75rem.
 */
function previewDockClass(pathname: string) {
  const aboveMobileBar =
    pathname === "/dashboard" ||
    pathname === "/meetings" ||
    pathname === "/vault" ||
    pathname.startsWith("/team");
  return cn(
    "pointer-events-none fixed z-[90] flex max-w-[calc(100vw-1.5rem)] flex-wrap items-center justify-start gap-2",
    "left-3 sm:left-5",
    // 모바일 추적 바: bottom 1.85rem + 바 높이(~4.25rem) 위 여유 → 6.75rem
    aboveMobileBar
      ? "bottom-[calc(env(safe-area-inset-bottom,0px)+6.75rem)] md:bottom-5"
      : "bottom-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:bottom-5",
  );
}

/** 관리자: 화면 UX + 팀 역할 미리보기. */
export function PageUxPreviewControl() {
  const pathname = usePathname();
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
    <div className={previewDockClass(pathname)}>
      {showUx ? (
        <div
          className={cn(
            "pointer-events-auto inline-flex h-10 max-w-full items-center gap-0.5 rounded-full bg-card px-1 shadow-float ring-1 ring-border",
            !isLive && "ring-primary/30",
          )}
          role="group"
          aria-label={`${surface.label} UX 미리보기`}
        >
          <button
            type="button"
            onClick={prev}
            className="inline-flex min-h-12 min-w-12 shrink-0 md:h-8 md:w-8 md:min-h-8 md:min-w-8 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface"
            aria-label="이전 UX 상태"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} />
          </button>
          <span className="min-w-0 max-w-[10rem] select-none truncate px-0.5 text-center text-sm font-semibold text-foreground sm:max-w-[14rem]">
            <span className="text-muted">{surface.label}</span>
            <span className="mx-1 text-muted-2">,</span>
            {scenario.label}
          </span>
          <button
            type="button"
            onClick={next}
            className="inline-flex min-h-12 min-w-12 shrink-0 md:h-8 md:w-8 md:min-h-8 md:min-w-8 cursor-pointer items-center justify-center rounded-full text-foreground transition-colors hover:bg-surface"
            aria-label="다음 UX 상태"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      ) : null}

      {showRole ? (
        <div
          className={cn(
            "pointer-events-auto inline-flex h-10 max-w-full items-center gap-0.5 rounded-full bg-card p-1 shadow-float ring-1 ring-border",
            previewRole && "ring-primary/30",
          )}
          role="group"
          aria-label="팀 역할 미리보기"
        >
          <button
            type="button"
            aria-pressed={previewRole === null}
            onClick={() => setPreviewRole(null)}
            className={cn(
              "min-h-12 rounded-full px-3 text-base font-semibold transition-colors md:min-h-8 md:text-sm",
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
                "min-h-12 rounded-full px-3 text-base font-semibold transition-colors md:min-h-8 md:text-sm",
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
