"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";

import {
  GoogleIcon,
  NaverIcon,
  XIcon,
} from "@/components/auth/social-icons";
import { cn } from "@/lib/utils";

const PROVIDERS = ["naver", "google", "twitter"] as const;

const LABELS: Record<(typeof PROVIDERS)[number], string> = {
  naver: "네이버",
  google: "Google",
  twitter: "X",
};

const ICONS: Record<
  (typeof PROVIDERS)[number],
  ComponentType<{ className?: string }>
> = {
  naver: NaverIcon,
  google: GoogleIcon,
  twitter: XIcon,
};

const CIRCLE: Record<(typeof PROVIDERS)[number], string> = {
  naver: "bg-[#03C75A] text-white",
  google: "bg-white text-[#3c4043] ring-1 ring-[#c7c7cc]",
  twitter: "bg-black text-white",
};

export type SocialLinksInitial = {
  linked: string[];
  available?: string[];
  primary: string | null;
  hasPassword: boolean;
  notice?: string;
};

/** 소셜 연동 목록. 이미 연결된 것은 항상 표시, 새로 연결 가능한 것만 추가로 표시. */
export function SocialLinksCard({ initial }: { initial: SocialLinksInitial }) {
  const router = useRouter();
  const [linked, setLinked] = useState(initial.linked);
  const [msg, setMsg] = useState(initial.notice ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const primary = initial.primary;
  const available = initial.available;

  async function link(provider: string) {
    setMsg("");
    setPending(provider);
    try {
      await signIn(provider, { callbackUrl: "/account?linked=1" });
    } catch {
      setMsg("연결을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.");
      setPending(null);
    }
  }

  async function unlink(provider: string) {
    if (provider === primary) {
      setMsg(
        "이 방법으로 가입한 계정이에요. 다른 로그인 방법을 추가한 뒤에는 연결을 해제할 수 있어요.",
      );
      return;
    }
    setMsg("");
    setPending(provider);
    try {
      const res = await fetch("/api/account/providers", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const json = (await res.json()) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        setMsg(json.message ?? "연결을 해제하지 못했어요.");
        return;
      }
      setLinked((prev) => prev.filter((p) => p !== provider));
      setMsg("연결을 해제했어요.");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const visibleProviders = PROVIDERS.filter(
    (p) => linked.includes(p) || !available || available.includes(p),
  );

  const orderedProviders = [...visibleProviders].sort((a, b) => {
    const rank = (p: (typeof PROVIDERS)[number]) => {
      const isLinked = linked.includes(p);
      const isSignupMethod = primary === p && isLinked;
      // 연결 해제 버튼이 있는 항목을 맨 위
      if (isLinked && !isSignupMethod) return 0;
      if (isSignupMethod) return 1;
      return 2;
    };
    return rank(a) - rank(b);
  });

  return (
    <div className="space-y-3">
      <div className="overflow-hidden">
        {orderedProviders.map((provider, index) => {
          const isLinked = linked.includes(provider);
          const isSignupMethod = primary === provider && isLinked;
          const Icon = ICONS[provider];
          const busy = pending === provider;

          return (
            <div
              key={provider}
              className={cn(
                "flex items-center justify-between gap-3 py-3.5",
                index > 0 && "border-t border-border",
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    CIRCLE[provider],
                    !isLinked && "opacity-70",
                  )}
                  aria-hidden
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {LABELS[provider]}
                  </p>
                  <p className="mt-0.5 text-sm font-medium text-muted">
                    {isSignupMethod
                      ? "가입할 때 사용한 계정"
                      : isLinked
                        ? "연결됨"
                        : "연결되지 않음"}
                  </p>
                </div>
              </div>
              {isSignupMethod ? null : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void (isLinked ? unlink(provider) : link(provider))
                  }
                  className={cn(
                    "h-9 shrink-0 rounded-full border px-3.5 text-sm font-semibold transition-colors disabled:opacity-60",
                    isLinked
                      ? "border-border-strong bg-card text-foreground hover:bg-card/80"
                      : "border-transparent bg-primary text-primary-foreground hover:bg-primary-hover",
                  )}
                >
                  {isLinked ? "연결 해제" : "연결"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {msg ? (
        <p className="text-xs font-medium text-muted">{msg}</p>
      ) : null}
    </div>
  );
}
