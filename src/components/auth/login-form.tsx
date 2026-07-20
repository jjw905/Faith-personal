"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useState, type FormEvent } from "react";

import {
  AuthOrDivider,
  SocialSignupButtons,
} from "@/components/auth/social-signup-buttons";
import { Input } from "@/components/ui/input";

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "이메일 또는 비밀번호가 올바르지 않습니다.",
  EmailConflict: "이미 이메일·비밀번호로 가입된 계정입니다. 이메일로 로그인해 주세요.",
  Disabled: "비활성화된 계정입니다.",
  Configuration:
    "서버 로그인 설정이 불완전합니다. AUTH_SECRET, AUTH_URL, DATABASE_URL을 확인하세요.",
  OAuthAccountNotLinked: "이미 다른 방식으로 가입된 이메일입니다.",
};

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
  const displayError =
    error ||
    (urlError ? ERROR_MESSAGES[urlError] || "로그인에 실패했습니다." : "");

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
      });
      if (!res || res.error) {
        setError(
          ERROR_MESSAGES[res?.error ?? ""] ??
            "이메일 또는 비밀번호가 올바르지 않습니다.",
        );
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full max-w-md self-start">
      <div className="text-center">
        <h1 className="text-[26px] font-bold tracking-tight text-foreground sm:text-[28px]">
          로그인
        </h1>
      </div>

      <div className="mt-4 rounded-3xl bg-card px-[30px] py-7 shadow-soft ring-1 ring-border-strong">
        <SocialSignupButtons
          title="간편 소셜 로그인"
          showPrivacyNote={false}
        />

        <div className="mt-6">
          <AuthOrDivider />
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          {displayError ? (
            <p className="rounded-xl bg-masked-soft px-3 py-2 text-sm text-masked">
              {displayError}
            </p>
          ) : null}

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-foreground"
            >
              이메일
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              placeholder="you@company.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 border-border-strong bg-white focus-visible:ring-primary/30"
              required
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-foreground"
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
              className="h-11 border-border-strong bg-white focus-visible:ring-primary/30"
              required
            />
          </div>

          <div className="flex items-center justify-between pt-0.5 text-sm">
            <label className="flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                name="remember"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-border-strong text-primary"
              />
              로그인 상태 유지
            </label>
            <Link
              href="/forgot-password"
              className="font-medium text-muted transition-colors hover:text-foreground"
            >
              비밀번호 찾기
            </Link>
          </div>

          <button
            type="submit"
            disabled={pending}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "로그인 중…" : "로그인"}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-muted">
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
