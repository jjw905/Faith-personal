import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { DashboardShell } from "@/components/layout/dashboard-shell";

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

  const email = (session.user.email || "").trim().toLowerCase();
  if (!email) {
    redirect("/signup/email");
  }

  return <DashboardShell>{children}</DashboardShell>;
}
