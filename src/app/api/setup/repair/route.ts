import { NextResponse } from "next/server";

import { repairAdminIdentity } from "@/lib/account-repair";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { assertSetupSecret } from "@/lib/setup-auth";

/**
 * 어드민 신원 복구 (오승격 강등 + 어드민 시드).
 * Authorization: Bearer <SETUP_SECRET> 필수.
 */
export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "setup-repair", 5, 60_000);
  if (limited) return limited;

  const gate = assertSetupSecret(request);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, message: gate.message },
      { status: gate.status },
    );
  }

  try {
    const result = await repairAdminIdentity();
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        message: err instanceof Error ? err.message.slice(0, 200) : "복구 실패",
      },
      { status: 500 },
    );
  }
}
