import Link from "next/link";

const LINKS = [
  { label: "개인정보 처리방침", href: "/privacy" },
  { label: "이용약관", href: "/terms" },
  { label: "운영정책", href: "/policy" },
] as const;

/** 앱 페이지 하단 법적 고지. */
export function AppLegalFooter() {
  return (
    <footer className="mt-4 pb-1 pt-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav
          className="flex flex-wrap items-center gap-1"
          aria-label="법적 고지"
        >
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="px-2.5 text-sm text-muted-2">© 2026 Faith</p>
      </div>
    </footer>
  );
}
