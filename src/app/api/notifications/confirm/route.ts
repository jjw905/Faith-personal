import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import {
  acknowledgeMeetingInvite,
  confirmNotification,
} from "@/lib/team/meeting-notifications";

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
    const result = await confirmNotification({
      userId: session.user.id,
      notificationId: body.notificationId,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.meetingId) {
    const result = await acknowledgeMeetingInvite({
      userId: session.user.id,
      meetingId: body.meetingId,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, message: "확인할 항목이 없습니다." }, { status: 400 });
}
