import "server-only";

import { prisma } from "@/lib/prisma";
import {
  isPastDataRetention,
  TEAM_AUDIT_RETENTION_DAYS,
  TEAM_TRASH_RETENTION_DAYS_POLICY,
  TEAM_TRASH_RETENTION_SUPPORTED,
} from "@/lib/data-retention";

export {
  TEAM_AUDIT_RETENTION_DAYS,
  TEAM_TRASH_RETENTION_DAYS_POLICY,
  TEAM_TRASH_RETENTION_SUPPORTED,
};

/**
 * Soft-delete / trash for team meetings is not modeled in Prisma
 * (`deletedAt` / trash tables do not exist). Do not expose a 7-day trash
 * lifecycle until that storage exists. Meeting records use team policy
 * retentionDays (30/60/90) for policy configuration only today.
 */
export async function purgeExpiredTeamAuditLogs(params?: {
  teamId?: string;
  now?: Date;
}) {
  const now = params?.now ?? new Date();
  const cutoff = new Date(
    now.getTime() - TEAM_AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const result = await prisma.teamAuditLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      ...(params?.teamId ? { teamId: params.teamId } : {}),
    },
  });
  return {
    deleted: result.count,
    cutoff,
    retentionDays: TEAM_AUDIT_RETENTION_DAYS,
  };
}

export function isTeamAuditExpired(
  createdAtIso: string,
  now = new Date(),
) {
  return isPastDataRetention(createdAtIso, TEAM_AUDIT_RETENTION_DAYS, now);
}
