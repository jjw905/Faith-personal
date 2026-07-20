import { cookies } from "next/headers";
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

  const jar = await cookies();
  const pending = jar.get("faith.pending-email")?.value;
  const email = (session.user.email || pending || "").trim().toLowerCase();

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
