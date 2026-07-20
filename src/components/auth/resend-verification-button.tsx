"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ResendVerificationButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onClick() {
    setError("");
    setPending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        redirect?: string;
        message?: string;
      };
      if (data.redirect) {
        router.replace(data.redirect);
        router.refresh();
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.message ?? "재발송에 실패했습니다.");
      }
    } catch {
      setError("재발송에 실패했습니다.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => void onClick()}
        className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground disabled:opacity-60"
      >
        {pending ? "처리 중…" : "인증 메일 다시 보내기"}
      </button>
      {error ? <p className="text-center text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
