"use client";

import { WandSparkles } from "lucide-react";

import type { TranscriptCorrection } from "@/types/transcript";
import { cn } from "@/lib/utils";

/**
 * 오인식 보정 추천. 본문은 자동으로 고치지 않고 "이 말이었을 수 있다"만
 * 보여준다. 사용자가 알약을 누르면 그때 본문에 반영한다.
 * 넓은 화면에서는 말풍선 오른쪽, 좁으면 아래에 붙는다.
 */
export function CorrectionHint({
  corrections,
  className,
  align = "start",
  onApply,
}: {
  corrections: TranscriptCorrection[];
  className?: string;
  align?: "start" | "end";
  onApply?: (correction: TranscriptCorrection) => void;
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
        <button
          key={`${c.wrong}-${c.suggestion}`}
          type="button"
          disabled={!onApply}
          title={
            onApply
              ? `눌러서 "${c.suggestion}"로 반영, ${c.reason ?? "발음이 비슷한 말"}`
              : (c.reason ?? "발음이 비슷한 말")
          }
          onClick={() => onApply?.(c)}
          className={cn(
            "inline-flex min-h-12 max-w-full items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-base text-muted transition-colors",
            onApply && "cursor-pointer hover:bg-primary-soft hover:text-foreground active:scale-[0.98]",
          )}
        >
          <WandSparkles className="h-5 w-5 shrink-0" strokeWidth={1.75} />
          <span className="min-w-0 truncate">
            <span className="line-through">{c.wrong}</span>
            <span className="px-1">→</span>
            <span className="font-semibold text-foreground">
              {c.suggestion}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
