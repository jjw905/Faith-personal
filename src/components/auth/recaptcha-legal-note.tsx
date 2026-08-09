"use client";

import { isRecaptchaClientConfigured } from "@/components/auth/recaptcha-v3";
import { cn } from "@/lib/utils";

/** Google이 배지 대체로 허용하는 최소 영문 고지. */
export const RECAPTCHA_BRANDING_EN =
  "This site is protected by reCAPTCHA.";

/**
 * 캡챠 키가 켜진 인증 화면에서만, 짧은 영문 한 줄.
 * (2026-04 이후 Google 개인정보·약관 링크는 넣지 않음)
 */
export function RecaptchaLegalNote({ className }: { className?: string }) {
  if (!isRecaptchaClientConfigured()) return null;
  return (
    <p className={cn("text-sm leading-relaxed text-muted", className)}>
      {RECAPTCHA_BRANDING_EN}
    </p>
  );
}
