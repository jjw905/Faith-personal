import type { ReactNode } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { MeetingRecordHeaderRow } from "@/components/meetings/meeting-record-layout";
import { cn } from "@/lib/utils";

/**
 * 운영·개발 화면 공통 크롬.
 * 대시보드/보관함과 동일: PageContainer soft + MeetingRecordHeaderRow.
 */
export function AdminPageChrome({
  title,
  trailing,
  leading,
  children,
  className,
  contentClassName,
  maxWidth = "max-w-6xl",
}: {
  title: ReactNode;
  trailing?: ReactNode;
  leading?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  /** 본문 폭. Changelog 등은 max-w-3xl */
  maxWidth?:
    | "max-w-3xl"
    | "max-w-5xl"
    | "max-w-6xl"
    | "max-w-7xl"
    | "max-w-none";
}) {
  return (
    <PageContainer soft className={className}>
      <div
        className={cn(
          "mx-auto flex w-full min-w-0 flex-col gap-6",
          maxWidth === "max-w-none" ? "max-w-none" : maxWidth,
        )}
      >
        <MeetingRecordHeaderRow
          leading={leading}
          center={
            typeof title === "string" ? (
              <h1 className="truncate text-center text-xl font-semibold tracking-tight text-foreground">
                {title}
              </h1>
            ) : (
              title
            )
          }
          trailing={trailing}
        />
        <div className={cn("min-w-0", contentClassName)}>{children}</div>
      </div>
    </PageContainer>
  );
}
