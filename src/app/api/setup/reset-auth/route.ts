import { NextResponse } from "next/server";

import { resetAuthDatabase } from "@/lib/auth-reset";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { assertSetupSecret } from "@/lib/setup-auth";

/**
 * 인증 DB 초기화 (유저/계정/세션/보관함 메타/인증토큰) + 어드민 재시드.
 * Authorization: Bearer <SETUP_SECRET> 필수.
 * body: { "confirm": "RESET_AUTH" } 필수.
 */
export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "setup-reset-auth", 3, 60_000);
  if (limited) return limited;

  const gate = assertSetupSecret(request);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, message: gate.message },
      { status: gate.status },
    );
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
