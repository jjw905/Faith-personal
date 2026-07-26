import { NextResponse } from "next/server";

import { createNotification } from "@/lib/notifications-store";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import {
  requireTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  const { meetingId } = await context.params;
  const meeting = await prisma.teamMeeting.findUnique({ where: { id: meetingId } });
  if (!meeting) {
    return NextResponse.json({ ok: false, message: "회의를 찾을 수 없습니다." }, { status: 404 });
  }
  const actor = await requireTeamCapability(
    meeting.teamId,
    session.user.id,
    "manageRecordAccess",
  );
  if (!actor) {
    return NextResponse.json({ ok: false, message: "열람 권한 관리 권한이 없습니다." }, { status: 403 });
  }
  let body: { userId?: string; canReadMasked?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.userId || typeof body.canReadMasked !== "boolean") {
    return NextResponse.json({ ok: false, message: "대상과 권한을 확인해 주세요." }, { status: 400 });
  }
  const member = await prisma.teamMember.findUnique({
    where: {
      teamId_userId: { teamId: meeting.teamId, userId: body.userId },
    },
  });
  if (!member) {
    return NextResponse.json({ ok: false, message: "팀 멤버가 아닙니다." }, { status: 404 });
  }
  const access = await prisma.teamMeetingAccess.upsert({
    where: { meetingId_userId: { meetingId, userId: body.userId } },
    create: {
      meetingId,
      userId: body.userId,
      canReadMasked: body.canReadMasked,
      grantedById: session.user.id,
    },
    update: {
      canReadMasked: body.canReadMasked,
      grantedById: session.user.id,
    },
  });
  await Promise.all([
    writeTeamAudit({
      teamId: meeting.teamId,
      actorId: session.user.id,
      targetUserId: body.userId,
      meetingId,
      action: body.canReadMasked
        ? "meeting.access_granted"
        : "meeting.access_revoked",
      request,
    }),
    createNotification({
      userId: body.userId,
      type: "meeting",
      title: body.canReadMasked ? "회의 기록 열람이 허용되었습니다" : "회의 기록 열람이 해제되었습니다",
      body: meeting.title,
      data: { teamId: meeting.teamId, meetingId },
    }),
  ]);
  return NextResponse.json({ ok: true, access });
}

