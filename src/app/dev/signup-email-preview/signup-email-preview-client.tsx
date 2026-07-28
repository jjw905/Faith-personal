"use client";

import { useMemo, useState } from "react";

import { SignupEmailVerify } from "@/components/auth/signup-email-verify";
import {
  FIXTURE_SIGNUP_VERIFY_CODE,
  FIXTURE_SIGNUP_VERIFY_EMAIL,
} from "@/lib/page-ux-fixtures";
import { PAGE_UX_AUTH_SIGNUP_VERIFY } from "@/lib/page-ux-registry";
import { cn } from "@/lib/utils";

const STEPS = [
  PAGE_UX_AUTH_SIGNUP_VERIFY.email,
  PAGE_UX_AUTH_SIGNUP_VERIFY.code,
  PAGE_UX_AUTH_SIGNUP_VERIFY.codeFilled,
  PAGE_UX_AUTH_SIGNUP_VERIFY.confirmed,
] as const;

const VIEWPORTS = [
  { id: "mobile", label: "모바일", width: 390 },
  { id: "tablet", label: "태블릿", width: 768 },
  { id: "desktop", label: "데스크톱", width: 1024 },
] as const;

type StepId = (typeof STEPS)[number]["id"];
type ViewportId = (typeof VIEWPORTS)[number]["id"];

export function SignupEmailPreviewClient() {
  const [stepId, setStepId] = useState<StepId>("signup-email-verify");
  const [viewport, setViewport] = useState<ViewportId>("mobile");
  const width = VIEWPORTS.find((v) => v.id === viewport)?.width ?? 390;

  const body = useMemo(() => {
    if (stepId === "signup-email-confirmed") {
      return (
        <SignupEmailVerify
          preview
          forcedStep="confirmed"
          initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
        />
      );
    }
    if (stepId === "signup-email-code") {
      return (
        <SignupEmailVerify
          preview
          forcedStep="code"
          initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
          initialMessage="인증번호를 발송했습니다."
        />
      );
    }
    if (stepId === "signup-email-code-filled") {
      return (
        <SignupEmailVerify
          preview
          forcedStep="code"
          initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
          initialCode={FIXTURE_SIGNUP_VERIFY_CODE}
          initialMessage="인증번호를 발송했습니다."
        />
      );
    }
    return (
      <SignupEmailVerify
        preview
        forcedStep="email"
        initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
      />
    );
  }, [stepId]);

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6 sm:px-6">
        <header className="space-y-1">
          <p className="text-base font-semibold text-muted-2">로컬 미리보기</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            회원가입 이메일 인증
          </h1>
          <p className="text-base text-muted">
            메일 발송 없이 UI만 확인합니다. 관리자라면{" "}
            <a
              href="/design?cat=auth&scene=signup-email-verify"
              className="font-semibold text-foreground underline"
            >
              /design?cat=auth
            </a>
            에서도 볼 수 있습니다.
          </p>
        </header>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="미리보기 단계"
        >
          {STEPS.map((s) => {
            const active = s.id === stepId;
            return (
              <button
                key={s.id}
                type="button"
                aria-pressed={active}
                onClick={() => setStepId(s.id)}
                className={cn(
                  "inline-flex min-h-12 items-center rounded-xl px-4 text-base font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted ring-1 ring-border hover:bg-surface hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="미리보기 너비"
        >
          {VIEWPORTS.map((v) => {
            const active = v.id === viewport;
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={active}
                onClick={() => setViewport(v.id)}
                className={cn(
                  "inline-flex min-h-12 items-center rounded-xl px-4 text-base font-semibold transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-card text-muted ring-1 ring-border hover:bg-surface hover:text-foreground",
                )}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        <div
          className="mx-auto overflow-hidden rounded-2xl bg-background ring-1 ring-border/60"
          style={{ width: `min(100%, ${width}px)` }}
        >
          <header className="border-b border-border">
            <div className="flex h-16 items-center px-4 sm:px-6">
              <span className="text-xl font-bold tracking-tight text-foreground">
                Faith
              </span>
            </div>
          </header>
          <main className="flex justify-center px-4 py-6 sm:px-6 sm:py-8">
            <div className="w-full max-w-md">{body}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
