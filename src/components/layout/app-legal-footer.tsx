import Link from "next/link";

const LINKS = [
  { label: "개인정보 처리방침", href: "/privacy" },
  { label: "이용약관", href: "/privacy#terms" },
] as const;

/** 앱 페이지 하단 법적 고지. */
export function AppLegalFooter() {
  return (
    <footer className="mt-10 border-t border-border pt-5 pb-1">
      <nav
        className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted"
        aria-label="법적 고지"
      >
        {LINKS.map((link, i) => (
          <span key={link.href} className="inline-flex items-center gap-x-3">
            {i > 0 ? (
              <span className="text-border-strong" aria-hidden>
                |
              </span>
            ) : null}
            <Link
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          </span>
        ))}
      </nav>
      <p className="mt-2 text-center text-xs text-muted-2">© 2026 Faith</p>
    </footer>
  );
}
