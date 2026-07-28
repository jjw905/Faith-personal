"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getSession, signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

import { AUTH_CARD } from "@/components/auth/auth-shell";
import {
  AuthOrDivider,
  SocialSignupButtons,
} from "@/components/auth/social-signup-buttons";
import { Input } from "@/components/ui/input";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "이메일 또는 비밀번호가 올바르지 않습니다.",
  EmailConflict:
    "이미 있는 계정이에요. 예전에 쓰던 방식으로 로그인한 뒤, 계정 설정에서 연결해 주세요.",
  Disabled: "사용할 수 없는 계정이에요.",
  Configuration: "로그인 준비가 아직 끝나지 않았어요. 잠시 후 다시 시도해 주세요.",
  OAuthAccountNotLinked:
    "이미 있는 계정이에요. 예전에 쓰던 방식으로 로그인한 뒤, 계정 설정에서 연결해 주세요.",
  AccessDenied: "로그인을 완료하지 못했어요.",
  OAuthCallback: "소셜 로그인 중 문제가 생겼어요. 다시 시도해 주세요.",
  Callback: "로그인 처리 중 문제가 생겼어요. 다시 시도해 주세요.",
  Verification: "인증 링크가 만료되었거나 올바르지 않아요.",
};

const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
  rate_limited: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  disabled: "비활성화된 계정입니다. 관리자에게 문의해 주세요.",
  email_unverified:
    "이메일 인증이 완료되지 않은 계정입니다. 고객지원에 문의해 주세요.",
  credentials: "이메일 또는 비밀번호가 올바르지 않습니다.",
};

const fieldInputClass =
  "h-12 border-border bg-card focus-visible:ring-primary/30";

/** 로그인 패널 — Credentials + 소셜. */
export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const urlError = searchParams.get("error");
  const urlCode = searchParams.get("code");
  const registered = searchParams.get("registered") === "1";
  const displayError =
    error ||
    (urlCode && CODE_MESSAGES[urlCode]) ||
    (urlError ? ERROR_MESSAGES[urlError] || "로그인에 실패했습니다." : "");
  const displayInfo = registered
    ? "회원가입이 완료되었습니다. 로그인해 주세요."
    : "";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      document.cookie = `faith.remember=${remember ? "1" : "0"}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });
      if (!res || res.error) {
        const code =
          typeof (res as { code?: string } | undefined)?.code === "string"
            ? (res as { code?: string }).code
            : undefined;
        setError(
          (code && CODE_MESSAGES[code]) ||
            ERROR_MESSAGES[res?.error ?? ""] ||
            "이메일 또는 비밀번호가 올바르지 않습니다.",
        );
        return;
      }

      let session = await getSession();
      for (let attempt = 0; !session?.user?.id && attempt < 4; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
        session = await getSession();
      }
      if (!session?.user?.id || session.user.disabled) {
        setError("로그인 세션을 만들지 못했습니다. 다시 시도해 주세요.");
        return;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("로그인 처리 중 문제가 생겼어요. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          로그인
        </h1>
      </div>

      <div className={`mt-4 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}>
        <SocialSignupButtons
          title="간편 소셜 로그인"
          showPrivacyNote={false}
        />

        <div className="mt-6">
          <AuthOrDivider />
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            이메일 로그인
          </h2>
          <div className="-mt-2 h-0.5 w-full bg-foreground" aria-hidden />

          {displayInfo ? (
            <p className="rounded-xl bg-surface px-3 py-2 text-base text-foreground">
              {displayInfo}
            </p>
          ) : null}
          {displayError ? (
            <p className="rounded-xl bg-masked-soft px-3 py-2 text-base text-masked">
              {displayError}
            </p>
          ) : null}

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
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
              className={fieldInputClass}
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
              비밀번호
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="비밀번호를 입력하세요"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldInputClass}
              required
            />
          </div>

          <div className="flex flex-nowrap items-center justify-between gap-2 border-t border-border pt-4 text-base">
            <label className="flex min-h-12 shrink-0 items-center gap-2 whitespace-nowrap text-muted">
              <input
                type="checkbox"
                name="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-border text-primary"
              />
              로그인 상태 유지
            </label>
            <Link
              href="/forgot-password"
              className="inline-flex min-h-12 shrink-0 items-center whitespace-nowrap font-medium text-muted transition-colors hover:text-foreground"
            >
              비밀번호 찾기
            </Link>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "로그인 중…" : "로그인"}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-base text-muted whitespace-nowrap">
        아직 계정이 없으신가요?{" "}
        <Link
          href="/signup"
          className="font-semibold text-foreground hover:underline"
        >
          회원가입
        </Link>
      </p>
    </div>
  );
}
