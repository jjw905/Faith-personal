import { Plan, Role } from "@prisma/client";

import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

/** 로컬 개발용 플랫폼 관리자 (ADMIN_EMAILS 미설정 시 npm run db:admin) */
export const LOCAL_DEV_ADMIN_EMAIL = "faith-admin@faith.local";
export const LOCAL_DEV_ADMIN_PASSWORD = "faith-dev-local";

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

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Admin",
      role: Role.ADMIN,
      emailVerified: new Date(),
      passwordHash,
      signupProvider: "credentials",
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

function localDevAdminPassword() {
  return (
    process.env.ADMIN_SEED_PASSWORD?.trim() ||
    process.env.TEAM_SEED_PASSWORD?.trim() ||
    LOCAL_DEV_ADMIN_PASSWORD
  );
}

/** 비프로덕션에서 faith-admin@faith.local ADMIN 계정을 upsert. */
export async function ensureLocalDevAdmin() {
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false as const,
      message: "production에서는 대체 관리자를 만들지 않습니다.",
    };
  }

  const password = localDevAdminPassword();
  const passwordHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email: LOCAL_DEV_ADMIN_EMAIL },
    create: {
      email: LOCAL_DEV_ADMIN_EMAIL,
      name: "Faith Admin",
      handle: "faith-admin",
      inviteCode: "ADMTEST",
      role: Role.ADMIN,
      plan: Plan.PRO,
      emailVerified: new Date(),
      passwordHash,
      signupProvider: "credentials",
      disabled: false,
    },
    update: {
      name: "Faith Admin",
      handle: "faith-admin",
      role: Role.ADMIN,
      plan: Plan.PRO,
      emailVerified: new Date(),
      passwordHash,
      disabled: false,
    },
    select: { email: true, role: true },
  });

  return {
    ok: true as const,
    email: user.email,
    role: user.role,
    password,
  };
}
