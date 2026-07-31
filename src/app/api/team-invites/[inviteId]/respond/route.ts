import { NextResponse } from "next/server";

import { createNotification } from "@/lib/notifications-store";
import { prisma } from "@/lib/prisma";
import { writeTeamAudit } from "@/lib/team-permissions";
import { isTeamInviteExpired } from "@/lib/team-permission-matrix";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ inviteId: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { inviteId } = await context.params;
  let body: { action?: "accept" | "decline"; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  if (body.action !== "accept" && body.action !== "decline") {
    return NextResponse.json({ ok: false, message: "응답을 선택해 주세요." }, { status: 400 });
  }
  const invite = await prisma.teamInvite.findFirst({
    where: { id: inviteId, invitedUserId: session.user.id },
    include: { team: true },
  });
  if (!invite) {
    return NextResponse.json({ ok: false, message: "초대를 찾을 수 없습니다." }, { status: 404 });
  }
  if (invite.status !== "PENDING") {
    return NextResponse.json({ ok: false, message: "이미 처리된 초대입니다." }, { status: 409 });
  }
  if (isTeamInviteExpired(invite.expiresAt)) {
    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED", respondedAt: new Date() },
    });
    return NextResponse.json({ ok: false, message: "초대가 만료되었습니다." }, { status: 410 });
  }

  if (body.action === "decline") {
    await prisma.teamInvite.update({
      where: { id: invite.id },
      data: {
        status: "DECLINED",
        declineReason: body.reason?.trim().slice(0, 500) || null,
        respondedAt: new Date(),
      },
    });
    await Promise.all([
      createNotification({
        userId: invite.invitedById,
        type: "invite",
        title: "팀 초대가 거절되었습니다",
        body: body.reason?.trim()
          ? `${session.user.name || "사용자"}: ${body.reason.trim().slice(0, 160)}`
          : `${session.user.name || "사용자"}님이 초대를 거절했습니다.`,
        teamId: invite.teamId,
        data: { inviteId, teamId: invite.teamId },
      }),
      writeTeamAudit({
        teamId: invite.teamId,
        actorId: session.user.id,
        targetUserId: session.user.id,
        action: "invite.declined",
        metadata: { inviteId, hasReason: Boolean(body.reason?.trim()) },
        request,
      }),
    ]);
    return NextResponse.json({ ok: true, status: "DECLINED" });
  }

  const accepted = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "teams" WHERE id = ${invite.teamId} FOR UPDATE
    `;
    const memberCount = await tx.teamMember.count({ where: { teamId: invite.teamId } });
    if (memberCount >= invite.team.seatLimit) return false;
    await tx.teamMember.upsert({
      where: {
        teamId_userId: { teamId: invite.teamId, userId: session.user.id },
      },
      create: {
        teamId: invite.teamId,
        userId: session.user.id,
        role: invite.role,
        canInvite: invite.canInvite,
        canCreateMeeting: invite.canCreateMeeting,
        canManageRecordAccess: invite.canManageRecordAccess,
      },
      update: {},
    });
    await tx.teamInvite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    return true;
  });
  if (!accepted) {
    return NextResponse.json({ ok: false, message: "팀 좌석이 모두 사용 중입니다." }, { status: 409 });
  }
  await Promise.all([
    createNotification({
      userId: invite.invitedById,
      type: "invite",
      title: "팀 초대를 수락했습니다",
      body: `${session.user.name || "사용자"}님이 ${invite.team.name} 팀에 참여했습니다.`,
      teamId: invite.teamId,
      data: { inviteId, teamId: invite.teamId },
    }),
    writeTeamAudit({
      teamId: invite.teamId,
      actorId: session.user.id,
      targetUserId: session.user.id,
      action: "invite.accepted",
      metadata: { inviteId },
      request,
    }),
  ]);
  return NextResponse.json({ ok: true, status: "ACCEPTED", teamId: invite.teamId });
}

