import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  getTeamMember,
  hasTeamCapability,
} from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
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
  const limit = rateLimit({
    key: `team-people:${teamId}:${session.user.id}:${clientIp(request)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
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
    select: { id: true, name: true, image: true, handle: true, role: true },
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
