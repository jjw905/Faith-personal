"use client";

import { useTransition } from "react";

import {
  signInWithProvider,
  type SocialProvider,
} from "@/lib/auth-actions";

/** 소셜 회원가입 — SaaS/국내 서비스형 풀폭 스택 버튼. */

function NaverIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="currentColor"
        d="M4 4h5.2l5.1 8.2V4H20v16h-5.2l-5.1-8.2V20H4V4z"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.227-8.451L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"
      />
    </svg>
  );
}

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
      "border border-[#dadce0] bg-white text-[#3c4043] hover:bg-[#f8f9fa]",
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
}: {
  title?: string;
  dense?: boolean;
  showPrivacyNote?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <p className="text-left text-[13px] font-semibold tracking-tight text-foreground">
        {title}
      </p>
      <div
        className={
          dense
            ? "mt-4 flex w-full flex-col gap-3"
            : "mt-[31px] flex w-full flex-col gap-[17px]"
        }
      >
        {PROVIDERS.map(({ id, label, className, Icon }) => (
          <button
            key={id}
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(() => {
                void signInWithProvider(id);
              })
            }
            className={`flex w-full items-center justify-center rounded-xl text-[15px] font-semibold transition-colors disabled:opacity-60 ${
              dense ? "h-11" : "h-12"
            } ${className}`}
          >
            {/* 고정 폭 블록을 가운데 배치 → 로고 세로선 정렬 + 글자 가운데 */}
            <span className="grid w-[7.25rem] grid-cols-[1.25rem_minmax(0,1fr)] items-center gap-3">
              <span className="flex h-5 w-5 items-center justify-center">
                <Icon />
              </span>
              <span className="text-center">{label}</span>
            </span>
          </button>
        ))}
      </div>
      {showPrivacyNote && (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-2">
          이름과 이메일만 제공받으며, 동의 없이 게시하지 않습니다.
        </p>
      )}
    </div>
  );
}

/** 소셜 / 이메일 구분선 — Notion·Slack 스타일. */
export function AuthOrDivider() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="또는">
      <span className="h-px flex-1 bg-border-strong" />
      <span className="shrink-0 text-[12px] font-medium text-muted-2">또는</span>
      <span className="h-px flex-1 bg-border-strong" />
    </div>
  );
}
