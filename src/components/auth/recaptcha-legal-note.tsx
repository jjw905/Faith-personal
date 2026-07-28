"use client";

import Link from "next/link";

import { isRecaptchaClientConfigured } from "@/components/auth/recaptcha-v3";
import { cn } from "@/lib/utils";

/** Google reCAPTCHA v3 고지 (배지 + 약관). */
export function RecaptchaLegalNote({ className }: { className?: string }) {
  if (!isRecaptchaClientConfigured()) return null;
  return (
    <p className={cn("text-base leading-relaxed text-muted", className)}>
      이 사이트는 reCAPTCHA로 보호되며 Google{" "}
      <Link
        href="https://policies.google.com/privacy"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        개인정보처리방침
      </Link>
      과{" "}
      <Link
        href="https://policies.google.com/terms"
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:text-foreground"
      >
        서비스 약관
      </Link>
      이 적용됩니다.
    </p>
  );
}
