import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { configuredOAuthProviders } from "@/lib/oauth-providers";

export const metadata: Metadata = {
  title: "로그인, Faith",
  description: "Faith에 로그인해 AI 회의록과 회의 기록을 이어가세요.",
};

export default async function LoginPage() {
  const session = await auth();
  if (
    session?.user?.id &&
    !session.user.disabled &&
    (!session.user.mfaEnabled || session.user.mfaVerified)
  ) {
    redirect("/dashboard");
  }

  const availableProviders = configuredOAuthProviders().filter(
    (p): p is "google" | "twitter" => p === "google" || p === "twitter",
  );

  return (
    <AuthShell>
      <Suspense fallback={<p className="text-base text-muted">불러오는 중…</p>}>
        <LoginForm availableProviders={availableProviders} />
      </Suspense>
    </AuthShell>
  );
}
