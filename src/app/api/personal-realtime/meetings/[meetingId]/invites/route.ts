import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { parseAccountDisplayPrefs } from "@/lib/account-settings";
import { createNotification } from "@/lib/notifications-store";
import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import {
  getPersonalRealtimeMeeting,
  personalRealtimeHref,
} from "@/lib/personal-realtime";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { requireUser } from "@/lib/require-user";

type RouteContext = { params: Promise<{ meetingId: string }> };

class InviteConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InviteConflictError";
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
  const inviteLimit = rateLimit({
    key: `personal-realtime-invite:${session.user.id}:${clientIp(request)}`,
    limit: 20,
    windowMs: 10 * 60_000,
  });
  if (!inviteLimit.ok) return rateLimitResponse(inviteLimit.retryAfterSec);
  const { meetingId } = await context.params;
  const meeting = await getPersonalRealtimeMeeting(meetingId);
  if (!meeting) {
    return NextResponse.json(
      { ok: false, message: "개인 실시간 회의를 찾을 수 없습니다." },
      { status: 404 },
    );
  }
  if (meeting.ownerId !== session.user.id) {
    return NextResponse.json(
      { ok: false, message: "주최자만 회원을 초대할 수 있습니다." },
      { status: 403 },
    );
  }
  if (!["LOBBY", "ACTIVE"].includes(meeting.state)) {
    return NextResponse.json(
      { ok: false, message: "진행 중인 개인 실시간 회의만 초대할 수 있습니다." },
      { status: 409 },
    );
  }

  let body: { userId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const userId = body.userId?.trim();
  if (!userId || userId === session.user.id) {
    return NextResponse.json(
      { ok: false, message: "초대할 회원을 확인해 주세요." },
      { status: 400 },
    );
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      disabled: true,
      personalSettings: { select: { displayPrefs: true } },
    },
  });
  if (
    !target ||
    target.disabled ||
    parseAccountDisplayPrefs(
      target.personalSettings?.displayPrefs,
    ).realtimeInvitePolicy ===
      "reject"
  ) {
    return NextResponse.json(
      {
        ok: false,
        code: "PERSONAL_REALTIME_INVITES_UNAVAILABLE",
        message: "이 회원은 개인 실시간 초대를 받을 수 없습니다.",
      },
      { status: 409 },
    );
  }

  let access;
  try {
    access = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "personal_realtime_meetings" WHERE "id" = ${meetingId} FOR UPDATE`,
      );
      const currentMeeting = await tx.personalRealtimeMeeting.findUnique({
        where: { id: meetingId },
        select: {
          maxParticipants: true,
          state: true,
          access: { select: { id: true, userId: true, status: true } },
        },
      });
      if (
        !currentMeeting ||
        !["LOBBY", "ACTIVE"].includes(currentMeeting.state)
      ) {
        throw new InviteConflictError(
          "진행 중인 개인 실시간 회의만 초대할 수 있습니다.",
        );
      }
      const occupied = currentMeeting.access.filter(
        (entry) =>
          entry.status === "ACCEPTED" || entry.status === "PENDING",
      ).length;
      if (occupied >= currentMeeting.maxParticipants) {
        throw new InviteConflictError(
          "개인 공동 실시간은 본인 포함 최대 4명입니다.",
        );
      }
      const existing = currentMeeting.access.find(
        (entry) => entry.userId === userId,
      );
      if (existing?.status === "ACCEPTED") {
        throw new InviteConflictError("이미 참가 중인 회원입니다.");
      }
      if (existing?.status === "PENDING") {
        throw new InviteConflictError("이미 초대를 보냈습니다.");
      }
      return existing
        ? tx.personalRealtimeAccess.update({
            where: { id: existing.id },
            data: { status: "PENDING", respondedAt: null },
          })
        : tx.personalRealtimeAccess.create({
            data: { meetingId, userId, status: "PENDING" },
          });
    });
  } catch (error) {
    if (error instanceof InviteConflictError) {
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 409 },
      );
    }
    throw error;
  }

  await createNotification({
    userId,
    type: "invite",
    kind: "personal_realtime_invite",
    title: "개인 실시간 회의 초대",
    body: `${session.user.name ?? "회원"}님이 음성 통화와 대화 기록에 초대했습니다.`,
    meetingId: meeting.legacyMeetingId,
    groupKey: `personal-realtime:${meeting.id}:${userId}`,
    data: {
      inviteId: access.id,
      inviteType: "personal_realtime",
      personalMeetingId: meeting.id,
      href: personalRealtimeHref(meeting.id),
    },
  });

  return NextResponse.json({ ok: true, inviteId: access.id });
}
