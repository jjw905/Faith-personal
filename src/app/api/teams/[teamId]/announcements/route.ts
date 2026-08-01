import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications-store";
import { openTeamText, sealTeamText } from "@/lib/team-encryption";
import { NOTIFICATION_KINDS } from "@/lib/team/notification-kinds";
import {
  isTeamManager,
  requireTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";
import {
  requireTeamFeatureUser,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

type RouteContext = { params: Promise<{ teamId: string }> };

async function publicAnnouncement<T extends {
  title: string;
  body: string;
}>(teamId: string, row: T) {
  return {
    ...row,
    title: await openTeamText(teamId, "content", row.title),
    body: await openTeamText(teamId, "content", row.body),
  };
}

export async function GET(_: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { teamId } = await context.params;
  const member = await prisma.teamMember.findUnique({
    where: { teamId_userId: { teamId, userId: session.user.id } },
  });
  if (!member) {
    return NextResponse.json({ ok: false, message: "팀을 찾을 수 없습니다." }, { status: 404 });
  }
  const rows = await prisma.teamAnnouncement.findMany({
    where: { teamId, archivedAt: null },
    include: {
      author: { select: { id: true, name: true, handle: true } },
      reads: { where: { userId: session.user.id }, take: 1 },
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
  });
  const announcements = await Promise.all(
    rows.map((row) => publicAnnouncement(teamId, row)),
  );
  return NextResponse.json({ ok: true, announcements });
}

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) return teamFeatureFailureResponse(gate);
  const { session } = gate;
  const { teamId } = await context.params;
  const actor = await requireTeamCapability(teamId, session.user.id, "manageTeam");
  if (!actor || !isTeamManager(actor.role)) {
    return NextResponse.json({ ok: false, message: "공지 권한이 없습니다." }, { status: 403 });
  }
  let body: { title?: string; body?: string; pinned?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }
  const title = body.title?.trim().slice(0, 120);
  const text = body.body?.trim().slice(0, 5000);
  if (!title || !text) {
    return NextResponse.json({ ok: false, message: "제목과 내용을 입력해 주세요." }, { status: 400 });
  }
  let storedTitle: string;
  let storedBody: string;
  try {
    [storedTitle, storedBody] = await Promise.all([
      sealTeamText(teamId, "content", title),
      sealTeamText(teamId, "content", text),
    ]);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message: "팀 보안 키가 준비되지 않아 공지를 저장할 수 없습니다.",
      },
      { status: 503 },
    );
  }
  const announcement = await prisma.teamAnnouncement.create({
    data: {
      id: `ta-${randomUUID().slice(0, 12)}`,
      teamId,
      authorId: session.user.id,
      title: storedTitle,
      body: storedBody,
      pinned: Boolean(body.pinned),
    },
  });
  const members = await prisma.teamMember.findMany({
    where: { teamId, userId: { not: session.user.id } },
    select: { userId: true },
  });
  await Promise.all(
    members.map(({ userId }) =>
      createNotification({
        userId,
        type: "team",
        kind: NOTIFICATION_KINDS.ANNOUNCEMENT,
        title: `${actor.team.name} 공지`,
        body: title,
        teamId,
        visibleInWorkspace: false,
        data: { teamId, announcementId: announcement.id, teamName: actor.team.name },
      }),
    ),
  );
  await writeTeamAudit({
    teamId,
    actorId: session.user.id,
    action: "announcement.created",
    metadata: { announcementId: announcement.id, pinned: announcement.pinned },
    request,
  });
  return NextResponse.json(
    { ok: true, announcement: await publicAnnouncement(teamId, announcement) },
    { status: 201 },
  );
}
