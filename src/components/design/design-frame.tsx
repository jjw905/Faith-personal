import type { ReactNode } from "react";

import {
  DESIGN_KIND_LABEL,
  type DesignSceneKind,
} from "@/components/design/design-catalog";
import { cn } from "@/lib/utils";

/** 씬 메타 + 레이아웃 프리뷰 스테이지. */
export function DesignFrame({
  route,
  kind,
  trigger,
  children,
}: {
  route?: string;
  kind: DesignSceneKind;
  trigger?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-2">
        {route ? (
          <span className="rounded-md bg-surface-2 px-2 py-0.5 font-medium tabular-nums text-muted">
            {route}
          </span>
        ) : null}
        <span
          className={cn(
            "rounded-md px-2 py-0.5 font-semibold",
            kind === "trigger" && "bg-primary-soft text-primary",
            kind === "popup" && "bg-surface-2 text-foreground",
            kind === "animation" && "bg-primary-soft text-primary",
          )}
        >
          {DESIGN_KIND_LABEL[kind]}
        </span>
        {trigger ? (
          <span className="min-w-0 font-medium text-muted">{trigger}</span>
        ) : null}
      </div>
      <div className="relative h-[min(78vh,48rem)] min-h-[36rem] overflow-hidden rounded-2xl bg-surface ring-1 ring-border/60">
        <div className="absolute inset-0 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
