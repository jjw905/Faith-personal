"use client";

import { useEffect, type ReactNode } from "react";

const AUTH_BG = "#e6e8ed";

/** 인증 페이지 — 오버스크롤 시 흰 여백이 보이지 않도록 html/body 배경을 맞춤. */
export function AuthShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.backgroundColor;
    const prevBody = body.style.backgroundColor;
    const prevHtmlOverscroll = html.style.overscrollBehaviorY;
    const prevBodyOverscroll = body.style.overscrollBehaviorY;

    html.style.backgroundColor = AUTH_BG;
    body.style.backgroundColor = AUTH_BG;
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
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-[#e6e8ed]">
      {children}
    </div>
  );
}
