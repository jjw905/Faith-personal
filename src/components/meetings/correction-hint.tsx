"use client";

import { WandSparkles } from "lucide-react";

import type { TranscriptCorrection } from "@/types/transcript";
import { cn } from "@/lib/utils";

/**
 * 오인식 보정 추천. 본문은 고치지 않고 "이 말이었을 수 있다"만 보여준다.
 * 넓은 화면에서는 말풍선 오른쪽, 좁으면 아래에 붙는다.
 */
export function CorrectionHint({
  corrections,
  className,
  align = "start",
}: {
  corrections: TranscriptCorrection[];
  className?: string;
  align?: "start" | "end";
}) {
  if (corrections.length === 0) return null;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1",
        align === "end" ? "items-end text-right" : "items-start text-left",
        className,
      )}
    >
      {corrections.slice(0, 3).map((c) => (
        <span
          key={`${c.wrong}-${c.suggestion}`}
          title={c.reason ? `${c.reason}` : "발음이 비슷한 말"}
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-surface-2 px-2 py-1 text-xs text-muted"
        >
          <WandSparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 truncate">
            <span className="line-through">{c.wrong}</span>
            <span className="px-1">→</span>
            <span className="font-semibold text-foreground">
              {c.suggestion}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}
