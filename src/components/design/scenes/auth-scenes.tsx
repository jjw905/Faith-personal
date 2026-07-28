"use client";

import { useState } from "react";

import { SignupEmailVerify } from "@/components/auth/signup-email-verify";
import {
  FIXTURE_SIGNUP_VERIFY_CODE,
  FIXTURE_SIGNUP_VERIFY_EMAIL,
} from "@/lib/page-ux-fixtures";
import { cn } from "@/lib/utils";

const VIEWPORTS = [
  { id: "mobile", label: "모바일", width: 390 },
  { id: "tablet", label: "태블릿", width: 768 },
  { id: "desktop", label: "데스크톱", width: 1024 },
] as const;

type ViewportId = (typeof VIEWPORTS)[number]["id"];

/** AuthShell 시각만 복제 (html/body 배경 부작용 없음). */
function AuthPreviewShell({
  width,
  children,
}: {
  width: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mx-auto flex min-h-full flex-col overflow-hidden rounded-xl bg-background ring-1 ring-border/60"
      style={{ width: `min(100%, ${width}px)` }}
    >
      <header className="shrink-0 border-b border-border bg-background">
        <div className="flex h-16 items-center px-4 sm:px-6">
          <span className="text-xl font-bold tracking-tight text-foreground">
            Faith
          </span>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-4 sm:px-6">
        <div className="flex w-full max-w-md flex-col justify-center pb-16 pt-4 sm:pb-24 sm:pt-6">
          {children}
        </div>
      </main>
    </div>
  );
}

function ViewportPicker({
  value,
  onChange,
}: {
  value: ViewportId;
  onChange: (id: ViewportId) => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 px-4 py-3"
      role="group"
      aria-label="미리보기 너비"
    >
      <span className="text-base text-muted">창 크기</span>
      <div className="flex flex-wrap gap-2">
        {VIEWPORTS.map((v) => {
          const active = v.id === value;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(v.id)}
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
    </div>
  );
}

function AuthSceneFrame({ children }: { children: React.ReactNode }) {
  const [viewport, setViewport] = useState<ViewportId>("mobile");
  const width = VIEWPORTS.find((v) => v.id === viewport)?.width ?? 390;

  return (
    <div className="flex h-full min-h-full flex-col bg-surface">
      <ViewportPicker value={viewport} onChange={setViewport} />
      <div className="min-h-0 flex-1 overflow-auto px-4 pb-6">
        <AuthPreviewShell width={width}>{children}</AuthPreviewShell>
      </div>
    </div>
  );
}

/** 디자인 랩: 이메일 인증 (이메일 입력). */
export function SceneSignupEmailVerify() {
  return (
    <AuthSceneFrame>
      <SignupEmailVerify
        preview
        forcedStep="email"
        initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
        onBack={() => undefined}
      />
    </AuthSceneFrame>
  );
}

/** 디자인 랩: 이메일 인증 확인 (인증번호 입력). */
export function SceneSignupEmailVerifyCode() {
  return (
    <AuthSceneFrame>
      <SignupEmailVerify
        preview
        forcedStep="code"
        initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
        initialMessage="인증번호를 발송했습니다."
        onBack={() => undefined}
      />
    </AuthSceneFrame>
  );
}

/** 디자인 랩: 인증번호가 채워진 확인 단계. */
export function SceneSignupEmailVerifyCodeFilled() {
  return (
    <AuthSceneFrame>
      <SignupEmailVerify
        preview
        forcedStep="code"
        initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
        initialCode={FIXTURE_SIGNUP_VERIFY_CODE}
        initialMessage="인증번호를 발송했습니다."
        onBack={() => undefined}
      />
    </AuthSceneFrame>
  );
}

/** 디자인 랩: 이메일 인증 완료. */
export function SceneSignupEmailVerifyConfirm() {
  return (
    <AuthSceneFrame>
      <SignupEmailVerify
        preview
        forcedStep="confirmed"
        initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
        onBack={() => undefined}
        onVerified={() => undefined}
      />
    </AuthSceneFrame>
  );
}
