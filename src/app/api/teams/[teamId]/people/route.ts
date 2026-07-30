import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import {
  getTeamMember,
  hasTeamCapability,
} from "@/lib/team-permissions";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(request: Request, context: RouteContext) {
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
  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query.length < 3 || query.length > 50) {
    return NextResponse.json({ ok: true, person: null });
  }
  const handle = query.replace(/^@/, "").toLowerCase();
  const code = query.replace(/\s+/g, "").toUpperCase();
  const user = await prisma.user.findFirst({
    where: {
      disabled: false,
      OR: [{ handle }, { inviteCode: code }],
    },
    select: { id: true, name: true, image: true, handle: true },
  });
  if (!user) return NextResponse.json({ ok: true, person: null });
  const [membership, pending] = await Promise.all([
    prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: user.id } },
      select: { id: true },
    }),
    prisma.teamInvite.findFirst({
      where: {
        teamId,
        invitedUserId: user.id,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true, expiresAt: true },
    }),
  ]);
  return NextResponse.json({
    ok: true,
    person: {
      ...user,
      alreadyMember: Boolean(membership),
      pendingInvite: pending
        ? { id: pending.id, expiresAt: pending.expiresAt.toISOString() }
        : null,
    },
  });
}
