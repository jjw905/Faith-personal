import { NextResponse } from "next/server";

import { ensureAdminUser } from "@/lib/ensure-admin";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

/**
 * 프로덕션 관리자 시드.
 * Authorization: Bearer <SETUP_SECRET> 필수.
 */
export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "setup-admin", 5, 60_000);
  if (limited) return limited;

  const setupSecret = process.env.SETUP_SECRET?.trim();
  if (!setupSecret) {
    return NextResponse.json(
      {
        ok: false,
        message: "SETUP_SECRET이 설정되지 않았습니다.",
      },
      { status: 403 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== setupSecret) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 401 });
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
