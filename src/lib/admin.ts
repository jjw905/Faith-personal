import { redirect } from "next/navigation";
import { Role } from "@prisma/client";

import { auth } from "@/auth";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true, email: true },
  });
  if (!dbUser || dbUser.disabled) {
    redirect("/dashboard");
  }

  if (dbUser.role !== Role.ADMIN) {
    // JWT에만 ADMIN이 남고 DB는 USER인 경우를 정리: 허용 이메일이면 승격, 아니면 차단
    if (isPlatformAdminEmail(dbUser.email)) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { role: Role.ADMIN },
      });
    } else {
      redirect("/dashboard");
    }
  }

  return session;
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      plan: true,
      disabled: true,
      signupProvider: true,
      image: true,
      createdAt: true,
      teamEntitlement: {
        select: { remainingTeamSlots: true, seatLimit: true },
      },
      accounts: { select: { provider: true } },
    },
  });
}

export async function countAdmins() {
  return prisma.user.count({ where: { role: "ADMIN", disabled: false } });
}
