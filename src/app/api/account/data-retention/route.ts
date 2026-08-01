import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { prisma } from "@/lib/prisma";
import { parseDataRetentionDays } from "@/lib/data-retention";
import { setUserNotificationRetention } from "@/lib/notifications-store";
import {
  purgeAiUsageForUserBefore,
} from "@/lib/stt/usage-store";
import {
  purgePipelineAttemptsForUserBefore,
} from "@/lib/stt/pipeline-stats-store";
import {
  findExpiredUserMeetings,
  purgeExpiredUserMeetings,
} from "@/lib/user-meetings-store";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * 개인 데이터(회의 기록, 알림, AI 운영 이벤트) 보존 기간. 감사 로그(고정
 * 730일, 법정 상한 구간)는 이 설정과 무관하다. GET은 조회 전용 미리보기 —
 * 저장하지 않는다.
 * `analysis_usage`와 분 크레딧 원장은 유료/쿼터 중복 차감을 막는 최소
 * 회계 기록이라 회의 본문 삭제와 함께 지우지 않는다.
 *
 * 배포 시 `meeting_retention_days` 컬럼이 필요하면 서버에서
 * `npx prisma migrate deploy`를 한 번 실행한다.
 */
export async function GET(request: Request) {
  const session = await requireUser();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다." },
      { status: 401 },
    );
  }

  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { notificationRetentionDays: true, meetingRetentionDays: true },
  });
  const currentDays = parseDataRetentionDays(
    account?.meetingRetentionDays ?? account?.notificationRetentionDays,
  );

  const url = new URL(request.url);
  const proposedRaw = url.searchParams.get("days");
  const proposedDays = proposedRaw
    ? parseDataRetentionDays(proposedRaw)
    : currentDays;

  const now = new Date();
  const expiredMeetings = (await findExpiredUserMeetings(
    session.user.id,
    proposedDays,
    now,
  )).length;
  const cutoff = new Date(now.getTime() - proposedDays * 24 * 60 * 60 * 1000);
  const expiredNotifications = await prisma.notification.count({
    where: { userId: session.user.id, createdAt: { lt: cutoff } },
  });

  return NextResponse.json({
    ok: true,
    currentDays,
    proposedDays,
    willDeleteMeetings: expiredMeetings,
    willDeleteNotifications: expiredNotifications,
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

  const limit = rateLimit({
    key: `data-retention:${session.user.id}:${clientIp(request)}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

  let body: { days?: number | string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청입니다." },
      { status: 400 },
    );
  }
  const days = parseDataRetentionDays(body.days);
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // setUserNotificationRetention이 notification + meeting 보존일을 함께 맞춘다.
  await setUserNotificationRetention(session.user.id, days);

  const [
    { deleted: deletedMeetings },
    deletedNotifications,
    deletedAiUsage,
    deletedPipelineAttempts,
  ] =
    await Promise.all([
      Promise.resolve(
        purgeExpiredUserMeetings(session.user.id, days, new Date(), {
          max: 500,
        }),
      ),
      prisma.notification
        .deleteMany({
          where: { userId: session.user.id, createdAt: { lt: cutoff } },
        })
        .then((r) => r.count),
      purgeAiUsageForUserBefore(session.user.id, cutoff),
      purgePipelineAttemptsForUserBefore(session.user.id, cutoff),
    ]);

  return NextResponse.json({
    ok: true,
    days,
    deletedMeetings,
    deletedNotifications,
    deletedAiUsage,
    deletedPipelineAttempts,
  });
}
