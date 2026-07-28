"use client";

import { Check } from "lucide-react";

import {
  AUTH_CARD,
  AuthBackButton,
  AuthBackLink,
} from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const fieldInputClass =
  "h-12 border-border bg-card text-base focus-visible:ring-primary/30";

type BackProps = {
  onBack?: () => void;
  backHref?: string;
  className?: string;
};

function AuthStepBack({
  onBack,
  backHref = "/signup",
  className,
}: BackProps) {
  if (onBack) {
    return <AuthBackButton onClick={onBack} className={cn("mb-4", className)} />;
  }
  return <AuthBackLink href={backHref} className={cn("mb-4", className)} />;
}

/** 회원가입 이메일 인증 — 이메일 입력, 인증번호 요청. */
export function SignupEmailVerifyRequestView({
  email,
  onEmailChange,
  message = "",
  pending = false,
  error = "",
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
  onSubmit?: () => void;
}) {
  return (
    <div className={cn("w-full", className)}>
      <AuthStepBack onBack={onBack} backHref={backHref} />

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          이메일 인증
        </h1>
        <p className="mt-2 text-base text-muted">
          가입에 사용할 이메일로 인증번호를 받습니다
        </p>
      </div>

      <div className={`mt-5 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          이메일
        </h2>
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />

        <form
          className="mt-5 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.();
          }}
          noValidate
        >
          {error ? (
            <p className="rounded-xl bg-masked-soft px-3 py-2 text-base text-masked">
              {error}
            </p>
          ) : null}
          {message && !error ? (
            <p className="rounded-xl bg-surface px-3 py-2 text-base text-muted">
              {message}
            </p>
          ) : null}

          <div>
            <label
              htmlFor="signup-verify-email"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
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
              className={fieldInputClass}
              required
            />
          </div>

          <button
            type="submit"
            disabled={pending || !email.trim()}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "보내는 중…" : "인증번호 받기"}
          </button>
        </form>
      </div>
    </div>
  );
}

/** 회원가입 이메일 인증 — 인증번호 입력. */
export function SignupEmailVerifyCodeView({
  email,
  otp = "",
  onOtpChange,
  message = "인증번호를 발송했습니다.",
  pending = false,
  error = "",
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
  onConfirm?: () => void;
  onResend?: () => void;
}) {
  return (
    <div className={cn("w-full", className)}>
      <AuthStepBack onBack={onBack} backHref={backHref} />

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          이메일 인증 확인
        </h1>
        <p className="mt-2 text-base text-muted">
          <span className="font-semibold text-foreground">{email}</span>
          으로 보낸 인증번호를 입력해 주세요
        </p>
      </div>

      <div className={`mt-5 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          인증번호
        </h2>
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />

        <div className="mt-5 space-y-5">
          {error ? (
            <p className="rounded-xl bg-masked-soft px-3 py-2 text-base text-masked">
              {error}
            </p>
          ) : null}
          {message && !error ? (
            <p className="rounded-xl bg-surface px-3 py-2 text-base text-muted">
              {message}
            </p>
          ) : null}

          <div>
            <label
              htmlFor="signup-email-otp"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
              인증번호 6자리
            </label>
            <Input
              id="signup-email-otp"
              name="otp"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={otp}
              onChange={(e) =>
                onOtpChange?.(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              className={cn("tabular-nums tracking-[0.2em]", fieldInputClass)}
              maxLength={6}
            />
            <p className="mt-1.5 text-base text-muted">
              인증번호는 10분 동안 유효합니다
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              disabled={pending || otp.trim().length < 6}
              onClick={onConfirm}
              className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
            >
              {pending ? "확인 중…" : "확인"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onResend}
              className="flex min-h-12 w-full items-center justify-center rounded-xl border border-border bg-card text-base font-semibold text-foreground transition-colors hover:bg-surface disabled:opacity-60"
            >
              다시 보내기
            </button>
          </div>
        </div>
      </div>
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
      <AuthStepBack onBack={onBack} backHref={backHref} />

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          이메일 인증 완료
        </h1>
        <p className="mt-2 text-base text-muted">인증이 완료되었습니다</p>
      </div>

      <div className={`mt-5 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          안내
        </h2>
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />

        <div className="mt-5 flex flex-col items-center gap-3 text-center">
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
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
}
