import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { SignupEmailForm } from "@/components/auth/signup-email-form";
import { auth } from "@/auth";

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
    <AuthShell>
      <div className="w-full max-w-md self-start">
        <div className="text-center">
          <h1 className="text-[26px] font-bold tracking-tight text-foreground sm:text-[28px]">
            이메일 입력
          </h1>
          <p className="mt-2 text-sm text-muted">
            계정에 사용할 이메일을 입력해 주세요
          </p>
        </div>

        <div className="mt-6 rounded-3xl bg-card px-[30px] py-7 shadow-soft ring-1 ring-border-strong">
          <SignupEmailForm initialError={params.error} />
        </div>
      </div>
    </AuthShell>
  );
}
