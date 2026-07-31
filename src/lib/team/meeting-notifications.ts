import "server-only";

import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications-store";
import {
  meetingAckGroupKey,
  meetingChangeGroupKey,
  meetingMissedGroupKey,
  NOTIFICATION_KINDS,
} from "@/lib/team/notification-kinds";

export async function notifyMeetingScheduled(params: {
  teamId: string;
  teamName: string;
  meetingId: string;
  title: string;
  scheduledStartAt: Date;
  inviteeIds: string[];
  organizerId: string;
  /** 바로 시작: 입장 링크로 안내 */
  startNow?: boolean;
}) {
  const startLabel = params.scheduledStartAt.toLocaleString("ko-KR");
  const href = params.startNow
    ? `/meetings/team/${params.meetingId}`
    : `/team?meeting=${params.meetingId}`;
  await Promise.all(
    params.inviteeIds
      .filter((userId) => userId !== params.organizerId)
      .map((userId) =>
        createNotification({
          userId,
          type: "meeting",
          kind: NOTIFICATION_KINDS.MEETING_ACK,
          title: params.startNow
            ? `${params.teamName}, 지금 참가`
            : `${params.teamName}, 미확인`,
          body: params.startNow
            ? `${params.title}`
            : `${params.title} (${startLabel})`,
          teamId: params.teamId,
          meetingId: params.meetingId,
          groupKey: meetingAckGroupKey(params.meetingId),
          visibleInWorkspace: true,
          data: {
            teamId: params.teamId,
            teamName: params.teamName,
            meetingId: params.meetingId,
            href,
            ack: true,
            label: params.startNow ? "참가" : "미확인",
            startNow: Boolean(params.startNow),
          },
        }),
      ),
  );
}

export async function acknowledgeMeetingInvite(params: {
  userId: string;
  meetingId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const access = await tx.teamMeetingAccess.findUnique({
      where: {
        meetingId_userId: {
          meetingId: params.meetingId,
          userId: params.userId,
        },
      },
    });
    if (!access || (!access.isParticipant && !access.canReadMasked)) {
      return {
        ok: false as const,
        message: "회의 접근 권한이 없습니다.",
      };
    }
    if (!access.acknowledgedAt) {
      await tx.teamMeetingAccess.update({
        where: { id: access.id },
        data: { acknowledgedAt: new Date() },
      });
    }
    await tx.notification.updateMany({
      where: {
        userId: params.userId,
        meetingId: params.meetingId,
        kind: NOTIFICATION_KINDS.MEETING_ACK,
        confirmedAt: null,
        dismissedAt: null,
      },
      data: {
        confirmedAt: new Date(),
        readAt: new Date(),
        dismissedAt: new Date(),
        visibleInWorkspace: false,
      },
    });
    return { ok: true as const };
  });
}

export async function notifyMeetingChanged(params: {
  teamId: string;
  teamName: string;
  meetingId: string;
  title: string;
  scheduledStartAt: Date;
  inviteeIds: string[];
  actorId: string;
}) {
  const startLabel = params.scheduledStartAt.toLocaleString("ko-KR");
  const groupKey = meetingChangeGroupKey(params.meetingId);
  await prisma.notification.updateMany({
    where: {
      meetingId: params.meetingId,
      kind: NOTIFICATION_KINDS.MEETING_CHANGED,
      confirmedAt: null,
      dismissedAt: null,
    },
    data: { dismissedAt: new Date(), groupKey: `${groupKey}:superseded` },
  });
  await Promise.all(
    params.inviteeIds
      .filter((userId) => userId !== params.actorId)
      .map((userId) =>
        createNotification({
          userId,
          type: "meeting",
          kind: NOTIFICATION_KINDS.MEETING_CHANGED,
          title: `${params.teamName} 일정 변경`,
          body: `${params.title} → ${startLabel}`,
          teamId: params.teamId,
          meetingId: params.meetingId,
          groupKey,
          visibleInWorkspace: false,
          data: {
            teamId: params.teamId,
            teamName: params.teamName,
            meetingId: params.meetingId,
            href: `/team`,
          },
        }),
      ),
  );
}

