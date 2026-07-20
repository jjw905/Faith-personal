import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";
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
  const verified =
    session.user.emailVerified ||
    (email ? await isEmailVerified(email) : false);
  if (!email || !verified) {
    redirect(email ? "/signup/verify" : "/signup/email");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
