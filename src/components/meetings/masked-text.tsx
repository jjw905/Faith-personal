"use client";

import { useCallback, useMemo, useState } from "react";

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
  /**
   * 가린 항목이 바뀔 때만 열어 둔 것을 닫는다.
   *
   * 배열을 그대로 의존성에 두면 안 된다. 재생 중에는 부모가 매초 다시 그려지고
   * 그때마다 matches가 새 배열이 되어, 열어 둔 항목이 1초 만에 도로 잠긴다.
   */
  const resetKey = useMemo(
    () => `${original}\u0000${matches.map(matchKey).join("|")}`,
    [original, matches],
  );

  const [state, setState] = useState<{ key: string; revealed: Set<string> }>(
    () => ({ key: resetKey, revealed: new Set() }),
  );
  if (state.key !== resetKey) {
    setState({ key: resetKey, revealed: new Set() });
  }
  const revealed = state.revealed;

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
    setState((prev) => {
      const next = new Set(prev.revealed);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { key: prev.key, revealed: next };
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
              "mx-0.5 inline-flex min-h-12 items-center rounded-md px-1.5 font-mono text-base font-semibold transition-colors md:inline-block md:min-h-0 md:text-[0.85em]",
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
