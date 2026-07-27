"use client";

import { useEffect, type ReactNode } from "react";

const MARKETING_BG = "#f0f1f4";

/** 마케팅 페이지 — 하단/오버스크롤 흰 여백이 보이지 않도록 html/body 배경을 맞춤. */
export function MarketingShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.backgroundColor;
    const prevBody = body.style.backgroundColor;
    const prevHtmlOverscroll = html.style.overscrollBehaviorY;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;

    html.style.backgroundColor = MARKETING_BG;
    body.style.backgroundColor = MARKETING_BG;
    html.style.overscrollBehaviorY = "none";
    body.style.overscrollBehaviorY = "none";

    return () => {
      html.style.backgroundColor = prevHtml;
      body.style.backgroundColor = prevBody;
      html.style.overscrollBehaviorY = prevHtmlOverscroll;
      body.style.overscrollBehaviorY = prevBodyOverscroll;
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-[#f0f1f4]">{children}</div>
  );
}
