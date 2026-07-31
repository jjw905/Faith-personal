import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import {
  acknowledgeMeetingInvite,
  confirmNotification,
} from "@/lib/team/meeting-notifications";
import {
  getTeamFeatureAccess,
  teamFeatureFailureResponse,
} from "@/lib/team-feature-access";

export async function POST(request: Request) {
  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: { meetingId?: string; notificationId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청입니다." }, { status: 400 });
  }

  if (body.notificationId) {
    const notification = await prisma.notification.findFirst({
      where: {
        id: body.notificationId,
        userId: session.user.id,
      },
      select: { teamId: true, data: true },
    });
    const data =
      notification?.data &&
      typeof notification.data === "object" &&
      !Array.isArray(notification.data)
        ? (notification.data as Record<string, unknown>)
        : null;
    if (notification?.teamId || typeof data?.teamId === "string") {
      const teamFeature = await getTeamFeatureAccess(session.user.id);
      if (!teamFeature.ok) return teamFeatureFailureResponse(teamFeature);
    }
    const result = await confirmNotification({
      userId: session.user.id,
      notificationId: body.notificationId,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
  }

  if (body.meetingId) {
    const teamFeature = await getTeamFeatureAccess(session.user.id);
    if (!teamFeature.ok) return teamFeatureFailureResponse(teamFeature);
    const result = await acknowledgeMeetingInvite({
      userId: session.user.id,
      meetingId: body.meetingId,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
  }

  if (body.notificationId || body.meetingId) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { ok: false, message: "확인할 항목이 없습니다." },
    { status: 400 },
  );
}
