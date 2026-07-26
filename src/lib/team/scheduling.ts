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

export type ScheduleInput = {
  title: string;
  scheduledStartAt: Date;
  durationMinutes: number;
  organizerId: string;
  participantIds: string[];
  backupHostId?: string | null;
};

export function validateScheduleInput(body: {
  title?: string;
  scheduledStartAt?: string;
  durationMinutes?: number;
  organizerId?: string;
  participantIds?: string[];
  backupHostId?: string | null;
}): { ok: true; value: ScheduleInput } | { ok: false; message: string } {
  const title = body.title?.trim().slice(0, 100);
  const scheduledStartAt = body.scheduledStartAt
    ? new Date(body.scheduledStartAt)
    : null;
  const durationMinutes = Number(body.durationMinutes);
  const organizerId = body.organizerId?.trim();
  const participantIds = Array.from(
    new Set((body.participantIds ?? []).filter(Boolean)),
  );
  if (!title) return { ok: false, message: "회의 제목을 입력해 주세요." };
  if (!scheduledStartAt || Number.isNaN(scheduledStartAt.getTime())) {
    return { ok: false, message: "시작 시각을 확인해 주세요." };
  }
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 480
  ) {
    return { ok: false, message: "회의 시간은 5~480분입니다." };
  }
  if (!organizerId) return { ok: false, message: "주최자를 지정해 주세요." };
  if (!participantIds.includes(organizerId)) {
    participantIds.push(organizerId);
  }
  if (participantIds.length < 1) {
    return { ok: false, message: "초대 참가자가 필요합니다." };
  }
  if (body.backupHostId && !participantIds.includes(body.backupHostId)) {
    return { ok: false, message: "대리 주최자는 초대된 참가자여야 합니다." };
  }
  return {
    ok: true,
    value: {
      title,
      scheduledStartAt,
      durationMinutes,
      organizerId,
      participantIds,
      backupHostId: body.backupHostId ?? null,
    },
  };
}

export function meetingCardStatus(params: {
  state: string;
  canceledAt: Date | null;
  derivedPhase: string;
}) {
  if (params.state === "CANCELED" || params.canceledAt) return "취소됨";
  if (params.derivedPhase === "ended" || params.state === "ENDED") return "종료";
  if (params.derivedPhase === "in_progress" || params.state === "ACTIVE") {
    return "진행 중";
  }
  if (params.derivedPhase === "join_open") return "입장 가능";
  if (params.derivedPhase === "host_absence_warn") return "주최자 대기";
  if (params.derivedPhase === "host_absence_close") return "주최자 부재로 종료";
  return "예정";
}
