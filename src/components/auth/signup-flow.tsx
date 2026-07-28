"use client";

import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  AUTH_CARD,
  AuthBackButton,
  AuthBackLink,
} from "@/components/auth/auth-shell";
import { SignupEmailVerify } from "@/components/auth/signup-email-verify";
import {
  SocialSignupButtons,
  AuthOrDivider,
} from "@/components/auth/social-signup-buttons";
import { Input } from "@/components/ui/input";
import {
  getPasswordErrors,
  isValidKoreanName,
  isValidPassword,
} from "@/lib/auth-validation";
import { cn } from "@/lib/utils";

type Step = "social" | "verify" | "email";

const fieldInputClass =
  "h-12 border-border bg-card focus-visible:ring-primary/30";

async function requestSignupOtp(email: string) {
  const res = await fetch("/api/auth/signup-verify/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const data = (await res.json()) as { ok?: boolean; message?: string };
  return { ok: Boolean(res.ok && data.ok), message: data.message };
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

/** 회원가입 플로우 — 소셜 / 이메일 인증 / 계정 정보. */
export function SignupFlow() {
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
    <div className="w-full">
      <AuthBackLink href="/login" className="mb-4" />

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          회원가입
        </h1>
        <p className="mt-2 text-base text-muted">
          소셜 계정으로 빠르게 시작하세요
        </p>
      </div>

      <div className={`mt-5 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}>
        <SocialSignupButtons />

        <div className="mt-6">
          <AuthOrDivider />
        </div>

        <button
          type="button"
          onClick={() => setStep("verify")}
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl border border-border bg-card text-base font-semibold text-foreground transition-colors hover:bg-surface"
        >
          이메일로 가입
        </button>
      </div>
    </div>
  );
}

function EmailSignupForm({
  email,
  proof,
  onBack,
}: {
  email: string;
  proof: string;
  onBack: () => void;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordErrors = password ? getPasswordErrors(password) : [];
  const passwordMismatch =
    passwordConfirm.length > 0 && password !== passwordConfirm;
  const nameInvalid = name.length > 0 && !isValidKoreanName(name);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    if (!proof) {
      setFormError("이메일 인증이 필요합니다. 처음부터 다시 진행해 주세요.");
      return;
    }
    if (!isValidPassword(password)) {
      setFormError(
        "비밀번호는 8~72자, 영문 대소문자와 특수문자를 각각 1자 이상 포함해야 합니다.",
      );
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
      <AuthBackButton onClick={onBack} className="mb-4" />

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          이메일로 가입
        </h1>
        <p className="mt-2 text-base text-muted">계정 정보를 입력해 주세요</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className={`mt-5 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}
        noValidate
      >
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          계정 정보
        </h2>
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />

        <div className="mt-5 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
              아이디 (이메일)
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={email}
              readOnly
              className={cn(fieldInputClass, "bg-surface text-muted")}
            />
            <p className="mt-1.5 text-base text-success">이메일 인증 완료</p>
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
              비밀번호
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                placeholder="영문 대소문자, 특수문자 포함 8자 이상"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={cn("pr-16", fieldInputClass)}
                required
              />
              <div className="absolute inset-y-0 right-0 flex items-center">
                {password.length > 0 ? (
                  <span
                    className="pr-1 text-base tabular-nums text-muted"
                    aria-live="polite"
                  >
                    {password.length}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex min-h-12 min-w-12 items-center justify-center text-muted transition-colors hover:text-foreground"
                  aria-label={
                    showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" strokeWidth={2} />
                  ) : (
                    <Eye className="h-5 w-5" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-base text-muted">
              <span className="whitespace-nowrap">
                영문 대문자, 소문자, 특수문자를 각각 1자 이상 포함
              </span>{" "}
              <span className="whitespace-nowrap">(8자 이상)</span>
            </p>
            {passwordErrors.length > 0 ? (
              <p className="mt-1 text-base text-masked">
                미충족: {passwordErrors.join(", ")}
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="passwordConfirm"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
              비밀번호 확인
            </label>
            <div className="relative">
              <Input
                id="passwordConfirm"
                name="passwordConfirm"
                type={showPasswordConfirm ? "text" : "password"}
                placeholder="비밀번호를 다시 입력"
                autoComplete="new-password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                className={cn("pr-16", fieldInputClass)}
                required
              />
              <div className="absolute inset-y-0 right-0 flex items-center">
                {passwordConfirm.length > 0 ? (
                  <span
                    className="pr-1 text-base tabular-nums text-muted"
                    aria-live="polite"
                  >
                    {passwordConfirm.length}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirm((v) => !v)}
                  className="flex min-h-12 min-w-12 items-center justify-center text-muted transition-colors hover:text-foreground"
                  aria-label={
                    showPasswordConfirm ? "비밀번호 숨기기" : "비밀번호 보기"
                  }
                >
                  {showPasswordConfirm ? (
                    <EyeOff className="h-5 w-5" strokeWidth={2} />
                  ) : (
                    <Eye className="h-5 w-5" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
            {passwordMismatch ? (
              <p className="mt-1.5 text-base text-masked">
                비밀번호가 일치하지 않습니다.
              </p>
            ) : null}
          </div>

          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
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
              className={fieldInputClass}
              required
            />
            <p className="mt-1.5 text-base text-muted">
              <span className="whitespace-nowrap">정확한 한글 이름만 입력</span>{" "}
              <span className="whitespace-nowrap">(2~5자, 공백/영문 불가)</span>
            </p>
            {nameInvalid ? (
              <p className="mt-1 text-base text-masked">
                한글 이름 형식이 올바르지 않습니다.
              </p>
            ) : null}
          </div>
        </div>

        {formError ? (
          <p className="mt-5 rounded-xl bg-masked-soft px-3 py-2 text-base text-masked">
            {formError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? "가입 중..." : "가입하기"}
        </button>
      </form>
    </div>
  );
}
