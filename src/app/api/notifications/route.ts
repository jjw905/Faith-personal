import { NextResponse } from "next/server";

import { parseDataRetentionDays } from "@/lib/data-retention";
import {
  listVisibleNotifications,
  markNotificationsRead,
  setUserNotificationRetention,
} from "@/lib/notifications-store";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

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
  // 보존 기간은 DB(계정 설정)만 사용. 쿼리로 덮어쓰면 localStorage 스테이로
  // 서버보다 짧은 기간이 적용돼 알림이 과다 삭제될 수 있다.
  // countOnly(배지)는 purge 생략 — 폴링마다 삭제하면 부하만 커진다.
  const result = await listVisibleNotifications(session.user.id, undefined, {
    purge: !countOnly,
  });

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

  const hasIds = Array.isArray(body.ids) && body.ids.length > 0;
  // 보존 기간 변경은 읽음 처리와 섞지 않는다. 클라이언트가 localStorage 값을
  // 같이 보내면 서버 설정을 덮어쓰며 알림을 과다 삭제할 수 있다.
  // 보존 기간 전용 PATCH만 허용(레거시). 신규 UI는 /api/account/data-retention.
  if (body.retentionDays !== undefined && !body.all && !hasIds) {
    const retentionDays = parseDataRetentionDays(body.retentionDays);
    await setUserNotificationRetention(session.user.id, retentionDays);
    const result = await listVisibleNotifications(session.user.id);
    return NextResponse.json({
      ok: true,
      unreadCount: result.unreadCount,
      retentionDays: result.retentionDays,
    });
  }

  if (body.all) {
    const r = await markNotificationsRead(session.user.id, "all");
    return NextResponse.json({ ok: true, unreadCount: r.unreadCount });
  }

  if (hasIds) {
    const ids = body.ids!.map((id) => String(id)).filter(Boolean);
    const r = await markNotificationsRead(session.user.id, ids);
    return NextResponse.json({ ok: true, unreadCount: r.unreadCount });
  }

  return NextResponse.json(
    { ok: false, message: "수정할 항목이 없습니다." },
    { status: 400 },
  );
}
