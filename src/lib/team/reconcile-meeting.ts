import "server-only";

import { closeLiveKitRoom } from "@/lib/livekit-admin";
import { prisma } from "@/lib/prisma";
import {
  deriveMeetingState,
  effectiveHostId,
  resolveHostFallback,
} from "@/lib/team/meeting-lifecycle";
import {
  clearMissedMeetingNotification,
  ensureMissedMeetingNotification,
  notifyOwnerHostAbsence,
} from "@/lib/team/meeting-notifications";
import { writeTeamAudit } from "@/lib/team-permissions";

export async function reconcileTeamMeeting(meetingId: string, now = new Date()) {
  const meeting = await prisma.teamMeeting.findUnique({
    where: { id: meetingId },
    include: {
      team: { select: { id: true, name: true, ownerId: true } },
      access: true,
      organizer: { select: { id: true, disabled: true } },
    },
  });
  if (!meeting || meeting.mode !== "ONLINE") return null;

  const derived = deriveMeetingState(meeting, now);

  // 주최자 부재 종료는 "초대자가 이미 방에 들어온 뒤"에만 적용한다.
  // 바로 시작 로비에서 마이크만 맞추는 동안 10분 지나 오종료되는 것을 막는다.
  const guestWaitingInRoom = meeting.access.some(
    (row) =>
      row.isParticipant &&
      Boolean(row.joinedAt) &&
      row.userId !== meeting.organizerId,
  );

  if (
    derived.shouldCloseForHostAbsence &&
    meeting.state !== "ENDED" &&
    guestWaitingInRoom
  ) {
    if (meeting.livekitRoomName) {
      await closeLiveKitRoom(meeting.livekitRoomName).catch(() => undefined);
    }
    const updated = await prisma.teamMeeting.update({
      where: { id: meeting.id },
      data: {
        state: "ENDED",
        endedAt: now,
        endReason: "ORGANIZER_ABSENT",
        recordingActive: false,
        sttStartedAt: null,
      },
    });
    await writeTeamAudit({
      teamId: meeting.teamId,
      meetingId: meeting.id,
      action: "meeting.closed_organizer_absent",
      metadata: { label: "주최자 부재로 종료" },
    });
    return { meeting: updated, derived: deriveMeetingState(updated, now) };
  }

  // 예정 종료 시각이 지났는데 아무도 입장하지 않으면 취소로 정리한다.
  if (
    meeting.state === "SCHEDULED" &&
    !meeting.hostPresentAt &&
    derived.scheduledEndMs != null &&
    now.getTime() >= derived.scheduledEndMs &&
    !meeting.access.some((row) => Boolean(row.joinedAt))
  ) {
    const updated = await prisma.teamMeeting.update({
      where: { id: meeting.id },
      data: {
        state: "CANCELED",
        canceledAt: now,
        endedAt: now,
        endReason: "CANCELED",
      },
    });
    if (meeting.livekitRoomName) {
      await closeLiveKitRoom(meeting.livekitRoomName).catch(() => undefined);
    }
    await writeTeamAudit({
      teamId: meeting.teamId,
      meetingId: meeting.id,
      action: "meeting.canceled",
      metadata: { reason: "unstarted_past_end" },
    });
    return { meeting: updated, derived: deriveMeetingState(updated, now) };
  }

  if (derived.shouldWarnHostAbsence && guestWaitingInRoom) {
    await prisma.teamMeeting.update({
      where: { id: meeting.id },
      data: { absenceWarnedAt: now },
    });
    await notifyOwnerHostAbsence({
      ownerId: meeting.team.ownerId,
      teamId: meeting.teamId,
      teamName: meeting.team.name,
      meetingId: meeting.id,
      title: meeting.title,
    });
  }

  if (
    meeting.state === "SCHEDULED" &&
    derived.canJoin &&
    meeting.livekitRoomName
  ) {
    // Room is pre-created at schedule time; keep SCHEDULED until host arrives or start.
  }

  // 주최자가 아직 방에 입장하기 전에는 「불참」 알림을 보내지 않는다.
  if (derived.shouldEmitMissed && meeting.hostPresentAt) {
    await Promise.all(
      meeting.access
        .filter(
          (access) =>
            access.isParticipant &&
            !access.joinedAt &&
            access.userId !== meeting.organizerId,
        )
        .map((access) =>
          ensureMissedMeetingNotification({
            userId: access.userId,
            teamId: meeting.teamId,
            teamName: meeting.team.name,
            meetingId: meeting.id,
            title: meeting.title,
          }),
        ),
    );
  }

  return { meeting, derived };
}

