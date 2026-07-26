import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import {
  requireTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  const { teamId } = await context.params;
  const actor = await requireTeamCapability(
    teamId,
    session.user.id,
    "manageRecordAccess",
  );
  if (!actor) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  let body: {
    userId?: string;
    canReadMasked?: boolean;
    confirmCount?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  if (
    !body.userId ||
    typeof body.canReadMasked !== "boolean" ||
    typeof body.confirmCount !== "number"
  ) {
    return NextResponse.json({ ok: false, message: "적용 범위를 확인해 주세요." }, { status: 400 });
  }
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: body.userId } },
  });
  if (!member) {
    return NextResponse.json({ ok: false, message: "팀 멤버가 아닙니다." }, { status: 404 });
  }
  const meetings = await prisma.teamMeeting.findMany({
    where: { teamId },
    select: { id: true },
  });
  if (meetings.length !== body.confirmCount) {
    return NextResponse.json(
      { ok: false, message: `회의 수가 변경되었습니다. ${meetings.length}건을 다시 확인해 주세요.` },
      { status: 409 },
    );
  }
  await prisma.$transaction(
    meetings.map((meeting) =>
      prisma.teamMeetingAccess.upsert({
        where: {
          meetingId_userId: {
            meetingId: meeting.id,
            userId: body.userId!,
          },
        },
        create: {
          meetingId: meeting.id,
          userId: body.userId!,
          canReadMasked: body.canReadMasked!,
          grantedById: session.user.id,
        },
        update: {
          canReadMasked: body.canReadMasked,
          grantedById: session.user.id,
        },
      }),
    ),
  );
  await writeTeamAudit({
    teamId,
    actorId: session.user.id,
    targetUserId: body.userId,
    action: "meeting.access_bulk_updated",
    metadata: {
      canReadMasked: body.canReadMasked,
      meetingCount: meetings.length,
    },
    request,
  });
  return NextResponse.json({ ok: true, count: meetings.length });
}

