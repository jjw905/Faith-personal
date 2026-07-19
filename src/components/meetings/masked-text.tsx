"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { PiiMatch } from "@/lib/masking";
import { cn } from "@/lib/utils";

function matchKey(m: PiiMatch) {
  return `${m.start}:${m.end}:${m.type}`;
}

/** 마스킹 칩 — 클릭 시 해당 항목만 원문 토글. */
export function MaskedText({
  original,
  matches,
  onPrimary = false,
}: {
  original: string;
  matches: PiiMatch[];
  /** 내 말풍선(진한 primary) 위일 때 */
  onPrimary?: boolean;
}) {
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setRevealed(new Set());
  }, [original, matches]);

  const segments = useMemo(() => {
    if (!original) return [];
    if (!matches.length) {
      return [{ kind: "text" as const, text: original, key: "all" }];
    }
    const sorted = [...matches].sort((a, b) => a.start - b.start);
    const out: Array<
      | { kind: "text"; text: string; key: string }
      | { kind: "mask"; match: PiiMatch; key: string }
    > = [];
    let cursor = 0;
    for (const m of sorted) {
      const start = Math.max(0, Math.min(m.start, original.length));
      const end = Math.max(start, Math.min(m.end, original.length));
      if (start > cursor) {
        out.push({
          kind: "text",
          text: original.slice(cursor, start),
          key: `t-${cursor}`,
        });
      }
      out.push({ kind: "mask", match: m, key: matchKey(m) });
      cursor = end;
    }
    if (cursor < original.length) {
      out.push({
        kind: "text",
        text: original.slice(cursor),
        key: `t-${cursor}`,
      });
    }
    return out;
  }, [original, matches]);

  const toggle = useCallback((key: string) => {
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  if (!original) return null;

  return (
    <>
      {segments.map((seg) => {
        if (seg.kind === "text") {
          return <span key={seg.key}>{seg.text}</span>;
        }
        const open = revealed.has(seg.key);
        return (
          <button
            key={seg.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle(seg.key);
            }}
            title={open ? "다시 가리기" : "클릭하여 원문 보기"}
            className={cn(
              "mx-0.5 inline-block rounded-md px-1.5 font-mono text-[0.85em] font-semibold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              open
                ? onPrimary
                  ? "bg-white/25 text-primary-foreground underline decoration-dotted underline-offset-2"
                  : "bg-success-soft text-success underline decoration-dotted underline-offset-2"
                : onPrimary
                  ? "cursor-pointer bg-white/20 text-primary-foreground hover:bg-white/30"
                  : "animate-[mask-chip-in_220ms_ease-out] cursor-pointer bg-masked-soft text-masked hover:brightness-95",
            )}
          >
            {open ? seg.match.value : seg.match.replacement}
          </button>
        );
      })}
    </>
  );
}
