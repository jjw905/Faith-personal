import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { parseAccountDisplayPrefs } from "@/lib/account-settings";
import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import {
  personalRealtimeHref,
} from "@/lib/personal-realtime";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

type RouteContext = { params: Promise<{ inviteId: string }> };

class InviteResponseConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteResponseConflictError";
  }
}

export async function POST(request: Request, context: RouteContext) {
  if (!REALTIME_FEATURE_ENABLED) {
    return NextResponse.json(
      { ok: false, message: "실시간 기록은 오픈 준비중이에요." },
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
  const { inviteId } = await context.params;
  let body: {
    action?: "accept" | "decline";
    notificationId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  if (body.action !== "accept" && body.action !== "decline") {
    return NextResponse.json(
      { ok: false, message: "초대 응답을 확인해 주세요." },
      { status: 400 },
    );
  }

  const invite = await prisma.personalRealtimeAccess.findFirst({
    where: {
      id: inviteId,
      userId: session.user.id,
    },
    include: {
      meeting: {
        include: {
          access: { select: { userId: true, status: true } },
        },
      },
    },
  });
  if (!invite) {
    return NextResponse.json(
      { ok: false, message: "개인 실시간 초대를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (invite.status !== "PENDING") {
    return NextResponse.json(
      { ok: false, message: "이미 처리된 초대입니다." },
      { status: 409 },
    );
  }

  let nextStatus: "ACCEPTED" | "DECLINED" = "DECLINED";
  if (body.action === "accept") {
    const prefs = await prisma.userPersonalSettings.findUnique({
      where: { userId: session.user.id },
      select: { displayPrefs: true },
    });
    if (parseAccountDisplayPrefs(prefs?.displayPrefs).realtimeInvitePolicy === "reject") {
      return NextResponse.json(
        { ok: false, message: "개인 설정에서 실시간 초대를 거부하고 있습니다." },
        { status: 403 },
      );
    }
    nextStatus = "ACCEPTED";
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "personal_realtime_meetings" WHERE "id" = ${invite.meeting.id} FOR UPDATE`,
      );
      const currentMeeting = await tx.personalRealtimeMeeting.findUnique({
        where: { id: invite.meeting.id },
        select: {
          state: true,
          maxParticipants: true,
          access: { select: { id: true, userId: true, status: true } },
        },
      });
      const currentInvite = currentMeeting?.access.find(
        (entry) => entry.id === invite.id && entry.userId === session.user.id,
      );
      if (!currentMeeting || currentInvite?.status !== "PENDING") {
        throw new InviteResponseConflictError("이미 처리된 초대입니다.");
      }
      if (nextStatus === "ACCEPTED") {
        if (!["LOBBY", "ACTIVE"].includes(currentMeeting.state)) {
          throw new InviteResponseConflictError(
            "이미 종료된 개인 실시간 회의입니다.",
          );
        }
        const acceptedCount = currentMeeting.access.filter(
          (entry) => entry.status === "ACCEPTED",
        ).length;
        if (acceptedCount >= currentMeeting.maxParticipants) {
          throw new InviteResponseConflictError(
            "참가 인원이 가득 찬 개인 실시간 회의입니다.",
          );
        }
      }
      await tx.personalRealtimeAccess.update({
        where: { id: invite.id },
        data: { status: nextStatus, respondedAt: new Date() },
      });
    });
  } catch (error) {
    if (error instanceof InviteResponseConflictError) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 409 },
      );
    }
    throw error;
  }
  await prisma.notification.updateMany({
    where: {
      userId: session.user.id,
      kind: "personal_realtime_invite",
      meetingId: invite.meeting.legacyMeetingId,
      ...(body.notificationId ? { id: body.notificationId } : {}),
    },
    data: { readAt: new Date(), confirmedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    href:
      nextStatus === "ACCEPTED"
        ? personalRealtimeHref(invite.meeting.id)
        : null,
  });
}
