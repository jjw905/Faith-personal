import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { createNotification } from "@/lib/notifications-store";
import { requireUser } from "@/lib/require-user";
import { NOTIFICATION_KINDS } from "@/lib/team/notification-kinds";
import {
  isTeamManager,
  requireTeamCapability,
  writeTeamAudit,
} from "@/lib/team-permissions";

type RouteContext = { params: Promise<{ teamId: string }> };

export async function GET(_: Request, context: RouteContext) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
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
  return NextResponse.json({ ok: true, announcements: rows });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
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
  const announcement = await prisma.teamAnnouncement.create({
    data: {
      id: `ta-${randomUUID().slice(0, 12)}`,
      teamId,
      authorId: session.user.id,
      title,
      body: text,
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
  return NextResponse.json({ ok: true, announcement }, { status: 201 });
}
