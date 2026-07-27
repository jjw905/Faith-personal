import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Container } from "@/components/marketing/container";

export const metadata: Metadata = {
  title: "비밀번호 재설정 · Faith",
  description: "새 비밀번호를 설정합니다.",
};

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <header className="shrink-0 border-b border-border-strong/50 bg-[#e6e8ed]">
        <Container className="flex h-16 items-center">
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
          <ResetPasswordForm />
        </Suspense>
      </main>
    </AuthShell>
  );
}
