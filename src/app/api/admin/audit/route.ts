import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  listAdminAuditPage,
  type AdminAuditPeriod,
} from "@/lib/admin-audit";
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

function parsePeriod(value: string | null): AdminAuditPeriod {
  if (
    value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "year" ||
    value === "all"
  ) {
    return value;
  }
  return "week";
}

function parseYmd(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : null;
}

/** 관리자 감사 로그 조회 전용. DELETE/PATCH 없음. */
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
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  const q = url.searchParams.get("q") ?? "";
  const period = parsePeriod(url.searchParams.get("period"));
  const from = parseYmd(url.searchParams.get("from"));
  const to = parseYmd(url.searchParams.get("to"));
  const action = url.searchParams.get("action") ?? undefined;
  const result = await listAdminAuditPage({
    page: Number.isFinite(page) ? page : 1,
    pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    q,
    period,
    from,
    to,
    action,
  });

  return NextResponse.json({
    ok: true,
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    period: result.period,
    from: result.from,
    to: result.to,
    action: result.action,
    logs: result.logs.map((log) => ({
      ...log,
      createdAt: log.createdAt.toISOString(),
    })),
  });
}
