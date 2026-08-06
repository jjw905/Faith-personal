import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * 레일(접힘) 아이콘 호버 시 아이콘 근처 제목.
 * group-hover / group-focus-visible 로 페이드·살짝 이동.
 */
export function RailHoverCaption({
  children,
  className,
  /** 하단 고정 영역(알림·계정)은 위로 띄워 뷰포트 밖을 피함 */
  placement = "below",
}: {
  children: ReactNode;
  className?: string;
  placement?: "below" | "above";
}) {
  const below = placement === "below";
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-1/2 z-30 -translate-x-1/2",
        below
          ? "top-[calc(100%-0.2rem)] origin-top translate-y-1"
          : "bottom-[calc(100%-0.2rem)] origin-bottom -translate-y-1",
        "max-w-[4.25rem] rounded-lg bg-card px-1.5 py-0.5 text-center text-[11px] font-semibold leading-tight text-foreground",
        "line-clamp-2 break-keep shadow-soft ring-1 ring-border/80",
        "scale-95 opacity-0",
        "transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
        "group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100",
        "group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** 레일 아이콘 셀 — caption용 group + relative */
export const RAIL_ICON_CELL =
  "group relative mx-auto flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-xl outline-none transition-colors";
