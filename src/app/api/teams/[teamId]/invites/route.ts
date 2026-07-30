import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import type { TeamRole } from "@prisma/client";

import { TEAM_FEATURE_ENABLED } from "@/lib/feature-flags";
import { createNotification } from "@/lib/notifications-store";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { requireUser } from "@/lib/require-user";
import {
  getTeamMember,
  hasTeamCapability,
  requireTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";
import { TEAM_INVITE_TTL_MS } from "@/lib/team-permission-matrix";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(_: Request, context: RouteContext) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const { teamId } = await context.params;
  const member = await getTeamMember(teamId, session.user.id);
  if (!member) {
    return NextResponse.json(
      { ok: false, message: "팀을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (!hasTeamCapability(member, "invite")) {
    return NextResponse.json(
      { ok: false, message: "초대 권한이 없습니다." },
      { status: 403 },
    );
  }
  await prisma.teamInvite.updateMany({
    where: { teamId, status: "PENDING", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRED", respondedAt: new Date() },
  });
  const invites = await prisma.teamInvite.findMany({
    where: { teamId, status: "PENDING" },
    include: {
      invitedUser: {
        select: { id: true, name: true, handle: true, image: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ ok: true, invites });
}

export async function POST(request: Request, context: RouteContext) {
  if (!TEAM_FEATURE_ENABLED) {
    return NextResponse.json(
      { ok: false, message: "팀 기능은 오픈 준비중이에요." },
      { status: 403 },
    );
  }
  const session = await requireUser();
  if (!session) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }
  const { teamId } = await context.params;
  const membership = await getTeamMember(teamId, session.user.id);
  if (!membership) {
    return NextResponse.json(
      { ok: false, message: "팀을 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  const actor = await requireTeamCapability(teamId, session.user.id, "invite");
  if (!actor) {
    return NextResponse.json(
      { ok: false, message: "초대 권한이 없습니다." },
      { status: 403 },
    );
  }
  const limit = rateLimit({
    key: `team-invite:${teamId}:${session.user.id}:${clientIp(request)}`,
    limit: 10,
    windowMs: 60 * 60_000,
  });
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

  let body: {
    userId?: string;
    role?: TeamRole;
    canInvite?: boolean;
    canCreateMeeting?: boolean;
    canManageRecordAccess?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  if (!body.userId || body.userId === session.user.id) {
    return NextResponse.json(
      { ok: false, message: "초대 대상을 확인해 주세요." },
      { status: 400 },
    );
  }
  const role = body.role === "ADMIN" ? "ADMIN" : "MEMBER";
  if (role === "ADMIN" && actor.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, message: "팀장 초대는 팀 대표만 할 수 있습니다." },
      { status: 403 },
    );
  }
  const [target, existing, memberCount, pendingCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, name: true, disabled: true },
    }),
    prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: body.userId } },
      select: { id: true },
    }),
    prisma.teamMember.count({ where: { teamId } }),
    prisma.teamInvite.count({
      where: { teamId, status: "PENDING", expiresAt: { gt: new Date() } },
    }),
  ]);
  if (!target || target.disabled) {
    return NextResponse.json(
      { ok: false, message: "초대할 수 없는 사용자입니다." },
      { status: 404 },
    );
  }
  if (existing) {
    return NextResponse.json(
      { ok: false, message: "이미 팀에 참여 중입니다." },
      { status: 409 },
    );
  }
  if (memberCount + pendingCount >= actor.team.seatLimit) {
    return NextResponse.json(
      { ok: false, message: "팀 좌석이 부족합니다." },
      { status: 409 },
    );
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TEAM_INVITE_TTL_MS);
  const invite = await prisma.$transaction(async (tx) => {
    await tx.teamInvite.updateMany({
      where: { teamId, invitedUserId: body.userId, status: "PENDING" },
      data: { status: "CANCELED", respondedAt: new Date() },
    });
    return tx.teamInvite.create({
      data: {
        teamId,
        invitedUserId: body.userId!,
        invitedById: session.user.id,
        tokenHash,
        role,
        canInvite: Boolean(body.canInvite),
        canCreateMeeting: Boolean(body.canCreateMeeting),
        canManageRecordAccess: Boolean(body.canManageRecordAccess),
        expiresAt,
      },
    });
  });
  await Promise.all([
    createNotification({
      userId: body.userId,
      type: "invite",
      title: `${actor.team.name} 팀 초대`,
      body: "1시간 안에 초대를 수락하거나 거절해 주세요.",
      data: { inviteId: invite.id, teamId, expiresAt: expiresAt.toISOString() },
    }),
    writeTeamAudit({
      teamId,
      actorId: session.user.id,
      targetUserId: body.userId,
      action: "invite.created",
      metadata: {
        inviteId: invite.id,
        role,
        expiresAt: expiresAt.toISOString(),
      },
      request,
    }),
  ]);
  return NextResponse.json(
    {
      ok: true,
      invite: { id: invite.id, expiresAt: expiresAt.toISOString() },
    },
    { status: 201 },
  );
}
