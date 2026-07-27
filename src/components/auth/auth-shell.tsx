"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import { Container } from "@/components/marketing/container";
import { cn } from "@/lib/utils";

/** Soft canvas — matches account/settings (`--background` #fbfbfd). */
const AUTH_BG = "#fbfbfd";

/** Elevated card — same elevation as account/settings panels. */
export const AUTH_CARD =
  "rounded-3xl bg-card shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border";

const authBackClassName =
  "-ml-1 inline-flex h-12 min-h-12 items-center gap-1.5 rounded-xl px-1 text-base text-muted transition-colors hover:bg-surface hover:text-foreground";

/** Faith 돌아가기 — ChevronLeft + 라벨, 터치 48. */
export function AuthBackLink({
  href,
  className,
}: {
  href: string;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(authBackClassName, className)}>
      <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      돌아가기
    </Link>
  );
}

/** Faith 돌아가기 — 버튼 버전(단계 전환 등). */
export function AuthBackButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(authBackClassName, className)}
    >
      <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      돌아가기
    </button>
  );
}

/** Login keeps default; signup / forgot / reset sit a bit higher. */
const contentPad = {
  default: "pt-2 pb-28 sm:pt-3 sm:pb-36",
  raised: "pt-0 pb-40 sm:pt-0 sm:pb-52",
} as const;

/** 인증 페이지 — 오버스크롤 시 흰 여백이 보이지 않도록 html/body 배경을 맞춤. */
export function AuthShell({
  children,
  mainClassName,
  contentAlign = "default",
}: {
  children: ReactNode;
  mainClassName?: string;
  /** `raised` = less top / more bottom pad (signup, forgot, reset). */
  contentAlign?: keyof typeof contentPad;
}) {
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
    <div className="flex min-h-dvh flex-col overflow-x-hidden bg-background">
      <header className="shrink-0 border-b border-border bg-background">
        <Container className="flex h-16 items-center">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            Faith
          </Link>
        </Container>
      </header>

      <main
        className={cn("flex flex-1 justify-center px-6", mainClassName)}
      >
        {/*
          Sit well above true center: minimal top padding, large bottom.
          Tall forms still scroll when needed.
        */}
        <div
          className={cn(
            "flex w-full max-w-md flex-col justify-center",
            contentPad[contentAlign],
          )}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
