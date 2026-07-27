import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  AUTH_CARD,
  AuthBackLink,
  AuthShell,
} from "@/components/auth/auth-shell";
import { SignupEmailForm } from "@/components/auth/signup-email-form";

export const metadata = {
  title: "이메일 입력 · Faith",
};

export default async function SignupEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  if (!session?.user) {
    redirect("/signup");
  }
  if (session.user.email) {
    redirect("/dashboard");
  }

  return (
    <AuthShell contentAlign="raised">
      <div className="w-full">
        <AuthBackLink href="/signup" className="mb-4" />

        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            이메일 입력
          </h1>
          <p className="mt-2 text-base text-muted">
            계정에 사용할 이메일을 입력해 주세요
          </p>
        </div>

        <div className={`mt-5 ${AUTH_CARD} px-6 py-6 sm:px-[30px] sm:py-7`}>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            이메일
          </h2>
          <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
          <div className="mt-5">
            <SignupEmailForm initialError={params.error} />
          </div>
        </div>
      </div>
    </AuthShell>
  );
}
