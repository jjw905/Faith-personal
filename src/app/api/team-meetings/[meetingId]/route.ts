import { NextResponse } from "next/server";

import { TEAM_FEATURE_ADMIN_ONLY } from "@/lib/feature-flags";
import { closeLiveKitRoom } from "@/lib/livekit-admin";
import { prisma } from "@/lib/prisma";
import {
  isLiveTeamSttRuntimeAvailable,
  liveTeamSttUnavailableMessage,
} from "@/lib/team/live-stt";
import { deriveMeetingState } from "@/lib/team/meeting-lifecycle";
import {
  notifyMeetingCanceled,
  notifyMeetingChanged,
  notifyMeetingScheduled,
  notifyPrivateConflict,
} from "@/lib/team/meeting-notifications";
import { reconcileTeamMeeting } from "@/lib/team/reconcile-meeting";
import {
  accessibleMeetingIdsForUser,
  findParticipantConflicts,
  guardScheduleConflicts,
  validateScheduleInput,
} from "@/lib/team/scheduling";
import {
  getTeamMember,
  hasTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function GET(_: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { meetingId } = await context.params;
  const meeting = await prisma.teamMeeting.findUnique({
    where: { id: meetingId },
    include: {
      team: { include: { policy: true } },
      organizer: { select: { id: true, name: true, handle: true, image: true } },
      backupHost: { select: { id: true, name: true, handle: true } },
      currentHost: { select: { id: true, name: true, handle: true } },
      access: {
        include: {
          user: { select: { id: true, name: true, handle: true, image: true } },
        },
      },
    },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, message: "회의를 찾을 수 없습니다." }, { status: 404 });
  }
  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: { teamId: meeting.teamId, userId: session.user.id },
    },
  });
  const access = meeting.access.find((row) => row.userId === session.user.id);
  const allowed =
    membership &&
    (meeting.organizerId === session.user.id ||
      access?.isParticipant ||
      access?.canReadMasked ||
      membership.role === "OWNER" ||
      hasTeamCapability(membership, "manageRecordAccess"));
  if (!allowed) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  const canViewWithoutAcknowledgement =
    meeting.organizerId === session.user.id ||
    membership.role === "OWNER" ||
    hasTeamCapability(membership, "manageRecordAccess");
  if (
    !canViewWithoutAcknowledgement &&
    access &&
    (access.isParticipant || access.canReadMasked) &&
    !access.acknowledgedAt
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "MEETING_ACK_REQUIRED",
        message: "참석 확인 후 회의 정보를 확인할 수 있습니다.",
      },
      { status: 409 },
    );
  }
  const reconciled = await reconcileTeamMeeting(meetingId);
  const currentMeeting = reconciled?.meeting
    ? { ...meeting, ...reconciled.meeting }
    : meeting;
  const derived = deriveMeetingState(currentMeeting);
  return NextResponse.json({
    ok: true,
    meeting: currentMeeting,
    derived,
    liveStt: {
      available: isLiveTeamSttRuntimeAvailable(),
      unavailableMessage: liveTeamSttUnavailableMessage(),
    },
    serverNow: new Date().toISOString(),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { meetingId } = await context.params;
  const meeting = await prisma.teamMeeting.findUnique({
    where: { id: meetingId },
    include: { access: true, team: true },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, message: "회의를 찾을 수 없습니다." }, { status: 404 });
  }
  const actor = await getTeamMember(meeting.teamId, session.user.id);
  if (
    !actor ||
    (meeting.organizerId !== session.user.id &&
      !hasTeamCapability(actor, "manageTeam"))
  ) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }

  const derived = deriveMeetingState(meeting);
  let body: {
    title?: string;
    scheduledStartAt?: string;
    durationMinutes?: number;
    participantIds?: string[];
    backupHostId?: string | null;
    action?: "cancel" | "transfer_host";
    newHostId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }

  if (body.action === "cancel") {
    if (!derived.canChangeSchedule && meeting.state === "ACTIVE") {
      // Allow cancel only before start; once started use room end.
      return NextResponse.json(
        { ok: false, message: "시작된 회의는 일정 취소 대신 종료를 사용하세요." },
        { status: 409 },
      );
    }
    const updated = await prisma.teamMeeting.update({
      where: { id: meetingId },
      data: {
        state: "CANCELED",
        canceledAt: new Date(),
        endReason: "CANCELED",
        endedAt: new Date(),
      },
    });
    if (meeting.livekitRoomName) {
      await closeLiveKitRoom(meeting.livekitRoomName).catch(() => undefined);
    }
    const inviteeIds = meeting.access
      .filter((row) => row.isParticipant)
      .map((row) => row.userId);
    await notifyMeetingCanceled({
      teamId: meeting.teamId,
      teamName: meeting.team.name,
      meetingId,
      title: meeting.title,
      inviteeIds,
      actorId: session.user.id,
    });
    await writeTeamAudit({
      teamId: meeting.teamId,
      actorId: session.user.id,
      meetingId,
      action: "meeting.canceled",
      request,
    });
    return NextResponse.json({ ok: true, meeting: updated });
  }

  if (body.action === "transfer_host") {
    // Team representative-only administrative transfer among invited participants.
    if (meeting.team.ownerId !== session.user.id) {
      return NextResponse.json({ ok: false, message: "대체 주최자는 팀 대표만 지정할 수 있습니다." }, { status: 403 });
    }
    const newHostId = body.newHostId?.trim();
    const invited = meeting.access.some(
      (row) => row.userId === newHostId && row.isParticipant,
    );
    if (!newHostId || !invited) {
      return NextResponse.json(
        { ok: false, message: "초대된 참가자 중에서만 지정할 수 있습니다." },
        { status: 400 },
      );
    }
    const updated = await prisma.teamMeeting.update({
      where: { id: meetingId },
      data: { currentHostId: newHostId, hostPresentAt: new Date() },
    });
    await writeTeamAudit({
      teamId: meeting.teamId,
      actorId: session.user.id,
      targetUserId: newHostId,
      meetingId,
      action: "meeting.host_transferred",
      metadata: { reason: "owner_choice", grantsRecordAccess: false },
      request,
    });
    return NextResponse.json({ ok: true, meeting: updated });
  }

  if (!derived.canChangeSchedule) {
    return NextResponse.json(
      { ok: false, message: "시작된 회의의 일정은 변경할 수 없습니다." },
      { status: 409 },
    );
  }

  const schedule = validateScheduleInput({
    title: body.title ?? meeting.title,
    scheduledStartAt:
      body.scheduledStartAt ??
      meeting.scheduledStartAt?.toISOString(),
    durationMinutes: body.durationMinutes ?? meeting.durationMinutes ?? undefined,
    organizerId: meeting.organizerId,
    participantIds:
      body.participantIds ??
      meeting.access.filter((row) => row.isParticipant).map((row) => row.userId),
    backupHostId:
      body.backupHostId === undefined ? meeting.backupHostId : body.backupHostId,
  });
  if (!schedule.ok) {
    return NextResponse.json({ ok: false, message: schedule.message }, { status: 400 });
  }
  if (!derived.canReplaceParticipants && body.participantIds) {
    return NextResponse.json(
      { ok: false, message: "시작된 회의의 참가자 목록은 교체할 수 없습니다." },
      { status: 409 },
    );
  }

  let nextParticipantIds = schedule.value.participantIds;
  if (body.participantIds) {
    const validMembers = await prisma.teamMember.findMany({
      where: {
        teamId: meeting.teamId,
        userId: { in: schedule.value.participantIds },
        user: {
          disabled: false,
          ...(TEAM_FEATURE_ADMIN_ONLY ? { role: "ADMIN" } : {}),
        },
      },
      select: { userId: true },
    });
    nextParticipantIds = Array.from(
      new Set([
        meeting.organizerId,
        ...validMembers
          .map((row) => row.userId)
          .filter((id) => id !== meeting.organizerId),
      ]),
    );
    if (
      nextParticipantIds.filter((id) => id !== meeting.organizerId).length < 1
    ) {
      return NextResponse.json(
        { ok: false, message: "함께할 팀원을 초대해 주세요." },
        { status: 400 },
      );
    }
  }

  const nextBackupHostId =
    schedule.value.backupHostId &&
    nextParticipantIds.includes(schedule.value.backupHostId)
      ? schedule.value.backupHostId
      : null;

  const previousInvitees = new Set(
    meeting.access
      .filter((row) => row.isParticipant)
      .map((row) => row.userId),
  );
  const newlyAdded = nextParticipantIds.filter(
    (id) => id !== meeting.organizerId && !previousInvitees.has(id),
  );

  const accessible = await accessibleMeetingIdsForUser(session.user.id);
  type ConflictVisible = Awaited<
    ReturnType<typeof findParticipantConflicts>
  >["visible"];
  let conflictVisible: ConflictVisible | null = null;
  let privateNotices: Array<{ userId: string; meetingId: string }> = [];

  const updated = await prisma
    .$transaction(async (tx) => {
      const conflicts = await guardScheduleConflicts(tx, {
        participantIds: nextParticipantIds,
        startMs: schedule.value.scheduledStartAt.getTime(),
        durationMinutes: schedule.value.durationMinutes,
        excludeMeetingId: meetingId,
        accessibleMeetingIds: accessible,
      });
      if (conflicts.blocked) {
        conflictVisible = conflicts.visible;
        throw new Error("SCHEDULE_CONFLICT");
      }
      privateNotices = conflicts.privateNotices;
      if (body.participantIds) {
        const keep = new Set(nextParticipantIds);
        await tx.teamMeetingAccess.updateMany({
          where: { meetingId, userId: { notIn: Array.from(keep) } },
          data: { isParticipant: false, acknowledgedAt: null },
        });
        for (const userId of keep) {
          const previousAccess = meeting.access.find(
            (row) => row.userId === userId,
          );
          await tx.teamMeetingAccess.upsert({
            where: { meetingId_userId: { meetingId, userId } },
            create: {
              meetingId,
              userId,
              isParticipant: true,
              canReadMasked: true,
              grantedById: session.user.id,
            },
            update: {
              isParticipant: true,
              ...(previousAccess?.isParticipant
                ? {}
                : { acknowledgedAt: null }),
            },
          });
        }
      }
      return tx.teamMeeting.update({
        where: { id: meetingId },
        data: {
          title: schedule.value.title,
          scheduledStartAt: schedule.value.scheduledStartAt,
          durationMinutes: schedule.value.durationMinutes,
          backupHostId: nextBackupHostId,
        },
      });
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message === "SCHEDULE_CONFLICT") {
        return null;
      }
      throw error;
    });

  if (!updated) {
    return NextResponse.json(
      {
        ok: false,
        message: "일정이 겹칩니다.",
        conflicts: conflictVisible ?? [],
      },
      { status: 409 },
    );
  }

  if (newlyAdded.length > 0) {
    await notifyMeetingScheduled({
      teamId: meeting.teamId,
      teamName: meeting.team.name,
      meetingId,
      title: updated.title,
      scheduledStartAt: schedule.value.scheduledStartAt,
      inviteeIds: newlyAdded,
      organizerId: meeting.organizerId,
      startNow: derived.canJoin,
    });
  }

  const scheduleMetaChanged =
    body.title != null ||
    body.scheduledStartAt != null ||
    body.durationMinutes != null ||
    body.backupHostId !== undefined;
  if (scheduleMetaChanged) {
    await notifyMeetingChanged({
      teamId: meeting.teamId,
      teamName: meeting.team.name,
      meetingId,
      title: updated.title,
      scheduledStartAt: schedule.value.scheduledStartAt,
      inviteeIds: nextParticipantIds.filter((id) => !newlyAdded.includes(id)),
      actorId: session.user.id,
    });
  }
  await Promise.all(
    privateNotices.map((notice) =>
      notifyPrivateConflict({
        userId: notice.userId,
        teamId: meeting.teamId,
        teamName: meeting.team.name,
        meetingId,
      }),
    ),
  );
  await writeTeamAudit({
    teamId: meeting.teamId,
    actorId: session.user.id,
    meetingId,
    action: "meeting.rescheduled",
    metadata: {
      scheduledStartAt: schedule.value.scheduledStartAt.toISOString(),
      durationMinutes: schedule.value.durationMinutes,
    },
    request,
  });
  return NextResponse.json({ ok: true, meeting: updated, serverNow: new Date().toISOString() });
}
