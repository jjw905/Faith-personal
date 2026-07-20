import { Role } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/prisma";

/** ADMIN_EMAILS 첫 이메일 + ADMIN_SEED_PASSWORD로 슈퍼계정 upsert. */
export async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)[0];
  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!email || !password) {
    return {
      ok: false as const,
      message: "ADMIN_EMAILS 또는 ADMIN_SEED_PASSWORD가 없습니다.",
    };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Admin",
      role: Role.ADMIN,
      emailVerified: new Date(),
      passwordHash,
      disabled: false,
    },
    update: {
      role: Role.ADMIN,
      emailVerified: new Date(),
      passwordHash,
      disabled: false,
    },
    select: { id: true, email: true, role: true },
  });

  return { ok: true as const, email: user.email, role: user.role };
}
