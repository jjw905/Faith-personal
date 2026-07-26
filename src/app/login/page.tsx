import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { Container } from "@/components/marketing/container";

export const metadata: Metadata = {
  title: "로그인 · Faith",
  description: "Faith 계정으로 로그인하고 안전한 회의록 관리를 이어가세요.",
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id && !session.user.disabled) {
    redirect("/dashboard");
  }

  return (
    <AuthShell>
      <header className="shrink-0 border-b border-border-strong/50 bg-[#e6e8ed]">
        <Container className="flex h-16 items-center sm:h-[4.5rem]">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-foreground"
          >
            Faith
          </Link>
        </Container>
      </header>

      <main className="flex flex-1 justify-center px-6 pb-6 pt-0 sm:pt-1">
        <Suspense fallback={<p className="text-sm text-muted">불러오는 중…</p>}>
          <LoginForm />
        </Suspense>
      </main>
    </AuthShell>
  );
}
