import { Container } from "@/components/marketing/container";

/** 하단 푸터. */
export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background py-8">
      <Container className="flex flex-col items-center justify-between gap-2 text-sm text-muted sm:flex-row">
        <span>© 2026 Faith</span>
        <span>Secure Minutes Platform</span>
      </Container>
    </footer>
  );
}
