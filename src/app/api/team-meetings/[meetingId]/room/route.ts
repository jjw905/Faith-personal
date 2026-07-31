import { NextResponse } from "next/server";

import { closeLiveKitRoom, removeLiveKitParticipant } from "@/lib/livekit-admin";
import { prisma } from "@/lib/prisma";
import { effectiveHostId } from "@/lib/team/meeting-lifecycle";
import { writeTeamAudit } from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { meetingId } = await context.params;
  const meeting = await prisma.teamMeeting.findUnique({ where: { id: meetingId } });
  const membership = meeting
    ? await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId: meeting.teamId,
            userId: session.user.id,
          },
        },
        select: { id: true },
      })
    : null;
  if (
    !meeting ||
    !membership ||
    !meeting.livekitRoomName ||
    effectiveHostId(meeting) !== session.user.id
  ) {
    return NextResponse.json({ ok: false, message: "진행자 권한이 없습니다." }, { status: 403 });
  }
  if (meeting.organizerId !== session.user.id) {
    const access = await prisma.teamMeetingAccess.findUnique({
      where: {
        meetingId_userId: { meetingId, userId: session.user.id },
      },
      select: { acknowledgedAt: true },
    });
    if (!access?.acknowledgedAt) {
      return NextResponse.json(
        {
          ok: false,
          code: "MEETING_ACK_REQUIRED",
          message: "참석 확인 후 회의 진행 권한을 사용할 수 있습니다.",
        },
        { status: 409 },
      );
    }
  }
  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.userId || body.userId === session.user.id) {
    return NextResponse.json({ ok: false, message: "내보낼 참가자를 확인해 주세요." }, { status: 400 });
  }
  await prisma.teamMeetingAccess.updateMany({
    where: { meetingId, userId: body.userId },
    data: { isParticipant: false, acknowledgedAt: null },
  });
  await removeLiveKitParticipant(meeting.livekitRoomName, body.userId).catch(
    () => undefined,
  );
  await writeTeamAudit({
    teamId: meeting.teamId,
    actorId: session.user.id,
    targetUserId: body.userId,
    meetingId,
    action: "meeting.participant_removed",
    request,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { meetingId } = await context.params;
  const meeting = await prisma.teamMeeting.findUnique({ where: { id: meetingId } });
  const membership = meeting
    ? await prisma.teamMember.findUnique({
        where: {
          teamId_userId: {
            teamId: meeting.teamId,
            userId: session.user.id,
          },
        },
        select: { id: true },
      })
    : null;
  if (!meeting || !membership || effectiveHostId(meeting) !== session.user.id) {
    return NextResponse.json({ ok: false, message: "진행자만 회의를 종료할 수 있습니다." }, { status: 403 });
  }
  if (meeting.organizerId !== session.user.id) {
    const access = await prisma.teamMeetingAccess.findUnique({
      where: {
        meetingId_userId: { meetingId, userId: session.user.id },
      },
      select: { acknowledgedAt: true },
    });
    if (!access?.acknowledgedAt) {
      return NextResponse.json(
        {
          ok: false,
          code: "MEETING_ACK_REQUIRED",
          message: "참석 확인 후 회의를 종료할 수 있습니다.",
        },
        { status: 409 },
      );
    }
  }
  if (meeting.livekitRoomName) {
    await closeLiveKitRoom(meeting.livekitRoomName).catch(() => undefined);
  }
  let sttAccumulatedSeconds = meeting.sttAccumulatedSeconds;
  if (meeting.recordingActive && meeting.sttStartedAt) {
    sttAccumulatedSeconds += Math.max(
      0,
      Math.floor((Date.now() - meeting.sttStartedAt.getTime()) / 1000),
    );
  }
  await prisma.teamMeeting.update({
    where: { id: meetingId },
    data: {
      state: "ENDED",
      endedAt: new Date(),
      endReason: "COMPLETED",
      recordingActive: false,
      sttStartedAt: null,
      sttAccumulatedSeconds,
    },
  });
  await writeTeamAudit({
    teamId: meeting.teamId,
    actorId: session.user.id,
    meetingId,
    action: "meeting.ended",
    request,
  });
  return NextResponse.json({ ok: true });
}

