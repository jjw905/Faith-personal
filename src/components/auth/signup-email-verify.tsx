"use client";

import { useEffect, useState } from "react";

import {
  SignupEmailVerifyCodeView,
  SignupEmailVerifyConfirmedView,
  SignupEmailVerifyRequestView,
} from "@/components/auth/signup-email-verify-views";
import { isValidEmail, normalizeAuthEmail } from "@/lib/auth-validation";
import {
  fixtureSignupEmailVerify,
  FIXTURE_SIGNUP_VERIFY_EMAIL,
} from "@/lib/page-ux-fixtures";

export type SignupEmailVerifyStep = "email" | "code" | "confirmed";

export type SignupOtpRequestResult = {
  ok: boolean;
  message?: string;
  retryAfterSec?: number;
};

export type SignupEmailVerifyProps = {
  /** 디자인/UX 미리보기: API 없이 단계만 전환. */
  preview?: boolean;
  /** 미리보기에서 단계 고정. */
  forcedStep?: SignupEmailVerifyStep;
  initialEmail?: string;
  initialCode?: string;
  initialMessage?: string;
  forcePending?: boolean;
  /** 미리보기: 에러 문구 고정. */
  initialError?: string;
  /** 미리보기: 쿨다운 초. */
  forceCooldownSec?: number;
  backHref?: string;
  onBack?: () => void;
  onRequestCode?: (email: string) => Promise<SignupOtpRequestResult>;
  onConfirmCode?: (
    email: string,
    code: string,
  ) => Promise<{ ok: boolean; message?: string; proof?: string }>;
  /** 인증 완료 화면에서 계속하기 시 호출. */
  onVerified?: (payload: { email: string; proof?: string }) => void;
};

const DEFAULT_COOLDOWN_SEC = 60;
const COOLDOWN_STORAGE_PREFIX = "faith.signup-otp-cooldown:";
const BROWSER_COOLDOWN_KEY = "faith.signup-otp-cooldown:browser";

function cooldownStorageKey(email: string) {
  return `${COOLDOWN_STORAGE_PREFIX}${normalizeAuthEmail(email)}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 새로고침·탭 닫기 후에도 같은 브라우저 쿨다운 유지. */
function readStoredCooldownSec(email: string): number {
  const store = storage();
  if (!store) return 0;
  const trimmed = normalizeAuthEmail(email);
  const keys = trimmed
    ? [cooldownStorageKey(trimmed), BROWSER_COOLDOWN_KEY]
    : [BROWSER_COOLDOWN_KEY];
  let maxLeft = 0;
  for (const key of keys) {
    try {
      const raw = store.getItem(key);
      if (!raw) continue;
      const until = Number(raw);
      if (!Number.isFinite(until)) continue;
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) {
        store.removeItem(key);
        continue;
      }
      maxLeft = Math.max(maxLeft, left);
    } catch {
      // ignore
    }
  }
  return maxLeft;
}

function writeStoredCooldown(
  email: string,
  sec: number,
  opts?: { browserWide?: boolean },
) {
  const store = storage();
  if (!store) return;
  const trimmed = normalizeAuthEmail(email);
  try {
    if (sec <= 0) {
      if (trimmed) store.removeItem(cooldownStorageKey(trimmed));
      if (opts?.browserWide) store.removeItem(BROWSER_COOLDOWN_KEY);
      return;
    }
    const until = String(Date.now() + Math.max(1, sec) * 1000);
    if (trimmed) store.setItem(cooldownStorageKey(trimmed), until);
    if (opts?.browserWide) store.setItem(BROWSER_COOLDOWN_KEY, until);
  } catch {
    // private mode 등
  }
}

/** 회원가입 이메일 인증 / 인증 확인 플로우. */
export function SignupEmailVerify({
  preview = false,
  forcedStep,
  initialEmail = "",
  initialCode = "",
  initialMessage = "",
  forcePending = false,
  initialError = "",
  forceCooldownSec,
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
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);
  const [cooldownSec, setCooldownSec] = useState(
    typeof forceCooldownSec === "number" ? forceCooldownSec : 0,
  );

  const activeStep = forcedStep ?? step;
  const busy = forcePending || pending;

  // 이메일 변경·재접속 시 저장된 쿨다운 복원 (미리보기 forceCooldown 제외)
  useEffect(() => {
    if (preview) {
      if (typeof forceCooldownSec === "number") {
        setCooldownSec(forceCooldownSec);
      }
      return;
    }
    setCooldownSec(readStoredCooldownSec(email));
  }, [email, preview, forceCooldownSec]);

  useEffect(() => {
    if (cooldownSec <= 0) return;
    const id = window.setTimeout(() => {
      setCooldownSec((s) => {
        const next = Math.max(0, s - 1);
        if (next <= 0) writeStoredCooldown(email, 0, { browserWide: true });
        return next;
      });
    }, 1000);
    return () => window.clearTimeout(id);
  }, [cooldownSec, email]);

  function startCooldown(
    sec = DEFAULT_COOLDOWN_SEC,
    forEmail?: string,
    browserWide = false,
  ) {
    const target = normalizeAuthEmail(forEmail ?? email);
    const value = Math.max(1, Math.ceil(sec));
    setCooldownSec(value);
    writeStoredCooldown(target, value, { browserWide });
  }

  async function requestCode() {
    setError("");
    setMessage("");
    const trimmed = normalizeAuthEmail(email);
    if (!trimmed) {
      setError("이메일을 입력해 주세요.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setError("올바른 이메일 형식이 아닙니다.");
      return;
    }

    const stored = readStoredCooldownSec(trimmed);
    if (stored > 0) {
      setCooldownSec(stored);
      setError(`${stored}초 후 다시 시도해 주세요.`);
      return;
    }
    if (cooldownSec > 0) {
      setError(`${cooldownSec}초 후 다시 시도해 주세요.`);
      return;
    }

    if (preview || !onRequestCode) {
      setEmail(trimmed);
      setMessage(fixture.message);
      startCooldown(DEFAULT_COOLDOWN_SEC, trimmed);
      if (!forcedStep) setStep("code");
      return;
    }

    setPending(true);
    try {
      const result = await onRequestCode(trimmed);
      if (!result.ok) {
        if (
          result.message?.includes("너무 많") ||
          result.retryAfterSec
        ) {
          startCooldown(DEFAULT_COOLDOWN_SEC, trimmed, true);
        }
        setError(result.message ?? "안내 발송에 실패했습니다.");
        return;
      }
      setEmail(trimmed);
      setMessage(result.message ?? fixture.message);
      startCooldown(DEFAULT_COOLDOWN_SEC, trimmed);
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
        normalizeAuthEmail(email),
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
            email: normalizeAuthEmail(email) || fixture.email,
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
        cooldownSec={cooldownSec}
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
      cooldownSec={cooldownSec}
      onSubmit={() => void requestCode()}
      onBack={onBack}
      backHref={backHref}
    />
  );
}
