"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import { AUTH_CARD } from "@/components/auth/auth-shell";
import { Input } from "@/components/ui/input";
import { getPasswordErrors, isValidPassword } from "@/lib/auth-validation";

const fieldInputClass =
  "h-12 border-border bg-card focus-visible:ring-primary/30";

export function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const email = (params.get("email") || "").trim().toLowerCase();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email || !token) {
      setError("재설정 링크가 올바르지 않습니다.");
      return;
    }
    if (!isValidPassword(password)) {
      setError(`미충족: ${getPasswordErrors(password).join(", ")}`);
      return;
    }
    if (password !== passwordConfirm) {
      setError("비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          token,
          password,
          passwordConfirm,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) {
        setError(data.message ?? "재설정에 실패했습니다.");
        return;
      }
      router.replace("/login");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          새 비밀번호
        </h1>
        <p className="mt-2 text-base text-muted">{email || "재설정"}</p>
      </div>

      <div className={`mt-4 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}>
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          비밀번호 설정
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
              htmlFor="password"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
              새 비밀번호
            </label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldInputClass}
              required
            />
          </div>
          <div>
            <label
              htmlFor="passwordConfirm"
              className="mb-1.5 block text-base font-semibold text-foreground"
            >
              새 비밀번호 확인
            </label>
            <Input
              id="passwordConfirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className={fieldInputClass}
              required
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60"
          >
            {pending ? "저장 중…" : "비밀번호 저장"}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-base text-muted">
        <Link
          href="/login"
          className="font-semibold text-foreground hover:underline"
        >
          로그인으로
        </Link>
      </p>
    </div>
  );
}
