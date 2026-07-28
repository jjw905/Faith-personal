"use client";

import { useState, type ReactNode } from "react";

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

/** 모션 씬 공통: 힌트 + 재생(리마운트). */
export function ReplayStage({
  hint,
  children,
}: {
  hint: string;
  children: (play: number) => ReactNode;
}) {
  const [play, setPlay] = useState(0);
  return (
    <div className="flex h-full min-h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 py-3">
        <p className="text-base text-muted">{hint}</p>
        <Button type="button" size="sm" onClick={() => setPlay((n) => n + 1)}>
          재생
        </Button>
      </div>
      <div
        key={play}
        className="flex min-h-0 flex-1 flex-col justify-center px-6 pb-8 pt-4"
      >
        {children(play)}
      </div>
    </div>
  );
}
