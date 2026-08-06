"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

import { MaskedText } from "@/components/meetings/masked-text";
import { MaskStylePopup } from "@/components/meetings/mask-style-picker";
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

/** 카드형 표면 대신 기록형 평면 — 얇은 보더만. */
function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border/60 bg-transparent",
        className,
      )}
    >
      {children}
    </div>
  );
}

const btnBase =
  "inline-flex min-h-12 items-center justify-center rounded-xl px-4 py-2 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40";

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
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="flex h-[560px] min-h-[560px] flex-col overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4">
            <h2 className="text-base font-semibold text-foreground">원문</h2>
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
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 pb-3 pt-4">
            <h2 className="text-base font-semibold text-foreground">
              마스킹 결과
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-base font-medium text-muted">
                탐지 {detectionCount}건
              </span>
              <MaskStylePopup value={maskStyle} onChange={setMaskStyle} />
            </div>
          </div>

          <div className="relative mt-3 flex min-h-0 flex-1 flex-col overflow-hidden">
            <button
              type="button"
              onClick={clearSession}
              title="결과 새로고침"
              aria-label="결과 새로고침"
              className="absolute right-3 top-0 z-10 inline-flex h-12 w-12 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface/70 hover:text-foreground"
            >
              <RefreshCw className="h-5 w-5" />
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
          <div className="mt-auto border-t border-border px-4 py-3">
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
              className="min-h-14 w-full resize-none rounded-xl bg-transparent px-3.5 py-3 text-base leading-6 text-foreground outline-none ring-1 ring-border/60 placeholder:text-muted-2 focus:ring-2 focus:ring-ring"
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
        "flex w-full animate-[bubble-in_240ms_ease-out] motion-reduce:animate-none",
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
          <p className="text-xs font-semibold text-muted-2">
            {label}
            {typing ? <span className="ml-1.5 text-primary">입력 중</span> : null}
          </p>
          {maskedCount && maskedCount > 0 ? (
            <span className="rounded-md bg-masked-soft px-1.5 py-0.5 text-xs font-semibold text-masked">
              가림 {maskedCount}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm leading-6 text-foreground">{children}</p>
      </div>
    </div>
  );
}

export function RunningDots() {
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
