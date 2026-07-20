import { ensureAdminUser } from "@/lib/ensure-admin";
import { prisma } from "@/lib/prisma";

/**
 * 인증 관련 테이블 초기화 후 어드민만 다시 시드.
 * users 삭제 시 accounts, sessions, vault_files는 cascade.
 */
export async function resetAuthDatabase() {
  const before = await prisma.user.count();

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({}),
    prisma.session.deleteMany({}),
    prisma.account.deleteMany({}),
    prisma.vaultFile.deleteMany({}),
    prisma.user.deleteMany({}),
  ]);

  const seed = await ensureAdminUser();
  if (!seed.ok) {
    return {
      ok: false as const,
      message: seed.message,
      deletedUsers: before,
    };
  }

  const after = await prisma.user.findMany({
    select: {
      email: true,
      role: true,
      plan: true,
      accounts: { select: { provider: true } },
    },
  });

  return {
    ok: true as const,
    deletedUsers: before,
    seededAdmin: seed.email,
    users: after.map((u) => ({
      email: u.email,
      role: u.role,
      plan: u.plan,
      providers: u.accounts.map((a) => a.provider),
    })),
  };
}
