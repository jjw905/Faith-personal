import { NextResponse } from "next/server";

import { resetAuthDatabase } from "@/lib/auth-reset";
import { enforceAuthRateLimit } from "@/lib/rate-limit";

/**
 * 인증 DB 초기화 (유저/계정/세션/보관함 메타/인증토큰) + 어드민 재시드.
 * Authorization: Bearer <SETUP_SECRET> 필수.
 * body: { "confirm": "RESET_AUTH" } 필수.
 */
export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "setup-reset-auth", 3, 60_000);
  if (limited) return limited;

  const setupSecret = process.env.SETUP_SECRET?.trim();
  if (!setupSecret) {
    return NextResponse.json(
      { ok: false, message: "SETUP_SECRET이 설정되지 않았습니다." },
      { status: 403 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (token !== setupSecret) {
    return NextResponse.json({ ok: false, message: "권한이 없습니다." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: 'confirm: "RESET_AUTH" 본문이 필요합니다.' },
      { status: 400 },
    );
  }
  const confirm =
    typeof body === "object" &&
    body !== null &&
    "confirm" in body &&
    typeof (body as { confirm: unknown }).confirm === "string"
      ? (body as { confirm: string }).confirm
      : "";
  if (confirm !== "RESET_AUTH") {
    return NextResponse.json(
      { ok: false, message: 'confirm 값이 "RESET_AUTH"여야 합니다.' },
      { status: 400 },
    );
  }

  try {
    const result = await resetAuthDatabase();
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message.slice(0, 200) : "초기화 실패",
      },
      { status: 500 },
    );
  }
}
