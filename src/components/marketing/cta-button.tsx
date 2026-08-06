"use client";

import Link from "next/link";

import { cn } from "@/lib/utils";
import { scrollToHash } from "@/lib/scroll-to-hash";

type Variant = "primary" | "ghost";

const base =
  "inline-flex min-h-12 items-center justify-center rounded-xl px-5 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  ghost: "text-foreground hover:bg-surface",
};

/** 랜딩 전역에서 재사용하는 CTA 버튼(링크). */
export function CtaButton({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  const isHash = href.startsWith("#");

  if (isHash) {
    return (
      <a
        href={href}
        className={cn(base, variants[variant], className)}
        onClick={(e) => {
          e.preventDefault();
          scrollToHash(href);
        }}
      >
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={cn(base, variants[variant], className)}>
      {children}
    </Link>
  );
}
