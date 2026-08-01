"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  AUTH_ALERT_ERROR,
  AUTH_CARD_OFFSET,
  AUTH_FIELD_HINT,
  AUTH_FIELD_HINT_ERROR,
  AUTH_FIELD_INPUT,
  AUTH_LABEL,
  AUTH_PRIMARY_BTN,
  AUTH_SECONDARY_BTN,
  AuthCard,
  AuthFlowHeading,
  AuthPasswordField,
  authEnter,
  authEnterDelay,
} from "@/components/auth/auth-shell";
import { SignupEmailVerify } from "@/components/auth/signup-email-verify";
import {
  SocialSignupButtons,
  AuthOrDivider,
} from "@/components/auth/social-signup-buttons";
import { getRecaptchaToken } from "@/components/auth/recaptcha-v3";
import { Input } from "@/components/ui/input";
import { AUTH_PASSWORD_HINT, AUTH_PASSWORD_INVALID } from "@/lib/auth-messages";
import {
  getPasswordErrors,
  isValidKoreanName,
  isValidPassword,
} from "@/lib/auth-validation";
import { cn } from "@/lib/utils";

type Step = "social" | "verify" | "email";

async function requestSignupOtp(email: string) {
  let captchaToken: string | null = null;
  try {
    captchaToken = await getRecaptchaToken("signup_otp");
  } catch {
    return {
      ok: false,
      message: "보안 확인에 실패했습니다. 다시 시도해 주세요.",
    };
  }
  const res = await fetch("/api/auth/signup-verify/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, captchaToken: captchaToken ?? "" }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    message?: string;
    code?: string;
  };
  return {
    ok: Boolean(res.ok && data.ok),
    message: data.message,
    // OWASP: 정밀 Retry-After 미사용. 429면 클라이언트 고정 쿨다운.
    retryAfterSec: res.status === 429 || data.code === "rate_limited" ? 60 : undefined,
  };
}

async function confirmSignupOtp(email: string, code: string) {
  const res = await fetch("/api/auth/signup-verify/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    message?: string;
    proof?: string;
  };
  return {
    ok: Boolean(res.ok && data.ok),
    message: data.message,
    proof: data.proof,
  };
}

