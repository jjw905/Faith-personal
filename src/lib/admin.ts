import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!dbUser || dbUser.disabled || dbUser.role !== "ADMIN") {
    redirect("/dashboard");
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
      emailVerified: true,
      signupProvider: true,
      image: true,
      createdAt: true,
      accounts: { select: { provider: true } },
    },
  });
}

export async function countAdmins() {
  return prisma.user.count({ where: { role: "ADMIN", disabled: false } });
}
