import { cn } from "@/lib/utils";

/** 페이지 상단 제목/설명 — 전 페이지 공통 사용. */
export function PageHeader({
  title,
  description,
  actions,
  leading,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** 큰 제목 왼쪽에 붙는 보조 정보 (예: 오늘 날짜). */
  leading?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4",
        className,
      )}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {leading ? (
            <p className="text-2xl font-bold leading-none tracking-tight text-foreground">
              {leading}
            </p>
          ) : null}
          <h1 className="text-2xl font-bold leading-none tracking-tight text-foreground">
            {title}
          </h1>
        </div>
        {description ? (
          <p className="mt-1 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex min-w-0 flex-1 items-center justify-end sm:max-w-sm sm:flex-none">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