/** 회원가입 — 소셜 / 이메일 선택 (미리보기·플로우 공용). */
export function SignupSocialStep({
  onEmailClick,
  availableProviders,
}: {
  onEmailClick?: () => void;
  availableProviders?: readonly ("google" | "twitter")[];
}) {
  // undefined = 디자인 미리보기 등에서 전체 표시, [] = 서버에 OAuth 미설정
  const hasSocial =
    availableProviders === undefined || availableProviders.length > 0;
  return (
    <div className="w-full">
      <AuthFlowHeading
        title="회원가입"
        subtitle={
          hasSocial
            ? "소셜 계정으로 빠르게 시작하세요"
            : "이메일로 Faith 계정을 만드세요"
        }
        backHref="/login"
        className={authEnter}
      />

      <AuthCard
        className={cn(AUTH_CARD_OFFSET, authEnter, authEnterDelay(2))}
      >
        <SocialSignupButtons
          showHeading={false}
          availableProviders={availableProviders}
        />

        {hasSocial ? (
          <div className="mt-6">
            <AuthOrDivider />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => onEmailClick?.()}
          className={cn(hasSocial ? "mt-6" : undefined, AUTH_SECONDARY_BTN)}
        >
          이메일로 가입
        </button>
      </AuthCard>
    </div>
  );
}

/** 회원가입 플로우 — 소셜 / 이메일 인증 / 계정 정보. */
export function SignupFlow({
  availableProviders,
}: {
  availableProviders?: readonly ("google" | "twitter")[];
} = {}) {
  const [step, setStep] = useState<Step>("social");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [signupProof, setSignupProof] = useState("");

  if (step === "verify") {
    return (
      <SignupEmailVerify
        onBack={() => setStep("social")}
        onRequestCode={requestSignupOtp}
        onConfirmCode={confirmSignupOtp}
        onVerified={({ email, proof }) => {
          if (!proof) {
            return;
          }
          setVerifiedEmail(email);
          setSignupProof(proof);
          setStep("email");
        }}
      />
    );
  }

  if (step === "email") {
    return (
      <EmailSignupForm
        email={verifiedEmail}
        proof={signupProof}
        onBack={() => {
          setSignupProof("");
          setStep("verify");
        }}
      />
    );
  }

  return (
    <SignupSocialStep
      onEmailClick={() => setStep("verify")}
      availableProviders={availableProviders}
    />
  );
}

export function EmailSignupForm({
  email,
  proof,
  onBack,
  preview = false,
  initialName = "",
  initialPassword = "",
  initialPasswordConfirm = "",
  initialFormError = "",
  forcePending = false,
}: {
  email: string;
  proof: string;
  onBack: () => void;
  preview?: boolean;
  initialName?: string;
  initialPassword?: string;
  initialPasswordConfirm?: string;
  initialFormError?: string;
  forcePending?: boolean;
}) {
  const router = useRouter();
  const [password, setPassword] = useState(initialPassword);
  const [passwordConfirm, setPasswordConfirm] = useState(
    initialPasswordConfirm,
  );
  const [name, setName] = useState(initialName);
  const [formError, setFormError] = useState(initialFormError);
  const [submitting, setSubmitting] = useState(false);
  const busy = forcePending || submitting;

  const passwordErrors = password ? getPasswordErrors(password) : [];
  const passwordMismatch =
    passwordConfirm.length > 0 && password !== passwordConfirm;
  const nameInvalid = name.length > 0 && !isValidKoreanName(name);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (preview) return;
    setFormError("");

    if (!proof) {
      setFormError("이메일 인증이 필요합니다. 처음부터 다시 진행해 주세요.");
      return;
    }
    if (!isValidPassword(password)) {
      setFormError(AUTH_PASSWORD_INVALID);
      return;
    }
    if (password !== passwordConfirm) {
      setFormError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }
    if (!isValidKoreanName(name)) {
      setFormError("이름은 정확한 한글 이름(2~5자)으로 입력해 주세요.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          passwordConfirm,
          name: name.trim(),
          proof,
        }),
      });
      const raw = await res.text();
      let data: { ok?: boolean; message?: string; code?: string } = {};
      try {
        data = JSON.parse(raw) as {
          ok?: boolean;
          message?: string;
          code?: string;
        };
      } catch {
        setFormError(
          res.status >= 500
            ? "서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요."
            : "회원가입 응답을 처리할 수 없습니다.",
        );
        return;
      }
      if (!res.ok || !data.ok) {
        if (data.code === "proof_expired" || data.code === "proof_required") {
          setFormError(
            data.message ?? "이메일 인증이 만료되었습니다. 다시 인증해 주세요.",
          );
          return;
        }
        if (res.status === 429) {
          setFormError(
            data.message ?? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
          );
          return;
        }
        setFormError(data.message ?? "회원가입에 실패했습니다.");
        return;
      }
      router.push("/login?registered=1");
    } catch {
      setFormError("회원가입 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full">
      <AuthFlowHeading
        title="이메일로 가입"
        subtitle="계정 정보를 입력해 주세요"
        onBack={onBack}
        className={authEnter}
      />

      <AuthCard
        as="form"
        className={cn(AUTH_CARD_OFFSET, authEnter, authEnterDelay(2))}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="space-y-5">
          <div>
            <label htmlFor="email" className={AUTH_LABEL}>
              아이디 (이메일)
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              readOnly
              className={cn(AUTH_FIELD_INPUT, "bg-surface text-muted")}
            />
            <p className="mt-1.5 text-base text-success">이메일 인증 완료</p>
          </div>

          <div>
            <label htmlFor="password" className={AUTH_LABEL}>
              비밀번호
            </label>
            <AuthPasswordField
              id="password"
              name="password"
              placeholder="비밀번호"
              autoComplete="new-password"
              value={password}
              onChange={setPassword}
              required
            />
            <p className={AUTH_FIELD_HINT}>{AUTH_PASSWORD_HINT}</p>
            {passwordErrors.length > 0 ? (
              <p className={AUTH_FIELD_HINT_ERROR}>
                미충족: {passwordErrors.join(", ")}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="passwordConfirm" className={AUTH_LABEL}>
              비밀번호 확인
            </label>
            <AuthPasswordField
              id="passwordConfirm"
              name="passwordConfirm"
              placeholder="비밀번호를 다시 입력"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              required
            />
            {passwordMismatch ? (
              <p className={cn(AUTH_FIELD_HINT_ERROR, "mt-1.5")}>
                비밀번호가 일치하지 않습니다.
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor="name" className={AUTH_LABEL}>
              이름
            </label>
            <Input
              id="name"
              name="name"
              type="text"
              placeholder="홍길동"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={AUTH_FIELD_INPUT}
              required
            />
            <p className={AUTH_FIELD_HINT}>
              정확한 한글 이름만 입력 (2~5자, 공백/영문 불가)
            </p>
            {nameInvalid ? (
              <p className={AUTH_FIELD_HINT_ERROR}>
                한글 이름 형식이 올바르지 않습니다.
              </p>
            ) : null}
          </div>
        </div>

        {formError || initialFormError ? (
          <p className={cn("mt-5", AUTH_ALERT_ERROR)}>
            {formError || initialFormError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className={cn("mt-6", AUTH_PRIMARY_BTN)}
        >
          {busy ? "가입 중..." : "가입하기"}
        </button>
      </AuthCard>
    </div>
  );
}
