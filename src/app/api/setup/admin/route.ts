import { NextResponse } from "next/server";

import { ensureAdminUser } from "@/lib/ensure-admin";
import { prisma } from "@/lib/prisma";

/**
 * 프로덕션 최초 관리자 시드.
 * Authorization: Bearer <SETUP_SECRET>
 * SETUP_SECRET이 없으면 유저 0명일 때만 허용.
 */
export async function POST(request: Request) {
  const setupSecret = process.env.SETUP_SECRET?.trim();
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

  const userCount = await prisma.user.count();

  if (setupSecret) {
    if (token !== setupSecret) {
      return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 401 });
    }
  } else if (userCount > 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "이미 계정이 있습니다. SETUP_SECRET을 설정한 뒤 다시 호출하세요.",
      },
      { status: 403 },
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
