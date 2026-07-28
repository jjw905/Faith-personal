"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import {
  AUTH_ALERT_ERROR,
  AUTH_CARD_OFFSET,
  AUTH_FIELD_INPUT,
  AUTH_LABEL,
  AUTH_PRIMARY_BTN,
  AuthCard,
  AuthFlowHeading,
  authEnter,
  authEnterDelay,
} from "@/components/auth/auth-shell";
import { RecaptchaLegalNote } from "@/components/auth/recaptcha-legal-note";
import { getRecaptchaToken } from "@/components/auth/recaptcha-v3";
import { Input } from "@/components/ui/input";
import {
  AUTH_MAIL_UNAVAILABLE,
  AUTH_RESET_CHECK,
  AUTH_RESET_CHECK_HINT,
} from "@/lib/auth-messages";
import { isValidEmail, normalizeAuthEmail } from "@/lib/auth-validation";
import { cn } from "@/lib/utils";

export type ForgotPasswordFormProps = {
  preview?: boolean;
  initialEmail?: string;
  initialError?: string;
  forcePending?: boolean;
  forcedView?: "form" | "sent";
  mailEnabled?: boolean;
  sentMessage?: string;
};

export function ForgotPasswordForm({
  preview = false,
  initialEmail = "",
  initialError = "",
  forcePending = false,
  forcedView,
  mailEnabled: mailEnabledProp = true,
  sentMessage = AUTH_RESET_CHECK,
}: ForgotPasswordFormProps = {}) {
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState(initialError);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(forcedView === "sent");
  const [mailEnabled, setMailEnabled] = useState(mailEnabledProp);
  const [message, setMessage] = useState(sentMessage);
  const busy = forcePending || submitting;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (preview) return;
    setError("");

    const trimmed = normalizeAuthEmail(email);
    if (!trimmed) {
      setError("이메일을 입력해 주세요.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError("올바른 이메일 형식이 아닙니다.");
      return;
    }

    setSubmitting(true);
    try {
      let captchaToken: string | null = null;
      try {
        captchaToken = await getRecaptchaToken("forgot_password");
      } catch {
        setError("보안 확인에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmed,
          captchaToken: captchaToken ?? "",
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        mailEnabled?: boolean;
        code?: string;
      };
      if (res.status === 429 || data.code === "rate_limited") {
        setError(
          data.message ?? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.message ?? "요청에 실패했습니다.");
        return;
      }
      setMailEnabled(data.mailEnabled !== false);
      setMessage(data.message ?? AUTH_RESET_CHECK);
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent || forcedView === "sent") {
    return (
      <div className="w-full">
        <AuthFlowHeading
          title={mailEnabled ? "메일을 확인하세요" : "지금은 보낼 수 없습니다"}
          subtitle={message}
          backHref="/login"
          className={authEnter}
        />
        <AuthCard
          className={cn(AUTH_CARD_OFFSET, authEnter, authEnterDelay(2))}
        >
          {mailEnabled ? (
            <p className="text-center text-base leading-relaxed text-muted">
              <span className="font-semibold text-foreground">
                {normalizeAuthEmail(email) || initialEmail}
              </span>
              <br />
              {AUTH_RESET_CHECK_HINT}
            </p>
          ) : (
            <p className="text-center text-base leading-relaxed text-muted">
              {AUTH_MAIL_UNAVAILABLE}
            </p>
          )}
          <Link href="/login" className={cn("mt-5", AUTH_PRIMARY_BTN)}>
            로그인으로
          </Link>
        </AuthCard>
      </div>
    );
  }

  return (
    <div className="w-full">
      <AuthFlowHeading
        title="비밀번호 찾기"
        subtitle="이메일로 재설정 링크를 보냅니다."
        backHref="/login"
        className={authEnter}
      />

      <AuthCard
        as="form"
        className={cn(
          AUTH_CARD_OFFSET,
          "space-y-5",
          authEnter,
          authEnterDelay(2),
        )}
        onSubmit={handleSubmit}
      >
        {error || initialError ? (
          <p className={AUTH_ALERT_ERROR}>{error || initialError}</p>
        ) : null}
        <div>
          <label htmlFor="email" className={AUTH_LABEL}>
            이메일
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="name@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={AUTH_FIELD_INPUT}
            required
          />
        </div>
        <button type="submit" disabled={busy} className={AUTH_PRIMARY_BTN}>
          {busy ? "보내는 중…" : "재설정 메일 받기"}
        </button>
        <RecaptchaLegalNote />
      </AuthCard>
    </div>
  );
}
