"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AUTH_CARD } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { isValidEmail } from "@/lib/auth-validation";

const fieldInputClass =
  "h-12 border-border bg-card focus-visible:ring-primary/30";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<null | {
    mailEnabled: boolean;
    message: string;
  }>(null);

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
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        mailEnabled?: boolean;
      };
      if (res.status === 429) {
        setError(data.message ?? "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.message ?? "요청에 실패했습니다.");
        return;
      }
      setResult({
        mailEnabled: data.mailEnabled !== false,
        message: data.message ?? "가입된 이메일이면 재설정 안내를 보냈습니다.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="w-full">
        <Link
          href="/login"
          className="mb-4 inline-flex min-h-12 items-center gap-1.5 text-base font-medium text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
          로그인으로
        </Link>

        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {result.mailEnabled ? "메일을 확인하세요" : "재설정 불가"}
          </h1>
          <p className="mt-2 text-base text-muted">{result.message}</p>
        </div>

        <div className={`mt-5 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            안내
          </h2>
          <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />

          {result.mailEnabled ? (
            <p className="mt-5 text-center text-base leading-relaxed text-foreground">
              <span className="font-semibold">{email.trim()}</span>
              <br />
              <span className="text-muted">
                메일이 오지 않으면 스팸함을 확인하거나, 잠시 후 다시 시도해
                주세요.
              </span>
            </p>
          ) : (
            <p className="mt-5 text-center text-base leading-relaxed text-muted">
              메일 서비스 연결 후 비밀번호 찾기를 이용할 수 있습니다.
            </p>
          )}

          <Link
            href="/login"
            className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          >
            로그인으로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <Link
        href="/login"
        className="mb-4 inline-flex min-h-12 items-center gap-1.5 text-base font-medium text-muted transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-5 w-5" strokeWidth={2} />
        로그인으로
      </Link>

      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          비밀번호 찾기
        </h1>
        <p className="mt-2 text-base text-muted">
          가입한 이메일로 재설정 안내를 보냅니다.
        </p>
      </div>

      <div className={`mt-4 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          이메일 확인
        </h2>
        <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />

        <form className="mt-5 space-y-5" onSubmit={handleSubmit}>
          {error ? (
            <p className="rounded-xl bg-masked-soft px-3 py-2 text-base text-masked">
              {error}
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
          <button
            type="submit"
            disabled={submitting}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
          >
            {submitting ? "보내는 중…" : "재설정 메일 받기"}
          </button>
        </form>
      </div>
    </div>
  );
}
