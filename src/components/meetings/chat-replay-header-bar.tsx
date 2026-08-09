"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  CHAT_REPLAY_TITLE_MIN_WIDTH_PX,
  resolveChatReplayHeaderMode,
  type ChatReplayHeaderMode,
} from "@/lib/chat-replay-header-layout";
import { cn } from "@/lib/utils";

/**
 * 돌아가기 | 제목 | 도구.
 * 폭이 충분하면 1줄, 겹칠 정도면 위(돌아가기·도구) / 아래(제목) 2줄.
 */
export function ChatReplayHeaderBar({
  leading,
  center,
  trailing,
  className,
}: {
  leading: ReactNode;
  center: ReactNode;
  trailing: ReactNode;
  className?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const leadingRef = useRef<HTMLDivElement>(null);
  const trailingRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ChatReplayHeaderMode>("single");

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;

    let prev: ChatReplayHeaderMode = "single";
    const measure = () => {
      const next = resolveChatReplayHeaderMode(
        {
          containerWidth: root.clientWidth,
          leadingWidth: leadingRef.current?.offsetWidth ?? 0,
          trailingWidth: trailingRef.current?.offsetWidth ?? 0,
          titleMinWidth: CHAT_REPLAY_TITLE_MIN_WIDTH_PX,
          gapPx: 12,
        },
        prev,
      );
      prev = next;
      setMode((cur) => (cur === next ? cur : next));
    };

    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    measure();
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      data-chat-header-mode={mode}
      className={cn("min-w-0", className)}
    >
      {mode === "single" ? (
        <div className="flex min-w-0 items-center gap-2 md:gap-3">
          <div ref={leadingRef} className="min-w-0 shrink-0">
            {leading}
          </div>
          <div className="flex min-h-14 min-w-0 flex-1 items-center justify-center overflow-hidden px-1">
            {center}
          </div>
          <div ref={trailingRef} className="relative z-10 min-w-0 shrink-0">
            {trailing}
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div ref={leadingRef} className="min-w-0 shrink-0">
              {leading}
            </div>
            <div ref={trailingRef} className="relative z-10 min-w-0 shrink-0">
              {trailing}
            </div>
          </div>
          <div className="flex min-h-14 w-full min-w-0 items-center justify-center px-1">
            {center}
          </div>
        </div>
      )}
    </div>
  );
}
