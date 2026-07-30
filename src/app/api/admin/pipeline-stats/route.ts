import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  listPipelineAttempts,
  summarizePipelineStats,
} from "@/lib/stt/pipeline-stats-store";

export const dynamic = "force-dynamic";

/**
 * 회의 처리 실패율 집계. 개별 회의 제목·본문·화자 이름은 절대 반환하지
 * 않는다. 반환하는 값은 카운트, 비율, 고정 라벨(모델/길이대/화자수대/
 * 실패단계/대분류)뿐이다.
 */
export async function GET() {
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

  const events = listPipelineAttempts(5000);
  const summary = summarizePipelineStats(events);
  const blocked = await prisma.moderationFlag.findMany({
    where: { blocked: true },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      userId: true,
      meetingId: true,
      categories: true,
      maxScore: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, summary, blocked });
}
