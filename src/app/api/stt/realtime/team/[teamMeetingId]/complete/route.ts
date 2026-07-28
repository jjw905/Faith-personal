import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { completeRealtimeTeamRun } from "@/lib/stt/realtime/live-session-store";
import { effectiveHostId } from "@/lib/team/meeting-lifecycle";

type RouteContext = { params: Promise<{ teamMeetingId: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const userSession = await requireUser();
  if (!userSession) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
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
  if (effectiveHostId(meeting) !== userSession.user.id) {
    return NextResponse.json(
      { ok: false, message: "주최자만 팀 기록을 완료할 수 있습니다." },
      { status: 403 },
    );
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
