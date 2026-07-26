"use client";

import Link from "next/link";

import { useContactInquiry } from "@/components/marketing/contact-inquiry-provider";
import { Container } from "@/components/marketing/container";

type FooterLink =
  | { label: string; href: string; action?: never }
  | { label: string; action: "contact"; href?: never };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "제품",
    links: [
      { label: "기능", href: "/#features" },
      { label: "요금제", href: "/pricing" },
      { label: "데모", href: "/#features" },
    ],
  },
  {
    title: "회사",
    links: [
      { label: "소개", href: "/" },
      { label: "문의", action: "contact" },
    ],
  },
  {
    title: "법적 고지",
    links: [
      { label: "개인정보 처리방침", href: "/privacy" },
      { label: "이용약관", href: "/terms" },
    ],
  },
];

const linkCls =
  "text-base font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm";

/** 하단 푸터 — 제품/회사/법적 고지 링크. */
export function SiteFooter() {
  const { openContact } = useContactInquiry();

  return (
    <footer className="border-t border-border bg-background">
      <Container className="py-14">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-24 gap-y-10 xl:gap-x-36">
          {COLUMNS.map((col) => (
            <div key={col.title} className="min-w-[7rem] text-center xl:text-left">
              <h3 className="text-base font-semibold text-foreground">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {link.action === "contact" ? (
                      <button
                        type="button"
                        onClick={() => openContact()}
                        className={linkCls}
                      >
                        {link.label}
                      </button>
                    ) : (
                      <Link href={link.href} className={linkCls}>
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6 text-center text-base text-muted">
          <span>© 2026 Faith</span>
        </div>
      </Container>
    </footer>
  );
}
