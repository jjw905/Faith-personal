import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { completeRealtimeTeamRun } from "@/lib/stt/realtime/live-session-store";
import { effectiveHostId } from "@/lib/team/meeting-lifecycle";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ teamMeetingId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session: userSession } = gate;
  const { teamMeetingId } = await context.params;
  const meeting = await prisma.teamMeeting.findUnique({
    where: { id: teamMeetingId },
  });
  if (!meeting || meeting.mode !== "ONLINE") {
    return NextResponse.json(
      { ok: false, message: "팀 회의를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  const membership = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: {
        teamId: meeting.teamId,
        userId: userSession.user.id,
      },
    },
    select: { id: true },
  });
  if (!membership) {
    return NextResponse.json(
      { ok: false, message: "팀 회의 접근 권한이 없습니다." },
      { status: 403 },
    );
  }
  if (effectiveHostId(meeting) !== userSession.user.id) {
    return NextResponse.json(
      { ok: false, message: "주최자만 팀 기록을 완료할 수 있습니다." },
      { status: 403 },
    );
  }
  if (meeting.organizerId !== userSession.user.id) {
    const access = await prisma.teamMeetingAccess.findUnique({
      where: {
        meetingId_userId: {
          meetingId: teamMeetingId,
          userId: userSession.user.id,
        },
      },
      select: { acknowledgedAt: true },
    });
    if (!access?.acknowledgedAt) {
      return NextResponse.json(
        {
          ok: false,
          code: "MEETING_ACK_REQUIRED",
          message: "참석 확인 후 팀 기록을 완료할 수 있습니다.",
        },
        { status: 409 },
      );
    }
  }
  if (meeting.recordingActive) {
    return NextResponse.json(
      { ok: false, message: "기록을 중지한 뒤 완료해 주세요." },
      { status: 409 },
    );
  }

  try {
    const result = await completeRealtimeTeamRun({
      teamMeetingId,
      ownerUserId: userSession.user.id,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "팀 기록을 완료하지 못했습니다.",
      },
      { status: 500 },
    );
  }
}
