import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  classifyScheduleConflicts,
  scheduledEndMs,
  type ConflictMeeting,
} from "@/lib/team/schedule-conflicts";
import {
  assertOnlineOnly,
  hashScheduleLockToken,
  participantScheduleLockPairs,
  SCHEDULE_LOCK_NAMESPACE,
} from "@/lib/team/schedule-locks";

export {
  assertOnlineOnly,
  hashScheduleLockToken,
  participantScheduleLockPairs,
  SCHEDULE_LOCK_NAMESPACE,
};

export {
  clampParticipantsToSeatLimit,
  meetingCardStatus,
  validateScheduleInput,
  type ScheduleInput,
} from "@/lib/team/schedule-input";

const ACTIVE_SCHEDULE_STATES = ["SCHEDULED", "ACTIVE"] as const;

export type Tx = Prisma.TransactionClient;

export async function acquireParticipantScheduleLocks(
  tx: Tx,
  userIds: string[],
) {
  // Prisma binds JS numbers as bigint; two-arg advisory locks require int4.
  for (const [key1, key2] of participantScheduleLockPairs(userIds)) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${key1}::integer, ${key2}::integer)`;
  }
}

export async function findParticipantConflicts(
  params: {
    participantIds: string[];
    startMs: number;
    durationMinutes: number;
    excludeMeetingId?: string;
    accessibleMeetingIds: Set<string>;
  },
  db: Tx | typeof prisma = prisma,
) {
  const endMs = scheduledEndMs(params.startMs, params.durationMinutes);
  const rows = await db.teamMeetingAccess.findMany({
    where: {
      userId: { in: params.participantIds },
      isParticipant: true,
      meeting: {
        state: { in: [...ACTIVE_SCHEDULE_STATES] },
        canceledAt: null,
        scheduledStartAt: { not: null },
        durationMinutes: { not: null },
        ...(params.excludeMeetingId
          ? { id: { not: params.excludeMeetingId } }
          : {}),
      },
    },
    include: {
      meeting: {
        include: { team: { select: { id: true, name: true } } },
      },
    },
  });

  const byUserMap = new Map<string, ConflictMeeting[]>();
  for (const row of rows) {
    const meeting = row.meeting;
    if (!meeting.scheduledStartAt || !meeting.durationMinutes) continue;
    const start = meeting.scheduledStartAt.getTime();
    const end = scheduledEndMs(start, meeting.durationMinutes);
    const item: ConflictMeeting = {
      id: meeting.id,
      teamId: meeting.teamId,
      teamName: meeting.team.name,
      title: meeting.title,
      startMs: start,
      endMs: end,
      accessible: params.accessibleMeetingIds.has(meeting.id),
    };
    const list = byUserMap.get(row.userId) ?? [];
    list.push(item);
    byUserMap.set(row.userId, list);
  }

  return classifyScheduleConflicts({
    proposed: { startMs: params.startMs, endMs },
    byUser: Array.from(byUserMap.entries()).map(([userId, meetings]) => ({
      userId,
      meetings,
    })),
  });
}

/**
 * Lock participants, then re-read conflicts under the same transaction.
 * Callers must create/update the meeting inside the same transaction.
 */
export async function guardScheduleConflicts(
  tx: Tx,
  params: {
    participantIds: string[];
    startMs: number;
    durationMinutes: number;
    excludeMeetingId?: string;
    accessibleMeetingIds: Set<string>;
  },
) {
  await acquireParticipantScheduleLocks(tx, params.participantIds);
  return findParticipantConflicts(params, tx);
}

export async function accessibleMeetingIdsForUser(userId: string) {
  const rows = await prisma.teamMeeting.findMany({
    where: {
      OR: [
        { organizerId: userId },
        { createdById: userId },
        {
          access: {
            some: {
              userId,
              OR: [{ isParticipant: true }, { canReadMasked: true }],
            },
          },
        },
        { team: { ownerId: userId } },
      ],
    },
    select: { id: true },
  });
  return new Set(rows.map((row) => row.id));
}
