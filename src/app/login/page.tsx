import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "로그인, Faith",
  description: "Faith 계정으로 로그인하고 AI 회의록을 이어가세요.",
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

  return (
    <AuthShell>
      <Suspense fallback={<p className="text-base text-muted">불러오는 중…</p>}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
