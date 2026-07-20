import { Role } from "@prisma/client";

import { ensureAdminUser } from "@/lib/ensure-admin";
import { prisma } from "@/lib/prisma";

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * 어드민 신원 복구.
 * 1) ADMIN_EMAILS 계정을 ADMIN으로 보장(시드 upsert)
 * 2) ADMIN_EMAILS에 없는데 ADMIN인 행(오승격, 예: 네이버) → USER로 강등
 * 반환: 조치 요약 + 어드민 이메일 행의 연결 제공자 스냅샷.
 */
export async function repairAdminIdentity() {
  const emails = adminEmails();
  if (emails.length === 0) {
    return { ok: false as const, message: "ADMIN_EMAILS가 없습니다." };
  }

  const seed = await ensureAdminUser();

  // 정상 어드민 이메일이 아닌데 ADMIN인 행 강등
  const demoted = await prisma.user.updateMany({
    where: {
      role: Role.ADMIN,
      OR: [{ email: { notIn: emails } }, { email: null }],
    },
    data: { role: Role.USER },
  });

  // 어드민 이메일 행에 붙은 소셜 연결 해제 (소셜 계정의 어드민 도용 방지).
  // 이후 각 소셜은 본인 이메일로 재로그인 시 별도/정상 연결됨.
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
