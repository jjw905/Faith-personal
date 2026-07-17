"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { useHybridMask } from "@/hooks/use-hybrid-mask";
import { useLiveTranscript } from "@/hooks/use-live-transcript";
import { maskPii, type MaskStyle, type PiiMatch } from "@/lib/masking";
import { generateRandomConversation } from "@/lib/masking/random-conversation";
import { cn } from "@/lib/utils";

type ChatLine = {
  id: string;
  speaker: string;
  text: string;
  masked: string;
  matches: PiiMatch[];
};

// 마스킹 토큰 키 — 같은 문장 안 개별 매치 구분
function matchKey(m: PiiMatch) {
  return `${m.start}:${m.end}:${m.type}`;
}

/** 마스킹 칩 클릭 시 해당 항목만 원문으로 토글. */
function MaskedText({
  original,
  matches,
}: {
  original: string;
  matches: PiiMatch[];
}) {
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());

  // 원문이 바뀌면 공개 상태 초기화
  useEffect(() => {
    setRevealed(new Set());
  }, [original]);

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
                ? "bg-success-soft text-success underline decoration-dotted underline-offset-2"
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

/** 카드형 표면 — 선 대신 소프트 섀도우로 요소를 분리. */
function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl bg-card shadow-soft", className)}>
      {children}
    </div>
  );
}

const btnBase =
  "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

async function maskViaApi(text: string, style: MaskStyle) {
  try {
    const res = await fetch("/api/mask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, useNer: true, style }),
    });
    if (!res.ok) throw new Error("mask api failed");
    return (await res.json()) as { masked: string; matches: PiiMatch[] };
  } catch {
    const fallback = maskPii(text, { style });
    return { masked: fallback.masked, matches: fallback.matches };
  }
}

