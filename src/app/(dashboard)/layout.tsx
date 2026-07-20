import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { ensureVerified, shouldAutoVerify } from "@/lib/account-verification";
import { isEmailVerified } from "@/lib/auth-store";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  if (session.user.disabled) {
    redirect("/login?error=Disabled");
  }

  // 신원 판단은 DB 기반 세션 이메일만 사용 (다른 흐름의 쿠키 오염 방지)
  const email = (session.user.email || "").trim().toLowerCase();

  let verified =
    session.user.emailVerified ||
    (email ? await isEmailVerified(email) : false);

  // Google/Naver 등: 제공자 이메일이 있으면 인증 메일 없이 통과
  if (!verified && session.user.id && shouldAutoVerify(session.user.provider, email)) {
    await ensureVerified(session.user.id, false);
    verified = true;
  }

  if (!email || !verified) {
    redirect(email ? "/signup/verify" : "/signup/email");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
