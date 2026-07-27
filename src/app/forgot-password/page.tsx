import type { Metadata } from "next";
import Link from "next/link";

import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Container } from "@/components/marketing/container";

export const metadata: Metadata = {
  title: "비밀번호 찾기 · Faith",
  description: "가입한 이메일로 Faith 비밀번호 재설정 안내를 받으세요.",
};

export default function ForgotPasswordPage() {
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
        <ForgotPasswordForm />
      </main>
    </AuthShell>
  );
}
