import Link from "next/link";

import { Container } from "@/components/marketing/container";

type FooterLink = { label: string; href: string };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "제품",
    links: [
      { label: "기능", href: "/welcome#features" },
      { label: "요금제", href: "/welcome#pricing" },
      { label: "데모", href: "/welcome#features" },
    ],
  },
  {
    title: "회사",
    links: [
      { label: "소개", href: "/welcome" },
      { label: "문의", href: "mailto:hello@faith.example" },
    ],
  },
  {
    title: "법적 고지",
    links: [
      { label: "개인정보 처리방침", href: "/privacy" },
      { label: "이용약관", href: "/privacy#terms" },
    ],
  },
];

/** 하단 푸터 — 제품/회사/법적 고지 링크. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <Container className="py-14">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-24 gap-y-10 sm:gap-x-28 lg:gap-x-36">
          {COLUMNS.map((col) => (
            <div key={col.title} className="min-w-[7rem] text-center sm:text-left">
              <h3 className="text-sm font-semibold text-foreground">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 border-t border-border pt-6 text-center text-sm text-muted">
          <span>© 2026 Faith</span>
        </div>
      </Container>
    </footer>
  );
}