export function LiveMaskingTranscript() {
  const [session, setSession] = useState(() => generateRandomConversation());
  const { utterances } = session;
  const [chatInput, setChatInput] = useState("");
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [maskStyle, setMaskStyle] = useState<MaskStyle>("partial");

  const { result: hybridLive } = useHybridMask(chatInput, maskStyle);
  const liveChatMasked = useMemo(() => {
    if (!chatInput.trim()) return null;
    return hybridLive ?? maskPii(chatInput, { style: maskStyle });
  }, [chatInput, hybridLive, maskStyle]);

  const {
    status,
    visible,
    streamingText,
    streamingMasked,
    streamingMatches,
    maskedResult,
    maskedUtterances,
    play,
    reset,
  } = useLiveTranscript(utterances, { charIntervalMs: 18, style: maskStyle });

  // 누를 때마다 항상 새 무작위 대화 적용
  const handlePlay = useCallback(() => {
    setChatLines([]);
    setChatInput("");
    const next = generateRandomConversation();
    setSession(next);
    play(next.utterances);
  }, [play]);

  const clearSession = useCallback(() => {
    reset();
    setChatLines([]);
    setChatInput("");
  }, [reset]);

  // 표기 방식 전환 시 이미 보낸 말풍선도 같은 스타일로 다시 가림
  useEffect(() => {
    setChatLines((prev) =>
      prev.map((line) => {
        const next = maskPii(line.text, { style: maskStyle });
        return { ...line, masked: next.masked, matches: next.matches };
      }),
    );
  }, [maskStyle]);

  const detectionCount = useMemo(() => {
    const fromSim = maskedResult.matches.length;
    const fromChat = liveChatMasked?.matches.length ?? 0;
    const fromSent = chatLines.reduce((n, l) => n + l.matches.length, 0);
    return fromSim + fromChat + fromSent;
  }, [maskedResult.matches, liveChatMasked, chatLines]);

  const sendChat = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    const id = `chat-${crypto.randomUUID()}`;
    setChatInput("");
    const masked = await maskViaApi(text, maskStyle);
    setChatLines((prev) => [
      ...prev,
      { id, speaker: "나", text, masked: masked.masked, matches: masked.matches },
    ]);
  }, [chatInput, maskStyle]);

  // 최신 말풍선이 항상 하단에 오도록 스크롤 고정
  const origRef = useRef<HTMLDivElement>(null);
  const maskRef = useRef<HTMLDivElement>(null);
  const contentKey = `${chatLines.length}|${visible.length}|${streamingText.length}|${chatInput.length}|${liveChatMasked?.masked.length ?? 0}|${streamingMasked.length}`;
  useEffect(() => {
    const stickBottom = () => {
      for (const el of [origRef.current, maskRef.current]) {
        if (!el) continue;
        el.scrollTop = el.scrollHeight;
      }
    };
    stickBottom();
    requestAnimationFrame(stickBottom);
  }, [contentKey]);

  const isEmpty =
    status === "idle" &&
    visible.length === 0 &&
    chatLines.length === 0 &&
    chatInput.length === 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          개인정보 마스킹 실험
        </h1>
        <p className="mt-1 text-sm text-muted">
          입력 텍스트에서 개인정보를 실시간으로 감지, 마스킹합니다.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="flex h-[560px] min-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-sm font-semibold text-foreground">원문</h2>
          </div>
          <div
            ref={origRef}
            className="mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-5"
          >
            {isEmpty ? (
              <EmptyHint>입력하거나 무작위 입력을 눌러보세요.</EmptyHint>
            ) : (
              <>
                <div className="min-h-0 flex-1" aria-hidden />
                <div className="flex flex-col gap-2.5">
                  {visible.map((u) => (
                    <MessageBubble key={u.id} label="샘플" align="start">
                      {u.text}
                    </MessageBubble>
                  ))}
                  {streamingText ? (
                    <MessageBubble label="샘플" typing align="start">
                      {streamingText}
                      <Caret />
                    </MessageBubble>
                  ) : null}
                  {chatLines.map((line) => (
                    <MessageBubble key={line.id} label={line.speaker} align="end">
                      {line.text}
                    </MessageBubble>
                  ))}
                  {chatInput.length > 0 ? (
                    <MessageBubble label="나" typing align="end">
                      {chatInput}
                      <Caret />
                    </MessageBubble>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </Panel>

        <Panel className="flex h-[560px] min-h-[560px] flex-col overflow-hidden">
          {/* 채팅 상단: 마스킹 슬라이드 */}
          <div className="space-y-3 border-b border-border px-5 pb-3 pt-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-foreground">
                마스킹 결과
              </h2>
              <span className="text-xs font-medium text-muted">
                탐지 {detectionCount}건
              </span>
            </div>

            <MaskStyleSlide value={maskStyle} onChange={setMaskStyle} />
          </div>

          <div className="relative mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
            <button
              type="button"
              onClick={clearSession}
              title="결과 새로고침"
              aria-label="결과 새로고침"
              className="absolute right-3 top-0 z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-card text-muted shadow-soft transition-colors hover:bg-surface hover:text-foreground"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <div
              ref={maskRef}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-3 pr-11"
            >
            {isEmpty ? (
              <EmptyHint>개인정보가 완성되는 순간 가려집니다.</EmptyHint>
            ) : (
              <>
                <div className="min-h-0 flex-1" aria-hidden />
                <div className="flex flex-col gap-2.5">
                  {maskedUtterances.map((u) => (
                    <MessageBubble key={u.id} label="샘플" align="start">
                      <MaskedText original={u.text} matches={u.matches} />
                    </MessageBubble>
                  ))}
                  {streamingMasked ? (
                    <MessageBubble label="샘플" typing align="start">
                      <MaskedText
                        original={streamingText}
                        matches={streamingMatches}
                      />
                      <Caret />
                    </MessageBubble>
                  ) : null}
                  {chatLines.map((line) => (
                    <MessageBubble
                      key={line.id}
                      label={line.speaker}
                      align="end"
                      maskedCount={line.matches.length}
                    >
                      <MaskedText
                        original={line.text}
                        matches={line.matches}
                      />
                    </MessageBubble>
                  ))}
                  {chatInput.length > 0 ? (
                    <MessageBubble
                      label="나"
                      typing
                      align="end"
                      maskedCount={liveChatMasked?.matches.length ?? 0}
                    >
                      <MaskedText
                        original={chatInput}
                        matches={liveChatMasked?.matches ?? []}
                      />
                      <Caret />
                    </MessageBubble>
                  ) : null}
                </div>
              </>
            )}
            </div>
          </div>

          {/* 채팅 입력창 */}
          <div className="mt-auto border-t border-border bg-surface/60 px-4 py-3">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onCompositionEnd={(e) => setChatInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat();
                }
              }}
              placeholder="메시지를 입력하세요. 개인정보는 보내는 순간 가려집니다."
              rows={2}
              className="min-h-14 w-full resize-none rounded-xl bg-card px-3.5 py-3 text-sm leading-6 text-foreground outline-none ring-ring placeholder:text-muted-2 focus:ring-2"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handlePlay}
                  className={cn(
                    btnBase,
                    "bg-primary text-primary-foreground hover:bg-primary-hover",
                    status === "playing" && "min-w-[5.5rem]",
                  )}
                >
                  {status === "playing" ? (
                    <>
                      입력
                      <RunningDots />
                    </>
                  ) : (
                    "무작위 입력"
                  )}
                </button>
                <button
                  type="button"
                  onClick={clearSession}
                  className={cn(
                    btnBase,
                    "bg-surface-2 text-muted hover:bg-surface",
                  )}
                >
                  초기화
                </button>
              </div>
              <button
                type="button"
                onClick={sendChat}
                disabled={!chatInput.trim()}
                className={cn(
                  btnBase,
                  "bg-primary text-primary-foreground hover:bg-primary-hover",
                )}
              >
                전송
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** MD3 세그먼트 슬라이드 — 부분 마스킹 / 유형 토큰 */
function MaskStyleSlide({
  value,
  onChange,
}: {
  value: MaskStyle;
  onChange: (next: MaskStyle) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="마스킹 표기 방식"
      className="grid grid-cols-2 gap-0.5 rounded-xl bg-card p-0.5 shadow-soft"
    >
      <button
        type="button"
        role="tab"
        aria-selected={value === "partial"}
        onClick={() => onChange("partial")}
        className={cn(
          "flex w-full items-center justify-center rounded-[10px] px-[5px] py-[5px] text-center text-xs font-semibold leading-snug transition-colors",
          value === "partial"
            ? "bg-primary text-primary-foreground"
            : "bg-transparent text-muted hover:text-foreground",
        )}
      >
        부분 마스킹, 2049420****
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={value === "label"}
        onClick={() => onChange("label")}
        className={cn(
          "flex w-full items-center justify-center rounded-[10px] px-[5px] py-[5px] text-center text-xs font-semibold leading-snug transition-colors",
          value === "label"
            ? "bg-primary text-primary-foreground"
            : "bg-transparent text-muted hover:text-foreground",
        )}
      >
        유형 토큰, [비밀키]
      </button>
    </div>
  );
}

/** 대화 말풍선 — 채팅 정렬 + 등장 애니메이션 */
function MessageBubble({
  label,
  typing,
  align = "start",
  maskedCount,
  children,
}: {
  label: string;
  typing?: boolean;
  align?: "start" | "end";
  maskedCount?: number;
  children: React.ReactNode;
}) {
  const mine = align === "end";
  return (
    <div
      className={cn(
        "flex w-full animate-[bubble-in_240ms_ease-out]",
        mine ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[92%] rounded-2xl px-3.5 py-2.5",
          mine ? "rounded-br-md bg-primary-soft" : "rounded-bl-md bg-surface",
        )}
      >
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold text-muted-2">
            {label}
            {typing ? <span className="ml-1.5 text-primary">입력 중</span> : null}
          </p>
          {maskedCount && maskedCount > 0 ? (
            <span className="rounded-md bg-masked-soft px-1.5 py-0.5 text-[10px] font-semibold text-masked">
              가림 {maskedCount}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-foreground">{children}</p>
      </div>
    </div>
  );
}

function RunningDots() {
  return (
    <span className="running-dots ml-0.5 inline-flex items-center gap-0.5" aria-hidden>
      <span />
      <span />
      <span />
    </span>
  );
}

function Caret() {
  return (
    <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-primary align-middle" />
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-auto py-16 text-center text-sm text-muted-2">{children}</p>
  );
}
