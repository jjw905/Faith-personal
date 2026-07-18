"use client";

import Link from "next/link";
import { useState } from "react";

import {
  AuthOrDivider,
  SocialSignupButtons,
} from "@/components/auth/social-signup-buttons";
import { Input } from "@/components/ui/input";

/** 로그인 패널 — 요소 간 여유를 둔 SaaS형 레이아웃. */
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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

        <form
          className="mt-6 space-y-5"
          onSubmit={(e) => e.preventDefault()}
        >
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
            />
          </div>

          <div className="flex items-center justify-between pt-0.5 text-sm">
            <label className="flex items-center gap-2 text-muted">
              <input
                type="checkbox"
                name="remember"
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
            className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            로그인
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
