import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { seoulDateKey } from "@/lib/meeting-date";
import { prisma } from "@/lib/prisma";
import { summarizeAiUsageWithFx } from "@/lib/stt/usage-fx";
import { filterAiUsageEvents, listAiUsage } from "@/lib/stt/usage-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!dbUser || dbUser.disabled || dbUser.role !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const allEvents = listAiUsage(5000);
  const filtered = filterAiUsageEvents(allEvents, { userId, from, to });
  const [summary, allSummary] = await Promise.all([
    summarizeAiUsageWithFx(filtered),
    summarizeAiUsageWithFx(allEvents),
  ]);

  const userIds = [...new Set(allEvents.map((e) => e.userId))];
  const profiles = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const labelById = new Map(
    profiles.map((u) => [
      u.id,
      (u.name?.trim() || u.email?.trim() || u.id) as string,
    ]),
  );

  const users = allSummary.byUser.map((u) => ({
    id: u.userId,
    label: labelById.get(u.userId) || u.userId,
    usd: u.usd,
    krw: u.krw,
    jobs: u.jobs,
  }));

  return NextResponse.json({
    ok: true,
    summary,
    users,
    filters: {
      userId: userId || null,
      from: from || null,
      to: to || null,
      today: seoulDateKey(),
    },
  });
}
