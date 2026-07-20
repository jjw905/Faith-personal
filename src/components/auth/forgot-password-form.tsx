"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Input } from "@/components/ui/input";
import { isValidEmail } from "@/lib/auth-validation";

const fieldInputClass =
  "h-11 border-border-strong bg-white focus-visible:ring-primary/30";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
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
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "요청에 실패했습니다.");
        return;
      }
      setSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-md self-start">
        <Link
          href="/login"
          className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} />
          로그인으로
        </Link>

        <div className="text-center">
          <h1 className="text-[26px] font-bold tracking-tight text-foreground sm:text-[28px]">
            메일을 확인하세요
          </h1>
          <p className="mt-2 text-sm text-muted">
            가입된 주소라면 비밀번호 재설정 안내를 보냈습니다.
          </p>
        </div>

        <div className="mt-4 rounded-3xl bg-card px-[30px] py-7 shadow-soft ring-1 ring-border-strong">
          <p className="text-center text-sm leading-relaxed text-foreground">
            <span className="font-semibold">{email.trim()}</span>
            <br />
            <span className="text-muted">
              메일이 오지 않으면 스팸함을 확인하거나, 잠시 후 다시 시도해
              주세요.
            </span>
          </p>

          <Link
            href="/login"
            className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md self-start">
      <Link
        href="/login"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={2} />
        로그인으로
      </Link>

      <div className="text-center">
        <h1 className="text-[26px] font-bold tracking-tight text-foreground sm:text-[28px]">
          비밀번호 찾기
        </h1>
        <p className="mt-2 text-sm text-muted">
          가입한 이메일로 재설정 안내를 보냅니다.
        </p>
      </div>

      <div className="mt-4 rounded-3xl bg-card px-[30px] py-7 shadow-soft ring-1 ring-border-strong">
        <form className="space-y-5" onSubmit={handleSubmit}>
          {error ? (
            <p className="rounded-xl bg-masked-soft px-3 py-2 text-sm text-masked">
              {error}
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
              className={fieldInputClass}
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? "보내는 중…" : "재설정 메일 받기"}
          </button>
        </form>
      </div>
    </div>
  );
}
