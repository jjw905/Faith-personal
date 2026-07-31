import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getOperationsReadiness } from "@/lib/operations-readiness";
import { prisma } from "@/lib/prisma";
import { getTeamRetentionPreview } from "@/lib/team/retention";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user?.id) return 401 as const;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!user || user.disabled || user.role !== "ADMIN") return 403 as const;
  return 200 as const;
}

export async function GET() {
  const status = await assertAdmin();
  if (status !== 200) {
    return NextResponse.json(
      {
        ok: false,
        message: status === 401 ? "로그인이 필요합니다." : "권한 없음",
      },
      { status },
    );
  }

  const [readiness, retention] = await Promise.all([
    Promise.resolve(getOperationsReadiness()),
    getTeamRetentionPreview(),
  ]);
  return NextResponse.json({
    ok: true,
    readiness,
    retention,
  });
}
