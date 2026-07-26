import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import {
  ensureUserIdentifiers,
  writeTeamAudit,
} from "@/lib/team-permissions";

function slugBase(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 32) || "team"
  );
}

export async function GET() {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  await ensureUserIdentifiers(session.user.id);
  const memberships = await prisma.teamMember.findMany({
    where: { userId: session.user.id },
    include: {
      team: {
        include: {
          policy: true,
          _count: {
            select: {
              members: true,
              invites: {
                where: { status: "PENDING", expiresAt: { gt: new Date() } },
              },
            },
          },
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  const identity = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { handle: true, inviteCode: true, plan: true, teamEntitlement: true },
  });
  return NextResponse.json({
    ok: true,
    identity,
    teams: memberships.map((member) => ({
      id: member.team.id,
      name: member.team.name,
      slug: member.team.slug,
      seatLimit: member.team.seatLimit,
      memberCount: member.team._count.members,
      pendingInviteCount: member.team._count.invites,
      role: member.role,
      canInvite: member.canInvite,
      canCreateMeeting: member.canCreateMeeting,
      canManageRecordAccess: member.canManageRecordAccess,
      policy: member.team.policy,
    })),
  });
}

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  const name = body.name?.trim().slice(0, 50);
  if (!name) {
    return NextResponse.json({ ok: false, message: "팀 이름을 입력해 주세요." }, { status: 400 });
  }

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { plan: true, teamEntitlement: true },
  });
  if (
    current?.plan !== "PRO" ||
    !current.teamEntitlement ||
    current.teamEntitlement.remainingTeamSlots < 1 ||
    current.teamEntitlement.seatLimit < 2
  ) {
    return NextResponse.json(
      { ok: false, message: "관리자가 부여한 PRO 팀 슬롯과 2좌석 이상이 필요합니다." },
      { status: 403 },
    );
  }

  const slug = `${slugBase(name)}-${randomBytes(3).toString("hex")}`;
  const team = await prisma.$transaction(async (tx) => {
    const consumed = await tx.teamEntitlement.updateMany({
      where: {
        userId: session.user.id,
        remainingTeamSlots: { gte: 1 },
        seatLimit: { gte: 2 },
      },
      data: { remainingTeamSlots: { decrement: 1 } },
    });
    if (consumed.count !== 1) throw new Error("TEAM_SLOT_UNAVAILABLE");
    return tx.team.create({
      data: {
        name,
        slug,
        ownerId: session.user.id,
        seatLimit: current.teamEntitlement!.seatLimit,
        members: {
          create: {
            userId: session.user.id,
            role: "OWNER",
            canInvite: true,
            canCreateMeeting: true,
            canManageRecordAccess: true,
          },
        },
        policy: { create: {} },
      },
      include: { policy: true },
    });
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "TEAM_SLOT_UNAVAILABLE") return null;
    throw error;
  });
  if (!team) {
    return NextResponse.json({ ok: false, message: "사용 가능한 팀 슬롯이 없습니다." }, { status: 409 });
  }
  await writeTeamAudit({
    teamId: team.id,
    actorId: session.user.id,
    action: "team.created",
    metadata: { name, seatLimit: team.seatLimit },
    request,
  });
  return NextResponse.json({ ok: true, team }, { status: 201 });
}

