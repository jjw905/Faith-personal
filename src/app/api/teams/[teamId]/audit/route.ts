import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { openTeamJson } from "@/lib/team-encryption";
import { purgeExpiredTeamAuditLogs } from "@/lib/team/retention";
import { getTeamMember, writeTeamAudit } from "@/lib/team-permissions";
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
  if (member.role !== "OWNER") {
    return NextResponse.json(
      { ok: false, message: "감사 로그는 팀 대표만 볼 수 있습니다." },
      { status: 403 },
    );
  }
  const purged = await purgeExpiredTeamAuditLogs({ teamId });
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor");
  const logs = await prisma.teamAuditLog.findMany({
    where: { teamId },
    include: {
      actor: { select: { id: true, name: true, handle: true } },
      targetUser: { select: { id: true, name: true, handle: true } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 51,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const nextCursor = logs.length > 50 ? logs[49]!.id : null;
  if (logs.length > 50) logs.length = 50;
  const publicLogs = await Promise.all(
    logs.map(async (log) => ({
      ...log,
      metadata: await openTeamJson<Record<string, unknown>>(
        teamId,
        "audit",
        log.metadata,
      ),
    })),
  );
  await writeTeamAudit({
    teamId,
    actorId: session.user.id,
    action: "audit.viewed",
    metadata: { count: logs.length, purged: purged.deleted },
    request,
  });
  return NextResponse.json({
    ok: true,
    logs: publicLogs,
    nextCursor,
    retentionDays: purged.retentionDays,
    purged: purged.deleted,
  });
}
