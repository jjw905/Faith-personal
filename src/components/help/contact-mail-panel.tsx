"use client";

import { SUPPORT_EMAIL } from "@/lib/support-email";

/** 도움말 문의 — 수신 이메일 표시. */
export function ContactMailPanel() {
  return (
    <div className="mt-5">
      <p className="text-sm font-medium text-muted">문의 이메일</p>
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="mt-1.5 inline-block text-base font-semibold text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
      >
        {SUPPORT_EMAIL}
      </a>
    </div>
  );
}
