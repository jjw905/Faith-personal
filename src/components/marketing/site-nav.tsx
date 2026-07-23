"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useContactInquiry } from "@/components/marketing/contact-inquiry-provider";
import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";
import { scrollToHash } from "@/lib/scroll-to-hash";
import { cn } from "@/lib/utils";

type NavLink =
  | { label: string; href: string; hash?: boolean; action?: never }
  | { label: string; action: "contact"; href?: never; hash?: never };

const NAV_LINKS: NavLink[] = [
  { label: "기능", href: "/#features", hash: true },
  { label: "요금제", href: "/pricing" },
  { label: "문의", action: "contact" },
];

/** 상단 마케팅 내비게이션 — lg+ 전체 메뉴, 그 아래는 메뉴 버튼. */
export function SiteNav() {
  const [open, setOpen] = useState(false);
  const { openContact } = useContactInquiry();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function onNavClick(e: React.MouseEvent, link: NavLink) {
    setOpen(false);
    if (link.action === "contact") {
      e.preventDefault();
      openContact();
      return;
    }
    if (link.hash) {
      const hash = link.href.slice(link.href.indexOf("#"));
      if (window.location.pathname === "/") {
        e.preventDefault();
        scrollToHash(hash);
      }
    }
  }

  const linkClass =
    "text-base font-semibold text-foreground/80 transition-colors hover:text-foreground";

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-[#eef0f4]/95 shadow-[0_1px_0_rgba(17,24,39,0.04)]">
      <Container className="flex h-16 items-center justify-between lg:h-[4.5rem]">
        <div className="flex items-center gap-10 lg:gap-12">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            Faith
          </Link>
          <nav className="hidden items-center gap-9 lg:flex">
            {NAV_LINKS.map((link) =>
              link.action === "contact" ? (
                <button
                  key={link.label}
                  type="button"
                  className={linkClass}
                  onClick={(e) => onNavClick(e, link)}
                >
                  {link.label}
                </button>
              ) : (
                <Link
                  key={link.href}
                  href={link.href}
                  className={linkClass}
                  onClick={(e) => onNavClick(e, link)}
                >
                  {link.label}
                </Link>
              ),
            )}
          </nav>
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="px-2 py-2.5 text-base font-semibold text-foreground/80 transition-colors hover:text-foreground"
          >
            로그인
          </Link>
          <CtaButton href="/signup" className="px-5 py-2.5 text-base">
            시작하기
          </CtaButton>
        </div>

        <button
          type="button"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-foreground transition-colors hover:bg-black/5 lg:hidden"
        >
          {open ? (
            <X className="h-5 w-5" strokeWidth={2} />
          ) : (
            <Menu className="h-5 w-5" strokeWidth={2} />
          )}
        </button>
      </Container>

      <div
        className={cn(
          "overflow-hidden border-t border-border/50 bg-[#eef0f4] transition-[max-height,opacity] duration-200 lg:hidden",
          open ? "max-h-96 opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <Container className="flex flex-col gap-1 py-3">
          {NAV_LINKS.map((link) =>
            link.action === "contact" ? (
              <button
                key={link.label}
                type="button"
                onClick={(e) => onNavClick(e, link)}
                className="rounded-xl px-3 py-3 text-left text-base font-semibold text-foreground transition-colors hover:bg-black/5"
              >
                {link.label}
              </button>
            ) : (
              <Link
                key={link.href}
                href={link.href}
                onClick={(e) => onNavClick(e, link)}
                className="rounded-xl px-3 py-3 text-base font-semibold text-foreground transition-colors hover:bg-black/5"
              >
                {link.label}
              </Link>
            ),
          )}
          <div className="mt-1 flex items-center gap-3 border-t border-border/50 pt-3">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-xl px-3 py-3 text-center text-base font-semibold text-foreground transition-colors hover:bg-black/5"
            >
              로그인
            </Link>
            <CtaButton
              href="/signup"
              className="flex-1 px-5 py-3 text-center text-base"
            >
              시작하기
            </CtaButton>
          </div>
        </Container>
      </div>
    </header>
  );
}
