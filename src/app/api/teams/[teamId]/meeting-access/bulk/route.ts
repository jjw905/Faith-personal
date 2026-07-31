import { NextResponse } from "next/server";

import { TEAM_FEATURE_ADMIN_ONLY } from "@/lib/feature-flags";
import { createNotification } from "@/lib/notifications-store";
import { prisma } from "@/lib/prisma";
import {
  requireTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";
import {
  meetingAckGroupKey,
  NOTIFICATION_KINDS,
} from "@/lib/team/notification-kinds";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
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
  if (TEAM_FEATURE_ADMIN_ONLY) {
    const target = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { role: true, disabled: true },
    });
    if (target?.disabled || target?.role !== "ADMIN") {
      return NextResponse.json(
        { ok: false, message: "현재는 관리자 계정만 회의 기록을 공유할 수 있습니다." },
        { status: 403 },
      );
    }
  }
  const meetings = await prisma.teamMeeting.findMany({
    where: { teamId },
    select: { id: true, title: true },
  });
  if (meetings.length !== body.confirmCount) {
    return NextResponse.json(
      { ok: false, message: `회의 수가 변경되었습니다. ${meetings.length}건을 다시 확인해 주세요.` },
      { status: 409 },
    );
  }
  const existingAccess = await prisma.teamMeetingAccess.findMany({
    where: {
      userId: body.userId,
      meetingId: { in: meetings.map((meeting) => meeting.id) },
    },
    select: { meetingId: true, canReadMasked: true },
  });
  const existingByMeetingId = new Map(
    existingAccess.map((access) => [access.meetingId, access]),
  );
  await prisma.$transaction(
    meetings.map((meeting) => {
      const previous = existingByMeetingId.get(meeting.id);
      return prisma.teamMeetingAccess.upsert({
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
          ...(body.canReadMasked && !previous?.canReadMasked
            ? { acknowledgedAt: null }
            : {}),
        },
      });
    }),
  );
  if (body.canReadMasked) {
    await Promise.all(
      meetings
        .filter(
          (meeting) =>
            !existingByMeetingId.get(meeting.id)?.canReadMasked,
        )
        .map((meeting) =>
          createNotification({
            userId: body.userId!,
            type: "meeting",
            kind: NOTIFICATION_KINDS.MEETING_ACK,
            title: "회의 기록 확인이 필요합니다",
            body: meeting.title,
            teamId,
            meetingId: meeting.id,
            groupKey: meetingAckGroupKey(meeting.id),
            visibleInWorkspace: true,
            data: { teamId, meetingId: meeting.id, ack: true },
          }),
        ),
    );
  }
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

