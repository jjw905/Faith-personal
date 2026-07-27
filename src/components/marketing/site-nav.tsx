"use client";

import Link from "next/link";

import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";
import { scrollToHash } from "@/lib/scroll-to-hash";

type NavLink = { label: string; href: string; hash?: boolean };

const NAV_LINKS: NavLink[] = [
  { label: "기능", href: "/#features", hash: true },
  { label: "요금제", href: "/pricing" },
];

/** 상단 마케팅 내비게이션 — 모든 폭에서 메뉴·버튼 상시 표시. */
export function SiteNav() {
  function onNavClick(e: React.MouseEvent, link: NavLink) {
    if (link.hash) {
      const hash = link.href.slice(link.href.indexOf("#"));
      if (window.location.pathname === "/") {
        e.preventDefault();
        scrollToHash(hash);
      }
    }
  }

  const linkClass =
    "shrink-0 text-base font-semibold text-foreground/80 transition-colors hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-[#f0f1f4] shadow-[0_1px_0_rgba(17,24,39,0.04)]">
      <Container className="flex h-16 items-center justify-between gap-2 px-[clamp(1rem,3.5vw,3rem)]">
        <div className="flex min-w-0 items-center gap-[clamp(0.875rem,2.5vw,1.75rem)]">
          <Link
            href="/"
            className="shrink-0 text-xl font-bold tracking-tight text-foreground"
          >
            Faith
          </Link>
          <nav className="flex items-center gap-[clamp(0.75rem,2vw,1.5rem)]">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={linkClass}
                onClick={(e) => onNavClick(e, link)}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/login"
            className="px-[clamp(0.25rem,1vw,0.5rem)] py-2 text-base font-semibold text-foreground/80 transition-colors hover:text-foreground"
          >
            로그인
          </Link>
          <CtaButton href="/signup" className="px-[clamp(0.75rem,2vw,1rem)] py-2 text-base">
            시작하기
          </CtaButton>
        </div>
      </Container>
    </header>
  );
}
