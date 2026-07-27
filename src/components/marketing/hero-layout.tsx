"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { Container } from "@/components/marketing/container";

const SIDE_MQ = "(min-width: 1280px)";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const MS = 520;

function flip(el: HTMLElement, first: DOMRect, last: DOMRect) {
  const dx = first.left - last.left;
  const dy = first.top - last.top;
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: "translate(0, 0)" },
    ],
    { duration: MS, easing: EASE },
  );
}

/**
 * 히어로 2열 레이아웃.
 * 배치는 xl CSS가 담당. 세로↔가로로 아예 바뀔 때만 FLIP으로 부드럽게 이동.
 */
export function HeroLayout({
  intro,
  chat,
}: {
  intro: ReactNode;
  chat: ReactNode;
}) {
  const introRef = useRef<HTMLDivElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia(SIDE_MQ);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let side = mq.matches;
    let introBox = introRef.current?.getBoundingClientRect() ?? null;
    let chatBox = chatRef.current?.getBoundingClientRect() ?? null;

    const onResize = () => {
      const next = mq.matches;
      const introEl = introRef.current;
      const chatEl = chatRef.current;
      if (!introEl || !chatEl) return;

      const nextIntro = introEl.getBoundingClientRect();
      const nextChat = chatEl.getBoundingClientRect();

      if (next !== side && !reduce.matches && introBox && chatBox) {
        flip(introEl, introBox, nextIntro);
        flip(chatEl, chatBox, nextChat);
      }

      side = next;
      introBox = nextIntro;
      chatBox = nextChat;
    };

    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return (
    <Container className="relative z-10 mt-12 grid w-full items-center gap-10 pb-3 pt-3 xl:mt-20 xl:grid-cols-2 xl:gap-16 xl:pb-4 xl:pt-4">
      <div ref={introRef} className="min-w-0 will-change-transform">
        {intro}
      </div>
      <div
        ref={chatRef}
        className="relative w-full min-w-0 will-change-transform xl:justify-self-end"
      >
        {chat}
      </div>
    </Container>
  );
}
