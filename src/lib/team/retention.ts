import "server-only";

import { prisma } from "@/lib/prisma";
import {
  isPastDataRetention,
  TEAM_AUDIT_RETENTION_DAYS,
  TEAM_TRASH_RETENTION_DAYS_POLICY,
  TEAM_TRASH_RETENTION_SUPPORTED,
} from "@/lib/data-retention";
import {
  isTeamMeetingRetentionCandidate,
  normalizedTeamRetentionDays,
  TEAM_MEETING_RETENTION_STATES,
  teamMeetingRetentionDate,
} from "@/lib/team/retention-policy";
import type { TeamRetentionPreview } from "@/lib/team/retention-policy";
import {
  deleteUserMeeting,
  getUserMeeting,
} from "@/lib/user-meetings-store";

export {
  TEAM_AUDIT_RETENTION_DAYS,
  TEAM_TRASH_RETENTION_DAYS_POLICY,
  TEAM_TRASH_RETENTION_SUPPORTED,
};

export const TEAM_MEETING_PURGE_MAX_PER_RUN = 100;

export {
  isTeamMeetingRetentionCandidate,
  TEAM_MEETING_RETENTION_STATES,
} from "@/lib/team/retention-policy";
export type { TeamRetentionPreview } from "@/lib/team/retention-policy";

type RetentionTeam = {
  id: string;
  name: string;
  policy: { retentionDays: number } | null;
};

export type TeamRetentionPurgeResult = {
  dryRun: boolean;
  scannedTeams: number;
  candidateMeetings: number;
  deletedMeetings: number;
  deletedLegacyMeetings: number;
  deletedAuditLogs: number;
  failedTeams: Array<{ teamId: string; message: string }>;
  retention: TeamRetentionPreview[];
  ranAt: string;
};

/**
 * Soft-delete / trash for team meetings is not modeled in Prisma
 * (`deletedAt` / trash tables do not exist). The 7-day trash policy remains
 * disabled. Team meeting records are hard-deleted only after their configured
 * retention period and only after they reach a terminal state.
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

async function listRetentionTeams(teamId?: string): Promise<RetentionTeam[]> {
  return prisma.team.findMany({
    where: teamId ? { id: teamId } : undefined,
    select: {
      id: true,
      name: true,
      policy: { select: { retentionDays: true } },
    },
    orderBy: { id: "asc" },
  });
}

async function previewTeamRetention(
  teams: RetentionTeam[],
  now: Date,
): Promise<TeamRetentionPreview[]> {
  if (teams.length === 0) return [];
  const meetings = await prisma.teamMeeting.findMany({
    where: {
      teamId: { in: teams.map((team) => team.id) },
      state: { in: [...TEAM_MEETING_RETENTION_STATES] },
      recordingActive: false,
    },
    select: {
      teamId: true,
      state: true,
      recordingActive: true,
      createdAt: true,
      endedAt: true,
    },
  });
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  return teams.map((team) => {
    const retentionDays = normalizedTeamRetentionDays(
      team.policy?.retentionDays,
    );
    const expired = meetings
      .filter(
        (meeting) =>
          meeting.teamId === team.id &&
          isTeamMeetingRetentionCandidate(meeting, retentionDays, now),
      )
      .sort(
        (a, b) =>
          new Date(teamMeetingRetentionDate(a)).getTime() -
          new Date(teamMeetingRetentionDate(b)).getTime(),
      );
    return {
      teamId: team.id,
      teamName: teamsById.get(team.id)?.name ?? "팀",
      retentionDays,
      expiredMeetings: expired.length,
      oldestExpiredAt: expired[0]
        ? new Date(teamMeetingRetentionDate(expired[0])).toISOString()
        : null,
    };
  });
}

export async function getTeamRetentionPreview(params?: {
  teamId?: string;
  now?: Date;
}) {
  const now = params?.now ?? new Date();
  const teams = await listRetentionTeams(params?.teamId);
  return previewTeamRetention(teams, now);
}

/**
 * 운영 스케줄러와 관리자 수동 실행이 공유하는 팀 기록 보존 작업.
 * 삭제 직전에 상태와 cutoff를 다시 조건으로 확인해, 실행 중 종료된 회의가
 * 다음 실행까지 남도록 한다. 원본 보관함 파일은 개인 보관함의 별도 수명주기라
 * legacyMeetingId가 가리키는 회의 JSON과 작업 폴더만 정리한다.
 */
