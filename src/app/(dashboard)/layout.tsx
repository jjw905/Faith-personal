import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { isEmailVerified } from "@/lib/auth-store";
import { prisma } from "@/lib/prisma";

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
  const oauth =
    Boolean(session.user.provider) && session.user.provider !== "credentials";

  let verified =
    session.user.emailVerified ||
    (email ? await isEmailVerified(email) : false);

  // Google/Naver 등: 제공자 이메일이 있으면 인증 메일 없이 통과
  if (!verified && oauth && email && session.user.id) {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { emailVerified: new Date() },
    });
    verified = true;
  }

  if (!email || !verified) {
    redirect(email ? "/signup/verify" : "/signup/email");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
