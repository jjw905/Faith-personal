import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import {
  requireTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";

type RouteContext = {
  params: Promise<{ teamId: string; inviteId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  const { teamId, inviteId } = await context.params;
  const member = await requireTeamCapability(teamId, session.user.id, "invite");
  if (!member) {
    return NextResponse.json({ ok: false, message: "초대 권한이 없습니다." }, { status: 403 });
  }
  const invite = await prisma.teamInvite.findFirst({
    where: { id: inviteId, teamId, status: "PENDING" },
  });
  if (!invite) {
    return NextResponse.json({ ok: false, message: "대기 중인 초대가 아닙니다." }, { status: 404 });
  }
  await prisma.teamInvite.update({
    where: { id: inviteId },
    data: { status: "CANCELED", respondedAt: new Date() },
  });
  await writeTeamAudit({
    teamId,
    actorId: session.user.id,
    targetUserId: invite.invitedUserId,
    action: "invite.canceled",
    metadata: { inviteId },
    request,
  });
  return NextResponse.json({ ok: true });
}

