import Link from "next/link";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { auth } from "@/auth";
import { submitSignupEmail } from "@/lib/auth-actions";

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
    redirect("/signup/verify");
  }

  return (
    <AuthShell>
      <div className="w-full max-w-md self-start">
        <div className="text-center">
          <h1 className="text-[26px] font-bold tracking-tight text-foreground sm:text-[28px]">
            이메일 입력
          </h1>
          <p className="mt-2 text-sm text-muted">
            X 등 이메일을 주지 않는 계정은 직접 입력 후 인증합니다
          </p>
        </div>

        <div className="mt-6 rounded-3xl bg-card px-[30px] py-7 shadow-soft ring-1 ring-border-strong">
          <form action={submitSignupEmail} className="space-y-5">
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-[13px] font-medium text-foreground"
              >
                이메일
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@example.com"
                className="flex h-11 w-full rounded-xl border border-border-strong bg-white px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
              />
              {params.error === "invalid" && (
                <p className="mt-1.5 text-[12px] text-red-600">
                  올바른 이메일을 입력해 주세요.
                </p>
              )}
              {params.error === "taken" && (
                <p className="mt-1.5 text-[12px] text-red-600">
                  이미 사용 중인 이메일입니다.
                </p>
              )}
            </div>
            <button
              type="submit"
              className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
            >
              인증 메일 받기
            </button>
          </form>
          <Link
            href="/signup"
            className="mt-4 block text-center text-[13px] text-muted hover:text-foreground"
          >
            돌아가기
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
