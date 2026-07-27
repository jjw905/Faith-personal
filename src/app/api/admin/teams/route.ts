import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { listTeamsPage } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { status: 401 as const, session: null };
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!dbUser || dbUser.disabled || dbUser.role !== "ADMIN") {
    return { status: 403 as const, session: null };
  }
  return { status: 200 as const, session };
}

export async function GET(request: Request) {
  const gate = await assertAdmin();
  if (!gate.session) {
    return NextResponse.json(
      {
        ok: false,
        message: gate.status === 401 ? "로그인이 필요합니다." : "권한 없음",
      },
      { status: gate.status },
    );
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const memberId = url.searchParams.get("memberId") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "9");

  const result = await listTeamsPage({
    q,
    memberId: memberId || undefined,
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 9,
  });

  return NextResponse.json({
    ok: true,
    teams: result.teams,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
  });
}