export async function purgeExpiredTeamMeetings(params?: {
  teamId?: string;
  now?: Date;
  dryRun?: boolean;
  maxMeetings?: number;
}): Promise<TeamRetentionPurgeResult> {
  const now = params?.now ?? new Date();
  const dryRun = params?.dryRun === true;
  const requestedMaxMeetings =
    typeof params?.maxMeetings === "number" &&
    Number.isFinite(params.maxMeetings)
      ? params.maxMeetings
      : TEAM_MEETING_PURGE_MAX_PER_RUN;
  const maxMeetings = Math.max(
    1,
    Math.min(
      TEAM_MEETING_PURGE_MAX_PER_RUN,
      Math.floor(requestedMaxMeetings),
    ),
  );
  const teams = await listRetentionTeams(params?.teamId);
  const retention = await previewTeamRetention(teams, now);
  const candidateMeetings = retention.reduce(
    (sum, row) => sum + row.expiredMeetings,
    0,
  );
  if (dryRun || candidateMeetings === 0) {
    return {
      dryRun,
      scannedTeams: teams.length,
      candidateMeetings,
      deletedMeetings: 0,
      deletedLegacyMeetings: 0,
      deletedAuditLogs: 0,
      failedTeams: [],
      retention,
      ranAt: now.toISOString(),
    };
  }

  let remaining = maxMeetings;
  let deletedMeetings = 0;
  let deletedLegacyMeetings = 0;
  const failedTeams: Array<{ teamId: string; message: string }> = [];

  for (const team of teams) {
    if (remaining <= 0) break;
    const retentionDays = normalizedTeamRetentionDays(
      team.policy?.retentionDays,
    );
    const cutoff = new Date(
      now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );
    try {
      const candidates = await prisma.teamMeeting.findMany({
        where: {
          teamId: team.id,
          state: { in: [...TEAM_MEETING_RETENTION_STATES] },
          recordingActive: false,
          OR: [
            { endedAt: { lt: cutoff } },
            { endedAt: null, createdAt: { lt: cutoff } },
          ],
        },
        select: {
          id: true,
          legacyMeetingId: true,
        },
        orderBy: [{ endedAt: "asc" }, { createdAt: "asc" }],
        take: remaining,
      });
      let deletedForTeam = 0;
      let legacyDeletedForTeam = 0;
      for (const candidate of candidates) {
        const deleted = await prisma.$transaction(async (tx) => {
          const result = await tx.teamMeeting.deleteMany({
            where: {
              id: candidate.id,
              teamId: team.id,
              state: { in: [...TEAM_MEETING_RETENTION_STATES] },
              recordingActive: false,
              OR: [
                { endedAt: { lt: cutoff } },
                { endedAt: null, createdAt: { lt: cutoff } },
              ],
            },
          });
          if (result.count === 0) return false;
          await tx.notification.deleteMany({
            where: { meetingId: candidate.id },
          });
          return true;
        });
        if (!deleted) continue;
        deletedForTeam += 1;
        remaining -= 1;
        if (candidate.legacyMeetingId) {
          const legacyRecord = getUserMeeting(candidate.legacyMeetingId);
          if (
            legacyRecord?.workspace === "team" &&
            deleteUserMeeting(candidate.legacyMeetingId)
          ) {
            legacyDeletedForTeam += 1;
            deletedLegacyMeetings += 1;
          }
        }
        deletedMeetings += 1;
      }
      if (deletedForTeam > 0) {
        try {
          await prisma.teamAuditLog.create({
            data: {
              teamId: team.id,
              action: "meeting.retention_purged",
              metadata: {
                deletedMeetings: deletedForTeam,
                deletedLegacyMeetings: legacyDeletedForTeam,
                retentionDays,
                cutoff: cutoff.toISOString(),
              },
            },
          });
        } catch {
          failedTeams.push({
            teamId: team.id,
            message: "기록 삭제 후 감사 로그를 남기지 못했습니다.",
          });
        }
      }
    } catch {
      failedTeams.push({
        teamId: team.id,
        message: "팀 보존 작업을 처리하지 못했습니다.",
      });
    }
  }

  return {
    dryRun,
    scannedTeams: teams.length,
    candidateMeetings,
    deletedMeetings,
    deletedLegacyMeetings,
    deletedAuditLogs: 0,
    failedTeams,
    retention,
    ranAt: now.toISOString(),
  };
}

export function isTeamAuditExpired(
  createdAtIso: string,
  now = new Date(),
) {
  return isPastDataRetention(createdAtIso, TEAM_AUDIT_RETENTION_DAYS, now);
}
