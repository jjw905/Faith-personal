"use client";

import Link from "next/link";

import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";
import { scrollToHash } from "@/lib/scroll-to-hash";

const NAV_LINKS = [
  { label: "기능", href: "#features" },
  { label: "보안", href: "#security" },
  { label: "요금제", href: "#pricing" },
];

/** 상단 마케팅 내비게이션 — xl 이상에서만 전체 메뉴 표시. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-[#eef0f4]/80 shadow-[0_1px_0_rgba(17,24,39,0.04)] backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between xl:h-[4.5rem]">
        <div className="flex items-center gap-10 xl:gap-12">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            Faith
          </Link>
          <nav className="hidden items-center gap-10 xl:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-[15px] font-semibold text-foreground/90 transition-colors hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToHash(link.href);
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/login"
            className="hidden text-[15px] font-semibold text-foreground/90 transition-colors hover:text-foreground xl:block"
          >
            로그인
          </Link>
          <CtaButton href="/signup" className="px-5 py-2.5 text-[15px]">
            시작하기
          </CtaButton>
        </div>
      </Container>
    </header>
  );
}
