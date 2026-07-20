import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AuthShell } from "@/components/auth/auth-shell";
import { ResendVerificationButton } from "@/components/auth/resend-verification-button";
import { auth } from "@/auth";
import { ensureVerified, shouldAutoVerify } from "@/lib/account-verification";
import { isEmailVerified } from "@/lib/auth-store";
import { isResendConfigured } from "@/lib/resend-mail";

export const metadata = {
  title: "이메일 인증 · Faith",
};

export default async function SignupVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; resent?: string }>;
}) {
  const params = await searchParams;
  const session = await auth();
  const jar = await cookies();
  const pending = jar.get("faith.pending-email")?.value;
  // 신원 판단은 세션(DB) 이메일만 사용. pending 쿠키는 미로그인 진입 판단에만 사용.
  const email = (session?.user?.email || "").trim().toLowerCase();

  // 소셜+이메일은 인증 메일 없이 즉시 통과
  if (session?.user?.id && shouldAutoVerify(session.user.provider, email)) {
    await ensureVerified(session.user.id, false);
    redirect("/dashboard");
  }

  if (email && (await isEmailVerified(email))) {
    redirect("/dashboard");
  }

  if (!session?.user && !pending) {
    redirect("/signup");
  }

  const verifiedOk = params.ok === "1";
  const resent = params.resent === "1";
  const error = params.error;
  const mailOn = isResendConfigured();

  return (
    <AuthShell>
      <div className="w-full max-w-md self-start">
        <div className="text-center">
          <h1 className="text-[26px] font-bold tracking-tight text-foreground sm:text-[28px]">
            이메일 인증
          </h1>
          <p className="mt-2 text-sm text-muted">
            {mailOn
              ? "이메일 가입 후 인증이 필요합니다"
              : "이메일 확인 후 시작할 수 있습니다"}
          </p>
        </div>

        <div className="mt-6 rounded-3xl bg-card px-[30px] py-7 shadow-soft ring-1 ring-border-strong">
          {verifiedOk ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-foreground">
                인증이 완료되었습니다. 대시보드로 이동해 주세요.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
              >
                시작하기
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm leading-relaxed text-muted">
                {email ? (
                  mailOn ? (
                    <>
                      <span className="font-medium text-foreground">{email}</span>
                      으로 인증 메일을 보냈습니다. 메일함의 링크를 눌러 주세요.
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-foreground">{email}</span>
                      계정 확인이 필요합니다. 아래 버튼으로 바로 시작할 수
                      있습니다.
                    </>
                  )
                ) : (
                  <>인증에 사용할 이메일이 없습니다. 이메일을 먼저 입력해 주세요.</>
                )}
              </p>

              {resent && (
                <p className="text-sm text-primary">인증 메일을 다시 보냈습니다.</p>
              )}
              {error === "invalid" && (
                <p className="text-sm text-red-600">
                  링크가 만료되었거나 올바르지 않습니다. 다시 요청해 주세요.
                </p>
              )}
              {error === "missing" && (
                <p className="text-sm text-red-600">인증 토큰이 없습니다.</p>
              )}

              <div className="flex flex-col gap-3">
                {email ? (
                  <ResendVerificationButton />
                ) : (
                  <Link
                    href="/signup/email"
                    className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-[15px] font-semibold text-primary-foreground"
                  >
                    이메일 입력하기
                  </Link>
                )}
                <Link
                  href="/signup"
                  className="text-center text-[13px] text-muted hover:text-foreground"
                >
                  돌아가기
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
