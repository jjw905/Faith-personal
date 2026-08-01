import { NextResponse } from "next/server";

import type { TeamRole } from "@prisma/client";

import { createNotification } from "@/lib/notifications-store";
import { removeUserFromTeamRooms } from "@/lib/livekit-admin";
import { prisma } from "@/lib/prisma";
import {
  getTeamMember,
  hasTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ teamId: string; userId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { teamId, userId } = await context.params;
  const actor = await getTeamMember(teamId, session.user.id);
  const target = await getTeamMember(teamId, userId);
  if (!actor || !target || !hasTeamCapability(actor, "manageTeam")) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  if (target.role === "OWNER") {
    return NextResponse.json({ ok: false, message: "팀 대표 역할은 여기서 바꿀 수 없습니다." }, { status: 400 });
  }
  let body: {
    role?: TeamRole;
    canInvite?: boolean;
    canCreateMeeting?: boolean;
    canManageRecordAccess?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  const nextRole =
    body.role === "ADMIN" || body.role === "MEMBER" ? body.role : undefined;
  if (nextRole === "ADMIN" && actor.role !== "OWNER") {
    return NextResponse.json({ ok: false, message: "팀장 임명은 팀 대표만 할 수 있습니다." }, { status: 403 });
  }
  const updated = await prisma.teamMember.update({
    where: { teamId_userId: { teamId, userId } },
    data: {
      ...(nextRole ? { role: nextRole } : {}),
      ...(typeof body.canInvite === "boolean" ? { canInvite: body.canInvite } : {}),
      ...(typeof body.canCreateMeeting === "boolean"
        ? { canCreateMeeting: body.canCreateMeeting }
        : {}),
      ...(typeof body.canManageRecordAccess === "boolean"
        ? { canManageRecordAccess: body.canManageRecordAccess }
        : {}),
    },
  });
  await Promise.all([
    writeTeamAudit({
      teamId,
      actorId: session.user.id,
      targetUserId: userId,
      action: "member.permissions_updated",
      metadata: {
        role: updated.role,
        canInvite: updated.canInvite,
        canCreateMeeting: updated.canCreateMeeting,
        canManageRecordAccess: updated.canManageRecordAccess,
      },
      request,
    }),
    createNotification({
      userId,
      type: "team",
      title: "팀 권한이 변경되었습니다",
      body: `${actor.team.name}에서 역할 또는 위임 권한이 변경되었습니다.`,
      teamId,
      data: { teamId },
    }),
  ]);
  return NextResponse.json({ ok: true, member: updated });
}

export async function DELETE(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { teamId, userId } = await context.params;
  const actor = await getTeamMember(teamId, session.user.id);
  const target = await getTeamMember(teamId, userId);
  if (!actor || !target) {
    return NextResponse.json({ ok: false, message: "구성원을 찾을 수 없습니다." }, { status: 404 });
  }
  const selfLeave = userId === session.user.id;
  if (!selfLeave && !hasTeamCapability(actor, "manageTeam")) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
  }
  if (target.role === "OWNER") {
    return NextResponse.json({ ok: false, message: "팀 대표는 대표 권한을 다른 구성원에게 넘긴 뒤에만 탈퇴할 수 있습니다." }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.teamMember.delete({
      where: { teamId_userId: { teamId, userId } },
    }),
    prisma.teamMeetingAccess.updateMany({
      where: { userId, meeting: { teamId } },
      data: {
        isParticipant: false,
        canReadMasked: false,
        acknowledgedAt: null,
      },
    }),
  ]);
  await removeUserFromTeamRooms(teamId, userId);
  await writeTeamAudit({
    teamId,
    actorId: session.user.id,
    targetUserId: userId,
    action: selfLeave ? "member.left" : "member.removed",
    request,
  });
  return NextResponse.json({ ok: true });
}

