"use client";

import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { SocialSignupButtons, AuthOrDivider } from "@/components/auth/social-signup-buttons";
import { Input } from "@/components/ui/input";
import {
  getPasswordErrors,
  isValidEmail,
  isValidKoreanName,
  isValidPassword,
} from "@/lib/auth-validation";
import { cn } from "@/lib/utils";

type Step = "social" | "email";
type EmailCheck = "idle" | "checking" | "available" | "taken" | "invalid";

const fieldInputClass =
  "border-border-strong bg-white focus-visible:ring-primary/30";

/** 회원가입 플로우 — 소셜 선택 / 일반(수동) 가입 분리. */
export function SignupFlow() {
  const [step, setStep] = useState<Step>("social");

  if (step === "email") {
    return <EmailSignupForm onBack={() => setStep("social")} />;
  }

  return (
    <div className="w-full max-w-md self-start">
      <div className="text-center">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground sm:text-3xl">
          회원가입
        </h1>
        <p className="mt-2 text-sm text-muted">
          소셜 계정으로 빠르게 시작하세요
        </p>
      </div>

      <div className="mt-6 rounded-3xl bg-card px-[30px] py-7 shadow-soft ring-1 ring-border-strong">
        <SocialSignupButtons />

        <div className="mt-[31px]">
          <AuthOrDivider />
        </div>

        <button
          type="button"
          onClick={() => setStep("email")}
          className="mt-[31px] flex h-12 w-full items-center justify-center rounded-xl border border-border-strong bg-white text-[15px] font-semibold text-foreground transition-colors hover:bg-surface"
        >
          이메일로 가입
        </button>
      </div>
    </div>
  );
}

function EmailSignupForm({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [emailCheck, setEmailCheck] = useState<EmailCheck>("idle");
  const [emailMessage, setEmailMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const passwordErrors = password ? getPasswordErrors(password) : [];
  const passwordMismatch =
    passwordConfirm.length > 0 && password !== passwordConfirm;
  const nameInvalid = name.length > 0 && !isValidKoreanName(name);

  async function handleCheckEmail() {
    setFormError("");
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailCheck("invalid");
      setEmailMessage("이메일을 입력해 주세요.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setEmailCheck("invalid");
      setEmailMessage("올바른 이메일 형식이 아닙니다.");
      return;
    }

    setEmailCheck("checking");
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json()) as {
        available?: boolean;
        message?: string;
      };
      if (data.available) {
        setEmailCheck("available");
        setEmailMessage(data.message ?? "사용 가능한 이메일입니다.");
      } else {
        setEmailCheck(res.ok ? "taken" : "invalid");
        setEmailMessage(data.message ?? "사용할 수 없는 이메일입니다.");
      }
    } catch {
      setEmailCheck("invalid");
      setEmailMessage("중복 확인에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");

    if (emailCheck !== "available") {
      setFormError("이메일 중복 확인을 완료해 주세요.");
      return;
    }
    if (!isValidPassword(password)) {
      setFormError(
        "비밀번호는 8자 이상, 영문 대소문자와 특수문자를 각각 1자 이상 포함해야 합니다.",
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
          email: email.trim(),
          password,
          passwordConfirm,
          name: name.trim(),
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setFormError(data.message ?? "회원가입에 실패했습니다.");
        if (res.status === 409) {
          setEmailCheck("taken");
          setEmailMessage("이미 사용 중인 이메일입니다.");
        }
        return;
      }
      router.push("/login");
    } catch {
      setFormError("회원가입 요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md self-start">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        뒤로가기
      </button>

      <div className="text-center">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground sm:text-3xl">
          이메일로 가입
        </h1>
        <p className="mt-2 text-sm text-muted">
          계정 정보를 입력해 주세요
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-6 rounded-3xl bg-card px-[30px] py-7 shadow-soft ring-1 ring-border-strong"
        noValidate
      >
        <div className="space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              아이디 (이메일)
            </label>
            <div className="flex gap-2">
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailCheck("idle");
                  setEmailMessage("");
                }}
                className={cn("min-w-0 flex-1", fieldInputClass)}
                required
              />
              <button
                type="button"
                onClick={handleCheckEmail}
                disabled={emailCheck === "checking"}
                className="h-10 shrink-0 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-50"
              >
                {emailCheck === "checking" ? "확인 중" : "중복확인"}
              </button>
            </div>
            {emailMessage && (
              <p
                className={cn(
                  "mt-1.5 text-xs",
                  emailCheck === "available" ? "text-success" : "text-masked",
                )}
              >
                {emailMessage}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-foreground"
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
                {password.length > 0 && (
                  <span
                    className="pr-1 text-[11px] tabular-nums text-muted-2"
                    aria-live="polite"
                  >
                    {password.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="flex h-10 w-10 items-center justify-center text-muted transition-colors hover:text-foreground"
                  aria-label={
                    showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                  }
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
            <p className="mt-1.5 text-xs text-muted">
              영문 대문자, 소문자, 특수문자를 각각 1자 이상 포함 (8자 이상)
            </p>
            {passwordErrors.length > 0 && (
              <p className="mt-1 text-xs text-masked">
                미충족: {passwordErrors.join(", ")}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="passwordConfirm"
              className="mb-1.5 block text-sm font-medium text-foreground"
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
                {passwordConfirm.length > 0 && (
                  <span
                    className="pr-1 text-[11px] tabular-nums text-muted-2"
                    aria-live="polite"
                  >
                    {passwordConfirm.length}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowPasswordConfirm((v) => !v)}
                  className="flex h-10 w-10 items-center justify-center text-muted transition-colors hover:text-foreground"
                  aria-label={
                    showPasswordConfirm ? "비밀번호 숨기기" : "비밀번호 보기"
                  }
                >
                  {showPasswordConfirm ? (
                    <EyeOff className="h-4 w-4" strokeWidth={2} />
                  ) : (
                    <Eye className="h-4 w-4" strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
            {passwordMismatch && (
              <p className="mt-1.5 text-xs text-masked">
                비밀번호가 일치하지 않습니다.
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="name"
              className="mb-1.5 block text-sm font-medium text-foreground"
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
            <p className="mt-1.5 text-xs text-muted">
              정확한 한글 이름만 입력 (2~5자, 공백/영문 불가)
            </p>
            {nameInvalid && (
              <p className="mt-1 text-xs text-masked">
                한글 이름 형식이 올바르지 않습니다.
              </p>
            )}
          </div>
        </div>

        {formError && (
          <p className="mt-5 rounded-lg bg-masked-soft px-3 py-2 text-sm text-masked">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? "가입 중..." : "가입하기"}
        </button>
      </form>
    </div>
  );
}
