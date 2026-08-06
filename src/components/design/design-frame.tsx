"use client";

import type { ReactNode } from "react";

import {
  DESIGN_KIND_LABEL,
  type DesignSceneKind,
} from "@/components/design/design-catalog";
import {
  DesignViewportPicker,
  DesignViewportStage,
  useDesignViewport,
} from "@/components/design/use-design-viewport";
import { cn } from "@/lib/utils";

/** 씬 메타 + 창 크기 선택 + 레이아웃 프리뷰 스테이지. */
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
  const { viewport, setViewport, width } = useDesignViewport();

  return (
    <div className="space-y-3">
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
      <DesignViewportPicker value={viewport} onChange={setViewport} />
      {/* 모바일: 72dvh면 하단 카탈로그와 CTA 히트 겹침 → 여유 확보. */}
      <div className="relative z-10 h-[min(58dvh,40rem)] min-h-[20rem] overflow-hidden rounded-2xl bg-surface ring-1 ring-border/60 sm:h-[min(72dvh,48rem)] sm:min-h-[28rem] lg:h-[min(78vh,48rem)] lg:min-h-[36rem]">
        <DesignViewportStage width={width} className="absolute inset-0 min-w-0">
          {children}
        </DesignViewportStage>
      </div>
    </div>
  );
}
