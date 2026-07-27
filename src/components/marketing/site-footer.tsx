import Link from "next/link";

import { Container } from "@/components/marketing/container";

type FooterLink = { label: string; href: string };

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
      { label: "도움말", href: "/help" },
    ],
  },
  {
    title: "법률",
    links: [
      { label: "개인정보 처리방침", href: "/privacy" },
      { label: "이용약관", href: "/terms" },
    ],
  },
];

const linkCls =
  "text-base font-medium text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm";

/** 하단 푸터 — 제품/회사/법률 3열(가운데 기준). 아주 좁을 때만 세로. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-[#f0f1f4]">
      <Container className="py-12 sm:py-14">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-3 justify-items-center gap-x-[clamp(1.25rem,4vw,5.5rem)] gap-y-8 max-[359px]:grid-cols-1">
          {COLUMNS.map((col) => (
            <div key={col.title} className="w-full min-w-0 max-w-[11rem] text-left">
              <h3 className="text-base font-semibold text-foreground">
                {col.title}
              </h3>
              <ul className="mt-3 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link href={link.href} className={linkCls}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-10 text-center text-sm text-muted-2 sm:mt-12">
          © 2026 Faith
        </p>
      </Container>
    </footer>
  );
}
