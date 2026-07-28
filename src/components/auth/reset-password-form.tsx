"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

import {
  AUTH_ALERT_ERROR,
  AUTH_CARD_OFFSET,
  AUTH_FIELD_HINT,
  AUTH_LABEL,
  AUTH_PRIMARY_BTN,
  AuthCard,
  AuthFlowHeading,
  AuthPasswordField,
  authEnter,
  authEnterDelay,
} from "@/components/auth/auth-shell";
import { AUTH_PASSWORD_HINT, AUTH_PASSWORD_INVALID } from "@/lib/auth-messages";
import {
  getPasswordErrors,
  isValidPassword,
  normalizeAuthEmail,
} from "@/lib/auth-validation";
import { cn } from "@/lib/utils";

export type ResetPasswordFormProps = {
  preview?: boolean;
  /** 링크 유효 여부 (미리보기). */
  linkOk?: boolean;
  email?: string;
  initialError?: string;
  forcePending?: boolean;
};

export function ResetPasswordForm({
  preview = false,
  linkOk: linkOkProp,
  email: emailProp,
  initialError = "",
  forcePending = false,
}: ResetPasswordFormProps = {}) {
  const router = useRouter();
  const params = useSearchParams();
  const email = preview
    ? normalizeAuthEmail(emailProp || "preview@faith.local")
    : normalizeAuthEmail(params.get("email") || "");
  const token = preview ? "preview-token" : params.get("token") || "";
  const linkOk =
    typeof linkOkProp === "boolean" ? linkOkProp : Boolean(email && token);

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState(initialError);
  const [pending, setPending] = useState(false);
  const busy = forcePending || pending;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (preview) return;
    setError("");
    if (!linkOk) {
      setError("재설정 링크가 올바르지 않습니다.");
      return;
    }
    if (!isValidPassword(password)) {
      setError(
        password
          ? `미충족: ${getPasswordErrors(password).join(", ")}`
          : AUTH_PASSWORD_INVALID,
      );
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

  if (!linkOk) {
    return (
      <div className="w-full">
        <AuthFlowHeading
          title="새 비밀번호"
          subtitle="재설정 링크가 올바르지 않거나 만료되었습니다"
          backHref="/login"
          className={authEnter}
        />

        <AuthCard
          className={cn(AUTH_CARD_OFFSET, authEnter, authEnterDelay(1))}
        >
          <p className="text-base text-muted">
            메일에서 받은 링크로 다시 열어 주세요. 없거나 만료되었다면 비밀번호
            찾기를 다시 요청해 주세요.
          </p>
          <Link href="/forgot-password" className={cn("mt-5", AUTH_PRIMARY_BTN)}>
            비밀번호 찾기
          </Link>
        </AuthCard>

        <p
          className={cn(
            "mt-5 text-center text-base text-muted",
            authEnter,
            authEnterDelay(2),
          )}
        >
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

  return (
    <div className="w-full">
      <AuthFlowHeading
        title="새 비밀번호"
        subtitle={email}
        backHref="/login"
        className={authEnter}
      />

      <AuthCard
        className={cn(AUTH_CARD_OFFSET, authEnter, authEnterDelay(1))}
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          {error || initialError ? (
            <p className={AUTH_ALERT_ERROR}>{error || initialError}</p>
          ) : null}
          <div>
            <label htmlFor="password" className={AUTH_LABEL}>
              새 비밀번호
            </label>
            <AuthPasswordField
              id="password"
              autoComplete="new-password"
              placeholder="새 비밀번호"
              value={password}
              onChange={setPassword}
              required
            />
            <p className={AUTH_FIELD_HINT}>{AUTH_PASSWORD_HINT}</p>
          </div>
          <div>
            <label htmlFor="passwordConfirm" className={AUTH_LABEL}>
              새 비밀번호 확인
            </label>
            <AuthPasswordField
              id="passwordConfirm"
              autoComplete="new-password"
              placeholder="비밀번호를 다시 입력"
              value={passwordConfirm}
              onChange={setPasswordConfirm}
              required
            />
          </div>
          <button type="submit" disabled={busy} className={AUTH_PRIMARY_BTN}>
            {busy ? "저장 중…" : "비밀번호 저장"}
          </button>
        </form>
      </AuthCard>

      <p
        className={cn(
          "mt-5 text-center text-base text-muted",
          authEnter,
          authEnterDelay(2),
        )}
      >
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
