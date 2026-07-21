"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const LABELS: Record<string, string> = {
  google: "Google",
  naver: "네이버",
  twitter: "X",
};

export type SocialLinksInitial = {
  linked: string[];
  available: string[];
  hasPassword: boolean;
  notice?: string;
};

/** 계정 설정: 소셜 로그인 연동/해제. */
export function SocialLinksCard({ initial }: { initial: SocialLinksInitial }) {
  const router = useRouter();
  const [linked, setLinked] = useState(initial.linked);
  const [msg, setMsg] = useState(initial.notice ?? "");
  const [pending, setPending] = useState<string | null>(null);

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
      <CardContent className="space-y-2 px-5 pb-5 sm:px-6">
        {providers.length === 0 ? (
          <p className="text-sm text-muted">연결 가능한 소셜이 없습니다.</p>
        ) : (
          providers.map((provider) => {
            const isLinked = linked.includes(provider);
            const label = LABELS[provider] ?? provider;
            return (
              <div
                key={provider}
                className="flex items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted">
                    {isLinked ? "연결됨" : "연결 안 됨"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending === provider}
                  onClick={() =>
                    void (isLinked ? unlink(provider) : link(provider))
                  }
                  className="h-9 shrink-0 rounded-xl bg-surface-2 px-3 text-sm font-medium text-foreground hover:bg-surface disabled:opacity-60"
                >
                  {isLinked ? "해제" : "연결"}
                </button>
              </div>
            );
          })
        )}
        {msg ? <p className="pt-1 text-xs text-muted">{msg}</p> : null}
      </CardContent>
    </Card>
  );
}
