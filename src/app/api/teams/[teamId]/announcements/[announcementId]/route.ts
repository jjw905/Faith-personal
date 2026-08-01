import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { openTeamText, sealTeamText } from "@/lib/team-encryption";
import {
  isTeamManager,
  requireTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = {
  params: Promise<{ teamId: string; announcementId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { teamId, announcementId } = await context.params;
  let body: { pinned?: boolean; title?: string; body?: string; archive?: boolean; confirmRead?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }

  if (body.confirmRead) {
    const member = await prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId: session.user.id } },
    });
    if (!member) {
      return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 403 });
    }
    await prisma.teamAnnouncementRead.upsert({
      where: {
        announcementId_userId: {
          announcementId,
          userId: session.user.id,
        },
      },
      create: {
        announcementId,
        userId: session.user.id,
      },
      update: { readAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  }

  const actor = await requireTeamCapability(teamId, session.user.id, "manageTeam");
  if (!actor || !isTeamManager(actor.role)) {
    return NextResponse.json({ ok: false, message: "공지 권한이 없습니다." }, { status: 403 });
  }
  let storedTitle: string | undefined;
  let storedBody: string | undefined;
  try {
    storedTitle = body.title?.trim()
      ? await sealTeamText(teamId, "content", body.title.trim().slice(0, 120))
      : undefined;
    storedBody = body.body?.trim()
      ? await sealTeamText(teamId, "content", body.body.trim().slice(0, 5000))
      : undefined;
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "팀 보안 키가 준비되지 않아 공지를 저장할 수 없습니다.",
      },
      { status: 503 },
    );
  }
  const updated = await prisma.teamAnnouncement.update({
    where: { id: announcementId },
    data: {
      ...(typeof body.pinned === "boolean" ? { pinned: body.pinned } : {}),
      ...(storedTitle ? { title: storedTitle } : {}),
      ...(storedBody ? { body: storedBody } : {}),
      ...(body.archive ? { archivedAt: new Date() } : {}),
    },
  });
  await writeTeamAudit({
    teamId,
    actorId: session.user.id,
    action: "announcement.updated",
    metadata: { announcementId, archive: Boolean(body.archive) },
    request,
  });
  return NextResponse.json({
    ok: true,
    announcement: {
      ...updated,
      title: await openTeamText(teamId, "content", updated.title),
      body: await openTeamText(teamId, "content", updated.body),
    },
  });
}