export async function notifyMeetingCanceled(params: {
  teamId: string;
  teamName: string;
  meetingId: string;
  title: string;
  inviteeIds: string[];
  actorId: string;
}) {
  await prisma.notification.updateMany({
    where: {
      meetingId: params.meetingId,
      kind: {
        in: [
          NOTIFICATION_KINDS.MEETING_ACK,
          NOTIFICATION_KINDS.MEETING_CHANGED,
          NOTIFICATION_KINDS.MEETING_MISSED,
        ],
      },
      dismissedAt: null,
    },
    data: {
      dismissedAt: new Date(),
      visibleInWorkspace: false,
    },
  });
  await Promise.all(
    params.inviteeIds
      .filter((userId) => userId !== params.actorId)
      .map((userId) =>
        createNotification({
          userId,
          type: "meeting",
          kind: NOTIFICATION_KINDS.MEETING_CANCELED,
          title: `${params.teamName} 회의 취소`,
          body: params.title,
          teamId: params.teamId,
          meetingId: params.meetingId,
          groupKey: `meeting-cancel:${params.meetingId}`,
          visibleInWorkspace: false,
          data: {
            teamId: params.teamId,
            teamName: params.teamName,
            meetingId: params.meetingId,
          },
        }),
      ),
  );
}

export async function ensureMissedMeetingNotification(params: {
  userId: string;
  teamId: string;
  teamName: string;
  meetingId: string;
  title: string;
}) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.userId,
      meetingId: params.meetingId,
      kind: NOTIFICATION_KINDS.MEETING_MISSED,
      dismissedAt: null,
    },
  });
  if (existing) return existing;
  return createNotification({
    userId: params.userId,
    type: "meeting",
    kind: NOTIFICATION_KINDS.MEETING_MISSED,
    title: `${params.teamName}`,
    body: "회의에 참가하지 않았습니다",
    teamId: params.teamId,
    meetingId: params.meetingId,
    groupKey: meetingMissedGroupKey(params.meetingId),
    visibleInWorkspace: false,
    data: {
      teamId: params.teamId,
      teamName: params.teamName,
      meetingId: params.meetingId,
      private: true,
    },
  });
}

export async function clearMissedMeetingNotification(params: {
  userId: string;
  meetingId: string;
}) {
  await prisma.notification.updateMany({
    where: {
      userId: params.userId,
      meetingId: params.meetingId,
      kind: NOTIFICATION_KINDS.MEETING_MISSED,
      dismissedAt: null,
    },
    data: {
      dismissedAt: new Date(),
      confirmedAt: new Date(),
      readAt: new Date(),
    },
  });
}

export async function notifyPrivateConflict(params: {
  userId: string;
  teamId: string;
  teamName: string;
  meetingId: string;
}) {
  return createNotification({
    userId: params.userId,
    type: "meeting",
    kind: NOTIFICATION_KINDS.MEETING_PRIVATE_CONFLICT,
    title: params.teamName,
    body: "다른 일정과 겹칩니다. 필요하면 주최자에게 직접 알려 주세요.",
    teamId: params.teamId,
    meetingId: params.meetingId,
    visibleInWorkspace: false,
    data: {
      teamId: params.teamId,
      teamName: params.teamName,
      meetingId: params.meetingId,
      private: true,
    },
  });
}

export async function notifyOwnerHostAbsence(params: {
  ownerId: string;
  teamId: string;
  teamName: string;
  meetingId: string;
  title: string;
}) {
  return createNotification({
    userId: params.ownerId,
    type: "meeting",
    kind: NOTIFICATION_KINDS.HOST_ABSENCE_OWNER,
    title: `${params.teamName} 주최자 부재`,
    body: `${params.title}: 초대된 참가자 중에서만 대체 주최자를 지정할 수 있습니다.`,
    teamId: params.teamId,
    meetingId: params.meetingId,
    visibleInWorkspace: false,
    data: {
      teamId: params.teamId,
      teamName: params.teamName,
      meetingId: params.meetingId,
      href: `/meetings/team/${params.meetingId}`,
    },
  });
}

export async function confirmNotification(params: {
  userId: string;
  notificationId: string;
}) {
  const row = await prisma.notification.findFirst({
    where: { id: params.notificationId, userId: params.userId },
  });
  if (!row) return { ok: false as const, message: "알림을 찾을 수 없습니다." };

  if (
    row.kind === NOTIFICATION_KINDS.MEETING_ACK &&
    row.meetingId
  ) {
    return acknowledgeMeetingInvite({
      userId: params.userId,
      meetingId: row.meetingId,
    });
  }

  await prisma.notification.update({
    where: { id: row.id },
    data: {
      confirmedAt: new Date(),
      readAt: new Date(),
      dismissedAt:
        row.kind === NOTIFICATION_KINDS.MEETING_MISSED
          ? new Date()
          : row.dismissedAt,
    },
  });
  return { ok: true as const };
}
