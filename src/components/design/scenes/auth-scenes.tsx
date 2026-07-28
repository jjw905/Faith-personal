"use client";

import { Suspense } from "react";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { LoginForm } from "@/components/auth/login-form";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { SignupEmailVerify } from "@/components/auth/signup-email-verify";
import {
  EmailSignupForm,
  SignupSocialStep,
} from "@/components/auth/signup-flow";
import {
  DesignViewportPicker,
  DesignViewportStage,
  useDesignViewport,
} from "@/components/design/use-design-viewport";
import {
  FIXTURE_SIGNUP_VERIFY_CODE,
  FIXTURE_SIGNUP_VERIFY_EMAIL,
} from "@/lib/page-ux-fixtures";

/** AuthShell 시각만 복제 (html/body 배경 부작용 없음).
 *  Faith 바는 스크롤 밖(불투명) — NN/g: 본문과 대비, 반투명 겹침 금지.
 */
function AuthPreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-full flex-col overflow-hidden bg-background">
      <header className="z-10 shrink-0 bg-background">
        <div className="flex h-12 items-center px-4 sm:h-14 sm:px-6">
          <span className="text-xl font-bold tracking-tight text-foreground">
            Faith
          </span>
        </div>
      </header>
      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto overscroll-y-contain px-4 sm:px-6">
        <div className="flex w-full max-w-md flex-col justify-start pb-16 pt-1 sm:pb-24 sm:pt-3">
          {children}
        </div>
      </main>
    </div>
  );
}

function AuthSceneFrame({ children }: { children: React.ReactNode }) {
  const { viewport, setViewport, width } = useDesignViewport();

  return (
    <div className="flex h-full min-h-full flex-col bg-surface">
      <DesignViewportPicker value={viewport} onChange={setViewport} />
      <div className="min-h-0 min-w-0 flex-1 px-4 pb-6">
        <div className="mx-auto h-full min-h-[28rem] w-full min-w-0 overflow-hidden rounded-xl ring-1 ring-border/60">
          <DesignViewportStage width={width} className="h-full">
            <AuthPreviewShell>{children}</AuthPreviewShell>
          </DesignViewportStage>
        </div>
      </div>
    </div>
  );
}

function withSuspense(node: React.ReactNode) {
  return (
    <Suspense fallback={<p className="text-base text-muted">불러오는 중…</p>}>
      {node}
    </Suspense>
  );
}

/* —— 로그인 —— */

export function SceneLogin() {
  return (
    <AuthSceneFrame>
      {withSuspense(
        <LoginForm preview initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL} />,
      )}
    </AuthSceneFrame>
  );
}

export function SceneLoginRegistered() {
  return (
    <AuthSceneFrame>
      {withSuspense(
        <LoginForm
          preview
          initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
          initialInfo="회원가입이 완료되었습니다. 로그인해 주세요."
        />,
      )}
    </AuthSceneFrame>
  );
}

export function SceneLoginErrorCredentials() {
  return (
    <AuthSceneFrame>
      {withSuspense(
        <LoginForm
          preview
          initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
          initialError="이메일 또는 비밀번호가 올바르지 않습니다."
        />,
      )}
    </AuthSceneFrame>
  );
}

/* —— 회원가입 —— */

export function SceneSignupSocial() {
  return (
    <AuthSceneFrame>
      <SignupSocialStep onEmailClick={() => undefined} />
    </AuthSceneFrame>
  );
}

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

export function SceneSignupEmailVerifyCode() {
  return (
    <AuthSceneFrame>
      <SignupEmailVerify
        preview
        forcedStep="code"
        initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
        initialCode={FIXTURE_SIGNUP_VERIFY_CODE}
        initialMessage="메일을 확인해 주세요."
        onBack={() => undefined}
      />
    </AuthSceneFrame>
  );
}

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

export function SceneSignupAccount() {
  return (
    <AuthSceneFrame>
      <EmailSignupForm
        email={FIXTURE_SIGNUP_VERIFY_EMAIL}
        proof="preview-proof"
        preview
        onBack={() => undefined}
      />
    </AuthSceneFrame>
  );
}

/* —— 비밀번호 찾기 / 재설정 —— */

export function SceneForgotPassword() {
  return (
    <AuthSceneFrame>
      <ForgotPasswordForm
        preview
        initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
      />
    </AuthSceneFrame>
  );
}

export function SceneForgotPasswordSent() {
  return (
    <AuthSceneFrame>
      <ForgotPasswordForm
        preview
        forcedView="sent"
        initialEmail={FIXTURE_SIGNUP_VERIFY_EMAIL}
        mailEnabled
        sentMessage="메일을 확인해 주세요."
      />
    </AuthSceneFrame>
  );
}

export function SceneResetPassword() {
  return (
    <AuthSceneFrame>
      {withSuspense(
        <ResetPasswordForm
          preview
          linkOk
          email={FIXTURE_SIGNUP_VERIFY_EMAIL}
        />,
      )}
    </AuthSceneFrame>
  );
}

export function SceneResetPasswordInvalid() {
  return (
    <AuthSceneFrame>
      {withSuspense(<ResetPasswordForm preview linkOk={false} />)}
    </AuthSceneFrame>
  );
}
