"use client";

import { useMemo, useState } from "react";

import { SignupEmailVerify } from "@/components/auth/signup-email-verify";
import {
  DesignViewportPicker,
  DesignViewportStage,
  useDesignViewport,
} from "@/components/design/use-design-viewport";
import { FIXTURE_SIGNUP_VERIFY_EMAIL } from "@/lib/page-ux-fixtures";
import { PAGE_UX_AUTH_SIGNUP_VERIFY } from "@/lib/page-ux-registry";
import { cn } from "@/lib/utils";

const STEPS = [
  PAGE_UX_AUTH_SIGNUP_VERIFY.email,
  PAGE_UX_AUTH_SIGNUP_VERIFY.code,
  PAGE_UX_AUTH_SIGNUP_VERIFY.confirmed,
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function SignupEmailPreviewClient() {
  const [stepId, setStepId] = useState<StepId>("signup-email-verify");
  const { viewport, setViewport, width } = useDesignViewport();

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
          initialMessage="메일을 확인해 주세요."
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

        <DesignViewportPicker value={viewport} onChange={setViewport} />

        <div className="h-[min(70vh,40rem)] min-h-[28rem] w-full min-w-0 overflow-hidden rounded-2xl ring-1 ring-border/60">
          <DesignViewportStage width={width} className="h-full">
            <div className="flex h-full min-h-full w-full flex-col overflow-hidden bg-background">
              <header className="shrink-0 border-b border-border">
                <div className="flex h-16 items-center px-4 sm:px-6">
                  <span className="text-xl font-bold tracking-tight text-foreground">
                    Faith
                  </span>
                </div>
              </header>
              <main className="flex min-h-0 flex-1 justify-center overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
                <div className="w-full max-w-md">{body}</div>
              </main>
            </div>
          </DesignViewportStage>
        </div>
      </div>
    </div>
  );
}