export async function markParticipantJoined(params: {
  meetingId: string;
  userId: string;
  presentUserIds?: string[];
}) {
  const now = new Date();
  const meeting = await prisma.teamMeeting.findUnique({
    where: { id: params.meetingId },
    include: {
      organizer: { select: { id: true, disabled: true } },
      team: { select: { ownerId: true, name: true } },
      access: {
        where: { userId: params.userId },
        take: 1,
      },
    },
  });
  if (!meeting) return { ok: false as const, message: "회의를 찾을 수 없습니다." };
  const access = meeting.access[0];
  if (!access?.isParticipant && meeting.organizerId !== params.userId) {
    return { ok: false as const, message: "참가 권한이 없습니다." };
  }

  await prisma.teamMeetingAccess.updateMany({
    where: { meetingId: params.meetingId, userId: params.userId },
    data: { joinedAt: access?.joinedAt ?? now },
  });
  await clearMissedMeetingNotification({
    userId: params.userId,
    meetingId: params.meetingId,
  });

  const present = new Set(params.presentUserIds ?? [params.userId]);
  present.add(params.userId);

  const organizerLeft = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: { teamId: meeting.teamId, userId: meeting.organizerId },
    },
  });
  const fallback = resolveHostFallback({
    organizerId: meeting.organizerId,
    backupHostId: meeting.backupHostId,
    presentUserIds: present,
    organizerDisabledOrLeft:
      meeting.organizer.disabled || !organizerLeft,
  });

  const patch: {
    hostPresentAt?: Date;
    currentHostId?: string;
    state?: "ACTIVE";
    startedAt?: Date;
  } = {};

  const hostId = effectiveHostId(meeting);
  if (params.userId === hostId || (fallback.hostId && params.userId === fallback.hostId)) {
    patch.hostPresentAt = meeting.hostPresentAt ?? now;
    if (fallback.transferred && fallback.hostId) {
      patch.currentHostId = fallback.hostId;
    }
    if (meeting.state === "SCHEDULED") {
      patch.state = "ACTIVE";
      patch.startedAt = meeting.startedAt ?? now;
    }
  } else if (fallback.needsOwnerChoice && !meeting.hostPresentAt) {
    // 팀 대표에게 알림 후, 참가자는 음성만 유지할 수 있다.
  }

  if (Object.keys(patch).length > 0) {
    await prisma.teamMeeting.update({
      where: { id: meeting.id },
      data: patch,
    });
    if (fallback.transferred && fallback.hostId) {
      await writeTeamAudit({
        teamId: meeting.teamId,
        meetingId: meeting.id,
        actorId: params.userId,
        targetUserId: fallback.hostId,
        action: "meeting.host_transferred",
        metadata: { reason: "backup_present" },
      });
    }
  }

  return { ok: true as const };
}

export function isPreHostRecordingAllowed(meeting: {
  preHostRecordingOverride: boolean | null;
  hostPresentAt: Date | null;
  team: {
    policy: {
      preHostRecordingDefault: boolean;
      preHostRecordingLocked: boolean;
    } | null;
  };
}) {
  if (meeting.hostPresentAt) return true;
  if (meeting.preHostRecordingOverride != null) {
    return meeting.preHostRecordingOverride;
  }
  return Boolean(meeting.team.policy?.preHostRecordingDefault);
}
