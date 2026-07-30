"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/** 팝업, 다이얼로그 씬 공통: 힌트 + 다시 열기. */
export function PreviewStage({
  hint,
  open,
  onReopen,
  children,
}: {
  hint: string;
  open: boolean;
  onReopen: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative flex h-full min-h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <p className="text-base text-muted">{hint}</p>
        {!open ? (
          <Button type="button" size="sm" onClick={onReopen}>
            다시 열기
          </Button>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** 모션 씬 공통: 힌트 + 재생(리마운트). fill이면 전체 화면 구성, autoReplayMs면 자동 반복. */
export function ReplayStage({
  hint,
  children,
  fill = false,
  autoReplayMs,
}: {
  hint: string;
  children: (play: number) => ReactNode;
  /** 제품 전체 화면이 children을 채움 (패딩/중앙 정렬 없음) */
  fill?: boolean;
  /** 지정 시 해당 ms 후 자동 재생 */
  autoReplayMs?: number;
}) {
  const [play, setPlay] = useState(0);

  useEffect(() => {
    if (!autoReplayMs || autoReplayMs <= 0) return;
    const id = window.setTimeout(() => setPlay((n) => n + 1), autoReplayMs);
    return () => window.clearTimeout(id);
  }, [play, autoReplayMs]);

  return (
    <div className="flex h-full min-h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-card/80 px-4 py-2.5 backdrop-blur-sm">
        <p className="min-w-0 truncate text-base text-muted">{hint}</p>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={() => setPlay((n) => n + 1)}
        >
          재생
        </Button>
      </div>
      <div
        key={play}
        className={
          fill
            ? "min-h-0 flex-1 overflow-hidden"
            : "flex min-h-0 flex-1 flex-col justify-center px-6 pb-8 pt-4"
        }
      >
        {children(play)}
      </div>
    </div>
  );
}
