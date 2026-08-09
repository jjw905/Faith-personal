"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { SignupEmailVerify } from "@/components/auth/signup-email-verify";
import { AUTH_ALERT_ERROR } from "@/components/auth/auth-shell";
import { getRecaptchaToken } from "@/components/auth/recaptcha-v3";
import { RECAPTCHA_BLOCKED_MESSAGE } from "@/lib/recaptcha";

async function requestSignupOtp(email: string) {
  let captchaToken: string | null = null;
  try {
    captchaToken = await getRecaptchaToken("signup_otp");
  } catch {
    return {
      ok: false,
      message: RECAPTCHA_BLOCKED_MESSAGE,
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

/** 소셜 가입 후 Faith 이메일 OTP 등록. */
export function SignupEmailPageClient({
  initialError,
}: {
  initialError?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState(
    initialError === "invalid"
      ? "올바른 이메일을 입력해 주세요."
      : initialError === "taken" || initialError === "unavailable"
        ? "이 이메일은 사용할 수 없습니다."
        : "",
  );
  const [pending, setPending] = useState(false);

  async function finish(email: string, proof?: string) {
    if (!proof) {
      setError("이메일 인증이 필요합니다.");
      return;
    }
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/auth/signup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, proof }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        code?: string;
        redirect?: string;
      };
      if (!res.ok || !data.ok) {
        setError(
          data.message ??
            (data.code === "unavailable" || data.code === "taken"
              ? "이 이메일은 사용할 수 없습니다."
              : "요청에 실패했습니다."),
        );
        return;
      }
      router.replace(data.redirect || "/dashboard");
      router.refresh();
    } catch {
      setError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full">
      {error ? (
        <p className={`mb-4 ${AUTH_ALERT_ERROR}`}>{error}</p>
      ) : null}
      {pending ? (
        <p className="mb-4 text-center text-base text-muted">처리 중…</p>
      ) : null}
      <SignupEmailVerify
        backHref="/signup"
        onRequestCode={requestSignupOtp}
        onConfirmCode={confirmSignupOtp}
        onVerified={({ email, proof }) => {
          void finish(email, proof);
        }}
      />
    </div>
  );
}
