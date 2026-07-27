import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupFlow } from "@/components/auth/signup-flow";
import { Container } from "@/components/marketing/container";

export const metadata: Metadata = {
  title: "회원가입 · Faith",
  description: "Faith 계정을 만들어 안전한 회의록 관리를 시작하세요.",
};

export default async function SignupPage() {
  const session = await auth();
  if (session?.user?.id && !session.user.disabled) {
    redirect("/dashboard");
  }

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

      <main className="flex flex-1 justify-center px-6 pb-12 pt-4 sm:pt-5">
        <div className="flex w-full max-w-md flex-col self-start">
          <SignupFlow />

          <p className="mt-6 text-center text-sm text-muted">
            이미 계정이 있으신가요?{" "}
            <Link
              href="/login"
              className="font-semibold text-foreground hover:underline"
            >
              로그인
            </Link>
          </p>
        </div>
      </main>
    </AuthShell>
  );
}
