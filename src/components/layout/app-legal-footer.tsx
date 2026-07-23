import Link from "next/link";

const LINKS = [
  { label: "개인정보 처리방침", href: "/privacy" },
  { label: "이용약관", href: "/privacy#terms" },
] as const;

/** 앱 페이지 하단 법적 고지. */
export function AppLegalFooter() {
  return (
    <footer className="mt-10 border-t border-border/60 pt-4 pb-1">
      <nav
        className="flex flex-wrap items-center justify-center gap-1"
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
      <p className="mt-1.5 text-center text-sm text-muted-2">© 2026 Faith</p>
    </footer>
  );
}
