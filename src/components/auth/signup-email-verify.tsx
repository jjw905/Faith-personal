"use client";

import { useState } from "react";

import {
  SignupEmailVerifyCodeView,
  SignupEmailVerifyConfirmedView,
  SignupEmailVerifyRequestView,
} from "@/components/auth/signup-email-verify-views";
import { isValidEmail } from "@/lib/auth-validation";
import {
  fixtureSignupEmailVerify,
  FIXTURE_SIGNUP_VERIFY_EMAIL,
} from "@/lib/page-ux-fixtures";

export type SignupEmailVerifyStep = "email" | "code" | "confirmed";

export type SignupEmailVerifyProps = {
  /** 디자인/UX 미리보기: API 없이 단계만 전환. */
  preview?: boolean;
  /** 미리보기에서 단계 고정. */
  forcedStep?: SignupEmailVerifyStep;
  initialEmail?: string;
  initialCode?: string;
  initialMessage?: string;
  forcePending?: boolean;
  backHref?: string;
  onBack?: () => void;
  onRequestCode?: (email: string) => Promise<{ ok: boolean; message?: string }>;
  onConfirmCode?: (
    email: string,
    code: string,
  ) => Promise<{ ok: boolean; message?: string; proof?: string }>;
  /** 인증 완료 화면에서 계속하기 시 호출. */
  onVerified?: (payload: { email: string; proof?: string }) => void;
};

/** 회원가입 이메일 인증 / 인증 확인 플로우. */
export function SignupEmailVerify({
  preview = false,
  forcedStep,
  initialEmail = "",
  initialCode = "",
  initialMessage = "",
  forcePending = false,
  backHref = "/signup",
  onBack,
  onRequestCode,
  onConfirmCode,
  onVerified,
}: SignupEmailVerifyProps) {
  const fixture = fixtureSignupEmailVerify();
  const [step, setStep] = useState<SignupEmailVerifyStep>(
    forcedStep ?? "email",
  );
  const [email, setEmail] = useState(
    initialEmail || (preview ? FIXTURE_SIGNUP_VERIFY_EMAIL : ""),
  );
  const [code, setCode] = useState(initialCode);
  const [proof, setProof] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const activeStep = forcedStep ?? step;
  const busy = forcePending || pending;

  async function requestCode() {
    setError("");
    setMessage("");
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError("이메일을 입력해 주세요.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError("올바른 이메일 형식이 아닙니다.");
      return;
    }

    if (preview || !onRequestCode) {
      setEmail(trimmed);
      setMessage(fixture.message);
      if (!forcedStep) setStep("code");
      return;
    }

    setPending(true);
    try {
      const result = await onRequestCode(trimmed);
      if (!result.ok) {
        setError(result.message ?? "안내 발송에 실패했습니다.");
        return;
      }
      setEmail(trimmed);
      setMessage(result.message ?? fixture.message);
      if (!forcedStep) setStep("code");
    } finally {
      setPending(false);
    }
  }

  async function confirmCode() {
    setError("");
    setMessage("");
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      setError("6자리 인증번호를 입력해 주세요.");
      return;
    }

    if (preview || !onConfirmCode) {
      setMessage("이메일 인증이 완료되었습니다.");
      setProof(undefined);
      if (!forcedStep) setStep("confirmed");
      return;
    }

    setPending(true);
    try {
      const result = await onConfirmCode(
        email.trim().toLowerCase(),
        trimmedCode,
      );
      if (!result.ok) {
        setError(
          result.message ?? "인증번호가 올바르지 않거나 만료되었습니다.",
        );
        return;
      }
      setMessage(result.message ?? "이메일 인증이 완료되었습니다.");
      setProof(result.proof);
      if (!forcedStep) setStep("confirmed");
    } finally {
      setPending(false);
    }
  }

  function goBackToEmail() {
    if (forcedStep) return;
    setStep("email");
    setCode("");
    setProof(undefined);
    setError("");
    setMessage("");
  }

  if (activeStep === "confirmed") {
    return (
      <SignupEmailVerifyConfirmedView
        email={email || fixture.email}
        onBack={onBack ?? (forcedStep ? undefined : goBackToEmail)}
        backHref={backHref}
        onContinue={() =>
          onVerified?.({
            email: email.trim().toLowerCase() || fixture.email,
            proof,
          })
        }
      />
    );
  }

  if (activeStep === "code") {
    return (
      <SignupEmailVerifyCodeView
        email={email || fixture.email}
        otp={code}
        onOtpChange={setCode}
        message={message || fixture.message}
        pending={busy}
        error={error}
        onConfirm={() => void confirmCode()}
        onResend={() => void requestCode()}
        onBack={forcedStep ? onBack : goBackToEmail}
        backHref={backHref}
      />
    );
  }

  return (
    <SignupEmailVerifyRequestView
      email={email}
      onEmailChange={setEmail}
      message={message}
      pending={busy}
      error={error}
      onSubmit={() => void requestCode()}
      onBack={onBack}
      backHref={backHref}
    />
  );
}
