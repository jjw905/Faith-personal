"use client";

import { signIn } from "next-auth/react";
import { useState, useTransition } from "react";

import {
  AUTH_ALERT_ERROR,
  AuthSectionHeader,
} from "@/components/auth/auth-shell";
import {
  GoogleIcon,
  NaverIcon,
  XIcon,
} from "@/components/auth/social-icons";

/** 소셜 회원가입 — SaaS/국내 서비스형 풀폭 스택 버튼. */

const PROVIDERS = [
  {
    id: "naver",
    label: "네이버",
    className: "bg-[#03C75A] text-white hover:brightness-[0.96]",
    Icon: NaverIcon,
  },
  {
    id: "google",
    label: "Google",
    className:
      "border border-border bg-card text-foreground hover:bg-surface",
    Icon: GoogleIcon,
  },
  {
    id: "twitter",
    label: "X",
    className: "bg-black text-white hover:bg-[#141414]",
    Icon: XIcon,
  },
] as const;

export function SocialSignupButtons({
  title = "간편 소셜 회원가입",
  dense = false,
  showPrivacyNote = true,
  /** 카드 안에 다른 진한 제목 선이 있으면 끈다. */
  showTitleRule = true,
  /** 페이지에 이미 h1이 있으면 카드 안 제목 생략 (중복 크롬↓). */
  showHeading = true,
}: {
  title?: string;
  dense?: boolean;
  showPrivacyNote?: boolean;
  showTitleRule?: boolean;
  showHeading?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSocial(id: (typeof PROVIDERS)[number]["id"]) {
    setError("");
    startTransition(() => {
      // redirect:true가 환경에 따라 무반응일 수 있어 URL을 받아 직접 이동.
      void signIn(id, { callbackUrl: "/dashboard", redirect: false })
        .then((res) => {
          if (res?.url) {
            window.location.assign(res.url);
            return;
          }
          if (id === "twitter") {
            setError("X 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
            return;
          }
          if (id === "google") {
            setError(
              "Google 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            );
            return;
          }
          setError(
            res?.error
              ? "소셜 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요."
              : "소셜 로그인 설정에 문제가 있습니다. 잠시 후 다시 시도해 주세요.",
          );
        })
        .catch(() => {
          setError("소셜 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        });
    });
  }

  return (
    <div>
      {showHeading ? (
        showTitleRule ? (
          <AuthSectionHeader title={title} />
        ) : (
          <p className="text-left text-xl font-bold tracking-tight text-foreground">
            {title}
          </p>
        )
      ) : null}
      <div
        className={
          !showHeading
            ? "flex w-full flex-col gap-3"
            : dense || !showTitleRule
              ? "mt-4 flex w-full flex-col gap-3"
              : "mt-5 flex w-full flex-col gap-3"
        }
      >
        {PROVIDERS.map(({ id, label, className, Icon }) => (
          <button
            key={id}
            type="button"
            disabled={pending}
            onClick={() => handleSocial(id)}
            className={`flex h-12 min-h-12 w-full items-center justify-center rounded-xl text-base font-semibold transition-colors disabled:opacity-60 ${className}`}
          >
            <span className="grid w-[7.25rem] grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center">
                <Icon />
              </span>
              <span className="text-center">{label}</span>
            </span>
          </button>
        ))}
      </div>
      {error ? <p className={`mt-3 ${AUTH_ALERT_ERROR}`}>{error}</p> : null}
      {showPrivacyNote && (
        <p className="mt-3 text-center text-base leading-relaxed text-muted">
          이름과 이메일만 제공받으며, 동의 없이 게시하지 않습니다.
        </p>
      )}
    </div>
  );
}

/** 소셜 / 이메일 구분선. */
export function AuthOrDivider() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="또는">
      <span className="h-px flex-1 bg-border" />
      <span className="shrink-0 text-base font-medium text-muted">또는</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
