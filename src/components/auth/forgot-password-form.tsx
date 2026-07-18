"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Input } from "@/components/ui/input";
import { isValidEmail } from "@/lib/auth-validation";
import { cn } from "@/lib/utils";

const fieldInputClass =
  "h-11 border-border-strong bg-white focus-visible:ring-primary/30";

/** 비밀번호 찾기 — 이메일 입력 후 재설정 안내 (UI 플로우). */
export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const trimmed = email.trim();
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
      // 실제 메일 발송 연동 전 — UI 확인용 지연
      await new Promise((r) => window.setTimeout(r, 600));
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
            입력하신 주소로 비밀번호 재설정 안내를 보냈습니다.
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

          <button
            type="button"
            onClick={() => setSent(false)}
            className="mt-3 flex h-11 w-full items-center justify-center rounded-xl border border-border-strong bg-white text-[15px] font-semibold text-foreground transition-colors hover:bg-surface"
          >
            다른 이메일로 다시 시도
          </button>
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
        뒤로가기
      </Link>

      <div className="text-center">
        <h1 className="text-[26px] font-bold tracking-tight text-foreground sm:text-[28px]">
          비밀번호 찾기
        </h1>
        <p className="mt-2 text-sm text-muted">
          가입한 이메일로 재설정 링크를 보내드립니다.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-4 rounded-3xl bg-card px-[30px] py-7 shadow-soft ring-1 ring-border-strong"
        noValidate
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
            onChange={(e) => {
              setEmail(e.target.value);
              setError("");
            }}
            className={fieldInputClass}
            required
          />
        </div>

        {error && (
          <p
            className={cn(
              "mt-4 rounded-lg bg-masked-soft px-3 py-2 text-sm text-masked",
            )}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {submitting ? "전송 중..." : "재설정 메일 보내기"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        비밀번호가 기억나셨나요?{" "}
        <Link
          href="/login"
          className="font-semibold text-foreground hover:underline"
        >
          로그인
        </Link>
      </p>
    </div>
  );
}
