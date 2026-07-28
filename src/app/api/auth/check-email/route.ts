import { NextResponse } from "next/server";

import { withAuthTiming } from "@/lib/auth-timing";
import { isValidEmail, normalizeAuthEmail } from "@/lib/auth-validation";
import { enforceAuthDualRateLimit } from "@/lib/rate-limit";

/**
 * 이메일 존재 오라클 제거.
 * 하위 호환을 위해 엔드포인트는 유지하되 available을 반환하지 않는다.
 */
export async function POST(request: Request) {
  return withAuthTiming(400, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, message: "요청 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const email =
      typeof body === "object" &&
      body !== null &&
      "email" in body &&
      typeof (body as { email: unknown }).email === "string"
        ? normalizeAuthEmail((body as { email: string }).email)
        : "";

    if (!email) {
      return NextResponse.json(
        { ok: false, message: "이메일을 입력해 주세요." },
        { status: 400 },
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, message: "올바른 이메일 형식이 아닙니다." },
        { status: 400 },
      );
    }

    const limited = enforceAuthDualRateLimit(request, "check-email", {
      ipLimit: 10,
      ipWindowMs: 60_000,
      email,
      emailLimit: 3,
      emailWindowMs: 15 * 60_000,
    });
    if (limited) return limited;

    return NextResponse.json({
      ok: true,
      message: "요청을 접수했습니다.",
    });
  });
}
