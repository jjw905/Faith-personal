import { NextResponse } from "next/server";

import { ensureAdminUser } from "@/lib/ensure-admin";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { assertSetupSecret } from "@/lib/setup-auth";

/**
 * 프로덕션 관리자 시드.
 * Authorization: Bearer <SETUP_SECRET> 필수.
 */
export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "setup-admin", 5, 60_000);
  if (limited) return limited;

  const gate = assertSetupSecret(request);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, message: gate.message },
      { status: gate.status },
    );
  }

  let userCount = 0;
  try {
    userCount = await prisma.user.count();
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 200) : "db_error";
    return NextResponse.json(
      {
        ok: false,
        message: `DB 스키마가 없습니다. migrate 후 다시 시도하세요. (${msg})`,
      },
      { status: 503 },
    );
  }

  try {
    const result = await ensureAdminUser();
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      email: result.email,
      role: result.role,
      userCountBefore: userCount,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message.slice(0, 200) : "시드 실패",
      },
      { status: 500 },
    );
  }
}
