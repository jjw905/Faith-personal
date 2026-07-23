import { NextResponse } from "next/server";

import {
  parseDataRetentionDays,
  type DataRetentionDays,
} from "@/lib/data-retention";
import {
  listVisibleNotifications,
  markNotificationsRead,
  setUserNotificationRetention,
} from "@/lib/notifications-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

function retentionFromRequest(request: Request): DataRetentionDays | undefined {
  const url = new URL(request.url);
  const q = url.searchParams.get("retentionDays");
  if (q) return parseDataRetentionDays(q);
  return undefined;
}

export async function GET(request: Request) {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const countOnly = url.searchParams.get("countOnly") === "1";
  const retentionDays = retentionFromRequest(request);
  const result = listVisibleNotifications(session.user.id, retentionDays);

  if (countOnly) {
    return NextResponse.json({
      ok: true,
      unreadCount: result.unreadCount,
      retentionDays: result.retentionDays,
    });
  }

  return NextResponse.json({
    ok: true,
    unread: result.unread,
    recent: result.recent,
    unreadCount: result.unreadCount,
    retentionDays: result.retentionDays,
  });
}

export async function PATCH(request: Request) {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  let body: {
    ids?: string[];
    all?: boolean;
    retentionDays?: number | string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }

  const retentionDays =
    body.retentionDays !== undefined
      ? parseDataRetentionDays(body.retentionDays)
      : undefined;

  if (retentionDays !== undefined) {
    setUserNotificationRetention(session.user.id, retentionDays);
  }

  if (body.all) {
    const r = markNotificationsRead(session.user.id, "all", retentionDays);
    return NextResponse.json({ ok: true, unreadCount: r.unreadCount });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const ids = body.ids.map((id) => String(id)).filter(Boolean);
    const r = markNotificationsRead(session.user.id, ids, retentionDays);
    return NextResponse.json({ ok: true, unreadCount: r.unreadCount });
  }

  if (retentionDays !== undefined) {
    const result = listVisibleNotifications(session.user.id, retentionDays);
    return NextResponse.json({
      ok: true,
      unreadCount: result.unreadCount,
      retentionDays: result.retentionDays,
    });
  }

  return NextResponse.json(
    { ok: false, message: "수정할 항목이 없습니다." },
    { status: 400 },
  );
}
