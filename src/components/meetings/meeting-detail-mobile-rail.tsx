"use client";

import { ChevronLeft, MessagesSquare } from "lucide-react";
import Link from "next/link";

/**
 * 모바일: 회의기록 하단은 돌아가기 + 대화보기만.
 * 구역 추적은 쓰지 않는다 (상단 탭과 중복 금지).
 */
export function MeetingDetailMobileRail({
  chatHref,
  backHref = "/dashboard",
}: {
  chatHref: string;
  backHref?: string;
}) {
  return (
    <nav
      className="pointer-events-none fixed inset-x-0 z-[55] md:hidden"
      style={{
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
      }}
      aria-label="회의기록 이동"
    >
      <div className="pointer-events-auto mx-auto flex w-max max-w-[calc(100vw-1.5rem)] items-center gap-2 rounded-full border border-border bg-card/95 p-1.5 shadow-float backdrop-blur-md">
        <Link
          href={backHref}
          className="inline-flex min-h-12 items-center gap-1.5 rounded-full px-4 text-base font-semibold text-foreground transition-colors hover:bg-surface"
        >
          <ChevronLeft className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
          돌아가기
        </Link>
        <Link
          href={chatHref}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          <MessagesSquare className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
          대화보기
        </Link>
      </div>
    </nav>
  );
}
