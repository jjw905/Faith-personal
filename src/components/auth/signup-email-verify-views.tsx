"use client";

import { Check } from "lucide-react";

import {
  AUTH_ALERT_ERROR,
  AUTH_ALERT_INFO,
  AUTH_CARD_OFFSET,
  AUTH_FIELD_HINT,
  AUTH_FIELD_INPUT,
  AUTH_LABEL,
  AUTH_PRIMARY_BTN,
  AUTH_SECONDARY_BTN,
  AuthCard,
  AuthFlowHeading,
  authEnter,
  authEnterDelay,
} from "@/components/auth/auth-shell";
import { RecaptchaLegalNote } from "@/components/auth/recaptcha-legal-note";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type BackProps = {
  onBack?: () => void;
  backHref?: string;
  className?: string;
};

/** 회원가입 이메일 인증 — 이메일 입력, 인증번호 요청. */
export function SignupEmailVerifyRequestView({
  email,
  onEmailChange,
  message = "",
  pending = false,
  error = "",
  cooldownSec = 0,
  onSubmit,
  onBack,
  backHref = "/signup",
  className,
}: BackProps & {
  email: string;
  onEmailChange?: (value: string) => void;
  message?: string;
  pending?: boolean;
  error?: string;
  cooldownSec?: number;
  onSubmit?: () => void;
}) {
  return (
    <div className={cn("w-full", className)}>
      <AuthFlowHeading
        title="이메일 인증"
        subtitle="가입에 사용할 이메일로 안내를 받습니다"
        onBack={onBack}
        backHref={onBack ? undefined : backHref}
        className={authEnter}
      />

      <AuthCard
        className={cn(AUTH_CARD_OFFSET, authEnter, authEnterDelay(2))}
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.();
          }}
          noValidate
        >
          {error ? <p className={AUTH_ALERT_ERROR}>{error}</p> : null}
          {message && !error ? (
            <p className={AUTH_ALERT_INFO}>{message}</p>
          ) : null}

          <div>
            <label htmlFor="signup-verify-email" className={AUTH_LABEL}>
              이메일
            </label>
            <Input
              id="signup-verify-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => onEmailChange?.(e.target.value)}
              className={AUTH_FIELD_INPUT}
              required
            />
          </div>

          <button
            type="submit"
            disabled={pending || !email.trim() || cooldownSec > 0}
            className={AUTH_PRIMARY_BTN}
          >
            {pending
              ? "보내는 중…"
              : cooldownSec > 0
                ? `${cooldownSec}초 후 다시 시도`
                : "인증번호 받기"}
          </button>
          <RecaptchaLegalNote />
        </form>
      </AuthCard>
    </div>
  );
}

/** 회원가입 이메일 인증 — 인증번호 입력. */
export function SignupEmailVerifyCodeView({
  email,
  otp = "",
  onOtpChange,
  message = "메일을 확인해 주세요.",
  pending = false,
  error = "",
  cooldownSec = 0,
  onConfirm,
  onResend,
  onBack,
  backHref = "/signup",
  className,
}: BackProps & {
  email: string;
  otp?: string;
  onOtpChange?: (value: string) => void;
  message?: string;
  pending?: boolean;
  error?: string;
  cooldownSec?: number;
  onConfirm?: () => void;
  onResend?: () => void;
}) {
  return (
    <div className={cn("w-full", className)}>
      <AuthFlowHeading
        title="이메일 인증 확인"
        subtitle={
          <>
            <span className="font-semibold text-foreground">{email}</span>
            으로 보낸 인증번호를 입력해 주세요
          </>
        }
        onBack={onBack}
        backHref={onBack ? undefined : backHref}
        className={authEnter}
      />

      <AuthCard
        className={cn(AUTH_CARD_OFFSET, authEnter, authEnterDelay(2))}
      >
        <div className="space-y-5">
          {error ? <p className={AUTH_ALERT_ERROR}>{error}</p> : null}
          {message && !error ? (
            <p className={AUTH_ALERT_INFO}>{message}</p>
          ) : null}

          <div>
            <label htmlFor="signup-email-otp" className={AUTH_LABEL}>
              인증번호 6자리
            </label>
            <Input
              id="signup-email-otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) =>
                onOtpChange?.(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className={cn("tabular-nums tracking-[0.2em]", AUTH_FIELD_INPUT)}
              maxLength={6}
            />
            <p className={AUTH_FIELD_HINT}>인증번호는 10분 동안 유효합니다</p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={pending || otp.trim().length < 6}
              onClick={onConfirm}
              className={AUTH_PRIMARY_BTN}
            >
              {pending ? "확인 중…" : "확인"}
            </button>
            <button
              type="button"
              disabled={pending || cooldownSec > 0}
              onClick={onResend}
              className={AUTH_SECONDARY_BTN}
            >
              {cooldownSec > 0
                ? `${cooldownSec}초 후 다시 보내기`
                : "다시 보내기"}
            </button>
          </div>
        </div>
      </AuthCard>
    </div>
  );
}

/** 회원가입 이메일 인증 — 완료. */
export function SignupEmailVerifyConfirmedView({
  email,
  onContinue,
  continueLabel = "계속하기",
  onBack,
  backHref = "/signup",
  className,
}: BackProps & {
  email: string;
  onContinue?: () => void;
  continueLabel?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <AuthFlowHeading
        title="이메일 인증 완료"
        subtitle="인증이 완료되었습니다"
        onBack={onBack}
        backHref={onBack ? undefined : backHref}
        className={authEnter}
      />

      <AuthCard
        className={cn(AUTH_CARD_OFFSET, authEnter, authEnterDelay(2))}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-soft text-success">
            <Check className="h-6 w-6" strokeWidth={2.25} aria-hidden />
          </span>
          <p className="text-lg font-semibold text-foreground">{email}</p>
          <p className="text-base leading-relaxed text-muted">
            이 이메일로 가입을 이어갈 수 있습니다
          </p>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className={cn("mt-6", AUTH_PRIMARY_BTN)}
        >
          {continueLabel}
        </button>
      </AuthCard>
    </div>
  );
}
