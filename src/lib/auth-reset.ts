import { ensureAdminUser } from "@/lib/ensure-admin";
import { prisma } from "@/lib/prisma";
import { localDeleteObject } from "@/lib/storage/local-disk";
import {
  deleteObject,
  localVaultAllowed,
  objectStorageConfigured,
} from "@/lib/storage/object-store";

/**
 * 인증 관련 테이블 초기화 후 어드민만 다시 시드.
 * users 삭제 전 vault 객체를 먼저 정리하고, accounts·sessions·vault_files는
 * DB cascade/초기화로 함께 비운다.
 */
export async function resetAuthDatabase() {
  const before = await prisma.user.count();
  const vaultRows = await prisma.vaultFile.findMany({
    select: { key: true },
  });
  let vaultObjectCleanupFailures = 0;
  for (const row of vaultRows) {
    try {
      if (objectStorageConfigured()) {
        await deleteObject(row.key);
      } else if (localVaultAllowed()) {
        await localDeleteObject(row.key);
      } else {
        vaultObjectCleanupFailures += 1;
      }
    } catch {
      vaultObjectCleanupFailures += 1;
    }
  }
  if (vaultObjectCleanupFailures > 0) {
    throw new Error(
      `보관함 원본 ${vaultObjectCleanupFailures}개를 삭제하지 못해 인증 DB 초기화를 중단했습니다.`,
    );
  }

  await prisma.$transaction([
    prisma.verificationToken.deleteMany({}),
    prisma.session.deleteMany({}),
    prisma.account.deleteMany({}),
    prisma.vaultFile.deleteMany({}),
    // 운영 통계 이벤트는 의도적으로 user FK를 두지 않으므로 명시적으로 함께 비운다.
    prisma.aiUsageEvent.deleteMany({}),
    prisma.pipelineAttempt.deleteMany({}),
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
    deletedVaultObjects: vaultRows.length - vaultObjectCleanupFailures,
    vaultObjectCleanupFailures,
    seededAdmin: seed.email,
    users: after.map((u) => ({
      email: u.email,
      role: u.role,
      plan: u.plan,
      providers: u.accounts.map((a) => a.provider),
    })),
  };
}
