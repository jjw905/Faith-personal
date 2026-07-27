import { cn } from "@/lib/utils";

/** 목록·패널 로딩. CSS `faith-loading-ring` + running-dots. */
export function LoadingMark({
  size = "md",
  label = "불러오는 중",
  showLabel = true,
  className,
}: {
  size?: "sm" | "md";
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center gap-2.5 text-muted", className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span
        className={cn(
          "faith-loading-ring shrink-0",
          size === "md" && "faith-loading-ring-lg",
        )}
        aria-hidden
      />
      {showLabel ? (
        <span
          className={cn(
            "inline-flex items-center gap-1 font-medium",
            size === "sm" ? "text-sm" : "text-base",
          )}
        >
          {label}
          <span
            className="running-dots inline-flex items-center gap-1"
            aria-hidden
          >
            <span />
            <span />
            <span />
          </span>
        </span>
      ) : null}
    </div>
  );
}
