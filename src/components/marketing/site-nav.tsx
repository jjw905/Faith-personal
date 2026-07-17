import Link from "next/link";

import { Container } from "@/components/marketing/container";
import { CtaButton } from "@/components/marketing/cta-button";

const NAV_LINKS = [
  { label: "기능", href: "#features" },
  { label: "보안", href: "#security" },
  { label: "요금제", href: "#pricing" },
];

/** 상단 마케팅 내비게이션. */
export function SiteNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-background/80 backdrop-blur-md">
      <Container className="flex h-16 items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/welcome" className="text-lg font-bold tracking-tight">
            Faith
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-muted transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="hidden text-sm font-medium text-muted transition-colors hover:text-foreground sm:block"
          >
            로그인
          </Link>
          <CtaButton href="/" className="px-4 py-2">
            시작하기
          </CtaButton>
        </div>
      </Container>
    </header>
  );
}
