import { Role } from "@prisma/client";

import { ensureAdminUser } from "@/lib/ensure-admin";
import { platformAdminEmails } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";

/**
 * 어드민 신원 복구.
 * 1) ADMIN_EMAILS 계정을 ADMIN으로 보장(시드 upsert)
 * 2) ADMIN_EMAILS에 없는데 ADMIN인 행(오승격, 예: 네이버) → USER로 강등
 * 반환: 조치 요약 + 어드민 이메일 행의 연결 제공자 스냅샷.
 */
export async function repairAdminIdentity() {
  const emails = platformAdminEmails();
  if (emails.length === 0) {
    return { ok: false as const, message: "ADMIN_EMAILS가 없습니다." };
  }

  const seed = await ensureAdminUser();

  const demoted = await prisma.user.updateMany({
    where: {
      role: Role.ADMIN,
      OR: [{ email: { notIn: emails } }, { email: null }],
    },
    data: { role: Role.USER },
  });

  const adminRows = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: { id: true },
  });
  const detached = await prisma.account.deleteMany({
    where: { userId: { in: adminRows.map((r) => r.id) } },
  });

  const admins = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      email: true,
      role: true,
      accounts: { select: { provider: true } },
    },
  });

  return {
    ok: true as const,
    seededAdmin: seed.ok ? seed.email : null,
    demotedCount: demoted.count,
    detachedAccounts: detached.count,
    adminAccounts: admins.map((a) => ({
      email: a.email,
      role: a.role,
      providers: a.accounts.map((x) => x.provider),
    })),
  };
}
