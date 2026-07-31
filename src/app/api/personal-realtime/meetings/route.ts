import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { createNotification } from "@/lib/notifications-store";
import { parseAccountDisplayPrefs } from "@/lib/account-settings";
import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import {
  PERSONAL_REALTIME_MAX_INVITEES,
  uniqueRealtimeInvitees,
} from "@/lib/realtime-policy";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { personalRealtimeHref } from "@/lib/personal-realtime";

export async function POST(request: Request) {
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
  const limit = rateLimit({
    key: `personal-realtime-create:${session.user.id}:${clientIp(request)}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

  let body: { title?: string; inviteeIds?: string[] };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const title = body.title?.trim().slice(0, 120) || "개인 실시간 회의";
  const rawInvitees = Array.isArray(body.inviteeIds)
    ? Array.from(
        new Set(
          body.inviteeIds
            .filter((userId): userId is string => typeof userId === "string")
            .map((userId) => userId.trim())
            .filter((userId) => userId && userId !== session.user.id),
        ),
      )
    : [];
  if (rawInvitees.length > PERSONAL_REALTIME_MAX_INVITEES) {
    return NextResponse.json(
      { ok: false, message: "개인 공동 실시간은 본인 포함 최대 4명입니다." },
      { status: 400 },
    );
  }
  const requestedInvitees = uniqueRealtimeInvitees(
    rawInvitees,
    session.user.id,
  );
  if (requestedInvitees.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "PERSONAL_REALTIME_INVITEE_REQUIRED",
        message: "혼자 기록하려면 개인 기록으로 시작해 주세요.",
      },
      { status: 400 },
    );
  }

  const targets = await prisma.user.findMany({
    where: { id: { in: requestedInvitees }, disabled: false },
    select: {
      id: true,
      personalSettings: { select: { displayPrefs: true } },
    },
  });
  const targetById = new Map(targets.map((target) => [target.id, target]));
  const allowedInvitees = requestedInvitees.filter((userId) => {
    const target = targetById.get(userId);
    return (
      target &&
      parseAccountDisplayPrefs(
        target.personalSettings?.displayPrefs,
      ).realtimeInvitePolicy ===
        "allow"
    );
  });
  if (allowedInvitees.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        code: "PERSONAL_REALTIME_INVITES_UNAVAILABLE",
        message: "초대를 받을 수 있는 회원이 없습니다.",
      },
      { status: 409 },
    );
  }

  const meetingId = `prm-${randomUUID().slice(0, 12)}`;
  const legacyMeetingId = `mtg-live-${randomUUID().slice(0, 12)}`;
  const meeting = await prisma.personalRealtimeMeeting.create({
    data: {
      id: meetingId,
      legacyMeetingId,
      title,
      roomName: `faith-personal-${meetingId}`,
      runId: randomUUID(),
      ownerId: session.user.id,
      maxParticipants: 4,
      access: {
        create: [
          {
            userId: session.user.id,
            status: "ACCEPTED",
            respondedAt: new Date(),
          },
          ...allowedInvitees.map((userId) => ({
            userId,
            status: "PENDING" as const,
          })),
        ],
      },
    },
    select: {
      id: true,
      title: true,
      maxParticipants: true,
      state: true,
      recordingActive: true,
      access: { select: { id: true, userId: true, status: true } },
    },
  });

  const inviteRows = meeting.access.filter(
    (access) => access.userId !== session.user.id,
  );
  await Promise.all(
    inviteRows.map((invite) =>
      createNotification({
        userId: invite.userId,
        type: "invite",
        kind: "personal_realtime_invite",
        title: "개인 실시간 회의 초대",
        body: `${session.user.name ?? "회원"}님이 음성 통화와 대화 기록에 초대했습니다.`,
        meetingId: legacyMeetingId,
        groupKey: `personal-realtime:${meeting.id}:${invite.userId}`,
        data: {
          inviteId: invite.id,
          inviteType: "personal_realtime",
          personalMeetingId: meeting.id,
          href: personalRealtimeHref(meeting.id),
        },
      }),
    ),
  );

  return NextResponse.json(
    {
      ok: true,
      meeting,
      href: personalRealtimeHref(meeting.id),
      invitedCount: inviteRows.length,
      blockedCount: requestedInvitees.length - inviteRows.length,
    },
    { status: 201 },
  );
}
