import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** 운영·통계 보더리스 섹션 (Card 셸 대체). */
export function AdminSection({
  title,
  description,
  trailing,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0 space-y-3", className)}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {typeof title === "string" ? (
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              {title}
            </h2>
          ) : (
            title
          )}
          {description ? (
            <p className="mt-1 text-base leading-6 text-muted">{description}</p>
          ) : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** 운영 체크·목록 데이터 행. 섹션면이 아닌 행만 surface. */
export function AdminDataRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-2xl bg-surface px-4 py-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}
