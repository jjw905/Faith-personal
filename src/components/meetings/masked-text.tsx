"use client";

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import type { PiiMatch } from "@/lib/masking";
import { cn } from "@/lib/utils";
import type { TranscriptWordTiming } from "@/types/transcript";

function matchKey(m: PiiMatch) {
  return `${m.start}:${m.end}:${m.type}`;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/** 마스킹 칩 — 클릭 시 해당 항목만 원문 토글. */
export function MaskedText({
  original,
  matches,
  onPrimary = false,
  activeWordRange,
  activeWordStrength = 1,
  words,
  onWordSeek,
}: {
  original: string;
  matches: PiiMatch[];
  /** 내 말풍선(진한 primary) 위일 때 */
  onPrimary?: boolean;
  /** 재생 중인 단어의 원문 offset. 형광펜처럼 그 구간만 강조한다. */
  activeWordRange?: { startOffset: number; endOffset: number } | null;
  /** 발화 중 1, 발화가 끊긴 직후 0까지 감쇠한다. */
  activeWordStrength?: number;
  /** 본문 단어별 실측 시각. 있으면 각 단어를 정확한 시각의 탐색점으로 만든다. */
  words?: TranscriptWordTiming[];
  onWordSeek?: (word: TranscriptWordTiming) => void;
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
      return [
        { kind: "text" as const, text: original, start: 0, end: original.length, key: "all" },
      ];
    }
    const sorted = [...matches].sort((a, b) => a.start - b.start);
    const out: Array<
      | { kind: "text"; text: string; start: number; end: number; key: string }
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
          start: cursor,
          end: start,
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
        start: cursor,
        end: original.length,
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

  const markClass = onPrimary
    ? "word-play-mark word-play-mark-on-primary"
    : "word-play-mark";
  const markStyle = {
    "--word-focus-strength": Math.min(1, Math.max(0, activeWordStrength)),
  } as CSSProperties;

  const renderTextRange = (start: number, end: number, key: string) => {
    const inRange = (words ?? [])
      .filter((word) => overlaps(start, end, word.startOffset, word.endOffset))
      .sort((left, right) => left.startOffset - right.startOffset);

    // 단어 시각이 없는 예전 기록도 기존 하이라이트 표시는 그대로 유지한다.
    if (inRange.length === 0) {
      if (
        !activeWordRange ||
        !overlaps(start, end, activeWordRange.startOffset, activeWordRange.endOffset)
      ) {
        return <span key={key}>{original.slice(start, end)}</span>;
      }
      const hiStart = Math.max(start, activeWordRange.startOffset);
      const hiEnd = Math.min(end, activeWordRange.endOffset);
      return (
        <span key={key}>
          {original.slice(start, hiStart)}
          <mark data-word-play-mark className={markClass} style={markStyle}>
            {original.slice(hiStart, hiEnd)}
          </mark>
          {original.slice(hiEnd, end)}
        </span>
      );
    }

    const nodes: ReactNode[] = [];
    let cursor = start;
    for (const word of inRange) {
      const wordStart = Math.max(start, word.startOffset, cursor);
      const wordEnd = Math.min(end, word.endOffset);
      if (wordEnd <= wordStart) continue;
      if (wordStart > cursor) {
        nodes.push(
          <span key={`${key}-plain-${cursor}`}>
            {original.slice(cursor, wordStart)}
          </span>,
        );
      }
      const isActive =
        activeWordRange &&
        overlaps(
          wordStart,
          wordEnd,
          activeWordRange.startOffset,
          activeWordRange.endOffset,
        );
      const content = isActive ? (
        <mark data-word-play-mark className={markClass} style={markStyle}>
          {original.slice(wordStart, wordEnd)}
        </mark>
      ) : (
        original.slice(wordStart, wordEnd)
      );
      nodes.push(
        onWordSeek ? (
          <span
            key={`${key}-word-${word.startOffset}`}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              onWordSeek(word);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              event.stopPropagation();
              onWordSeek(word);
            }}
            title={`${word.startSec.toFixed(2)}초부터 재생`}
            className={cn(
              "cursor-pointer rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
              onPrimary ? "hover:bg-white/15" : "hover:bg-foreground/10",
            )}
          >
            {content}
          </span>
        ) : (
          <span key={`${key}-word-${word.startOffset}`}>{content}</span>
        ),
      );
      cursor = wordEnd;
    }
    if (cursor < end) {
      nodes.push(
        <span key={`${key}-tail-${cursor}`}>{original.slice(cursor, end)}</span>,
      );
    }
    return <span key={key}>{nodes}</span>;
  };

  return (
    <>
      {segments.map((seg) => {
        if (seg.kind === "text") {
          return renderTextRange(seg.start, seg.end, seg.key);
        }
        const open = revealed.has(seg.key);
        const isActive =
          activeWordRange &&
          overlaps(
            seg.match.start,
            seg.match.end,
            activeWordRange.startOffset,
            activeWordRange.endOffset,
          );
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
                  : "animate-[mask-chip-in_220ms_ease-out] motion-reduce:animate-none cursor-pointer bg-masked-soft text-masked hover:brightness-95",
              isActive && markClass,
            )}
            style={isActive ? markStyle : undefined}
          >
            {open ? seg.match.value : seg.match.replacement}
          </button>
        );
      })}
    </>
  );
}
