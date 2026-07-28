import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignupFlow } from "@/components/auth/signup-flow";

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
    <AuthShell contentAlign="raised">
      <div className="flex w-full flex-col">
        <SignupFlow />

        <p className="mt-6 text-center text-base text-muted whitespace-nowrap">
          이미 계정이 있으신가요?{" "}
          <Link
            href="/login"
            className="font-semibold text-foreground hover:underline"
          >
            로그인
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
