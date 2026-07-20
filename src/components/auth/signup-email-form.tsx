"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function SignupEmailForm({
  initialError,
}: {
  initialError?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState(
    initialError === "invalid"
      ? "올바른 이메일을 입력해 주세요."
      : initialError === "taken"
        ? "이미 사용 중인 이메일입니다."
        : "",
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/auth/signup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        code?: string;
        redirect?: string;
      };
      if (!res.ok || !data.ok) {
        setError(
          data.message ??
            (data.code === "taken"
              ? "이미 사용 중인 이메일입니다."
              : "요청에 실패했습니다."),
        );
        return;
      }
      router.replace(data.redirect || "/signup/verify");
      router.refresh();
    } catch {
      setError("요청에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block text-[13px] font-medium text-foreground"
        >
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex h-11 w-full rounded-xl border border-border-strong bg-white px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
        {error ? (
          <p className="mt-1.5 text-[12px] text-red-600">{error}</p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "처리 중…" : "계속하기"}
      </button>
      <Link
        href="/signup"
        className="mt-4 block text-center text-[13px] text-muted hover:text-foreground"
      >
        돌아가기
      </Link>
    </form>
  );
}
