"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";

import {
  GoogleIcon,
  NaverIcon,
  XIcon,
} from "@/components/auth/social-icons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  google: "Google",
  naver: "네이버",
  twitter: "X",
};

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  google: GoogleIcon,
  naver: NaverIcon,
  twitter: XIcon,
};

const CIRCLE: Record<string, string> = {
  google: "bg-white text-[#3c4043] ring-1 ring-[#dadce0]",
  naver: "bg-[#03C75A] text-white",
  twitter: "bg-black text-white",
};

export type SocialLinksInitial = {
  linked: string[];
  available: string[];
  /** 최초 가입 소셜. credentials면 null */
  primary: string | null;
  hasPassword: boolean;
  notice?: string;
};

/** 계정 설정: 소셜 로그인 연동/해제 (원형 아이콘). */
export function SocialLinksCard({ initial }: { initial: SocialLinksInitial }) {
  const router = useRouter();
  const [linked, setLinked] = useState(initial.linked);
  const [msg, setMsg] = useState(initial.notice ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const primary = initial.primary;

  async function link(provider: string) {
    setMsg("");
    setPending(provider);
    try {
      await signIn(provider, { callbackUrl: "/account?linked=1" });
    } catch {
      setMsg("연동을 시작하지 못했습니다.");
      setPending(null);
    }
  }

  async function unlink(provider: string) {
    if (provider === primary) {
      setMsg("최초 가입에 사용한 계정은 해제할 수 없습니다.");
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
        setMsg(json.message ?? "연동 해제에 실패했습니다.");
        return;
      }
      setLinked((prev) => prev.filter((p) => p !== provider));
      setMsg("연동을 해제했습니다.");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const providers = initial.available;

  return (
    <Card>
      <CardHeader className="space-y-2 px-5 pb-2 pt-5 sm:px-6">
        <CardTitle className="text-lg">소셜 로그인</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-5 pb-5 sm:px-6">
        {providers.length === 0 ? (
          <p className="text-sm text-muted">연결 가능한 소셜이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap items-start gap-5">
            {providers.map((provider) => {
              const isLinked = linked.includes(provider);
              const isPrimary = primary === provider;
              const label = LABELS[provider] ?? provider;
              const Icon = ICONS[provider] ?? GoogleIcon;
              const busy = pending === provider;

              const title = isPrimary
                ? `${label} (가입 계정)`
                : isLinked
                  ? `${label} 연결 해제`
                  : `${label} 연결`;

              return (
                <div
                  key={provider}
                  className="flex w-14 flex-col items-center gap-1.5"
                >
                  <button
                    type="button"
                    disabled={busy || isPrimary}
                    title={title}
                    aria-label={title}
                    onClick={() =>
                      void (isLinked ? unlink(provider) : link(provider))
                    }
                    className={cn(
                      "relative flex h-12 w-12 items-center justify-center rounded-full transition",
                      CIRCLE[provider] ?? "bg-surface-2",
                      isLinked ? "opacity-100" : "opacity-40 hover:opacity-70",
                      isPrimary
                        ? "cursor-default ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : "hover:brightness-[0.97] active:scale-[0.97]",
                      busy && "opacity-60",
                      "disabled:pointer-events-none",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {isPrimary ? (
                      <span
                        className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground"
                        aria-hidden
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                  <span className="text-[11px] font-medium text-muted">
                    {isPrimary ? "가입" : isLinked ? "연결" : "미연결"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        {msg ? <p className="pt-1 text-xs text-muted">{msg}</p> : null}
      </CardContent>
    </Card>
  );
}
