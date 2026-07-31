import { NextResponse } from "next/server";

import { REALTIME_FEATURE_ENABLED } from "@/lib/feature-flags";
import { clientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export async function GET(request: Request) {
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
    key: `personal-realtime-people:${session.user.id}:${clientIp(request)}`,
    limit: 30,
    windowMs: 60_000,
  });
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

  const query = new URL(request.url).searchParams.get("query")?.trim() ?? "";
  if (query.length < 3 || query.length > 50) {
    return NextResponse.json({ ok: true, people: [] });
  }

  const handle = query.replace(/^@/, "").toLowerCase();
  const inviteCode = query.replace(/\s+/g, "").toUpperCase();
  const people = await prisma.user.findMany({
    where: {
      id: { not: session.user.id },
      disabled: false,
      OR: [{ handle: { contains: handle, mode: "insensitive" } }, { inviteCode }],
    },
    select: {
      id: true,
      name: true,
      handle: true,
      image: true,
    },
    orderBy: [{ name: "asc" }, { handle: "asc" }],
    take: 10,
  });

  return NextResponse.json({ ok: true, people });
}
