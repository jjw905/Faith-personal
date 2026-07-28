import { NextResponse } from "next/server";

import { withAuthTiming } from "@/lib/auth-timing";
import { isValidEmail, normalizeAuthEmail } from "@/lib/auth-validation";
import {
  consumeOtp,
  generateSignupProof,
  hashSignupProof,
  SIGNUP_PROOF_COOKIE,
  SIGNUP_PROOF_COOKIE_MAX_AGE_SEC,
  signupOtpIdentifier,
  storeSignupProof,
} from "@/lib/otp";
import { enforceAuthDualRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  return withAuthTiming(350, async () => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
    }

    const data =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>)
        : {};
    const email =
      typeof data.email === "string" ? normalizeAuthEmail(data.email) : "";
    const code = typeof data.code === "string" ? data.code.trim() : "";

    if (!isValidEmail(email) || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { ok: false, message: "이메일과 6자리 인증번호를 확인해 주세요." },
        { status: 400 },
      );
    }

    const limited = enforceAuthDualRateLimit(request, "signup-verify-confirm", {
      ipLimit: 12,
      ipWindowMs: 60_000,
      email,
      emailLimit: 8,
      emailWindowMs: 15 * 60_000,
    });
    if (limited) return limited;

    const ok = await consumeOtp(signupOtpIdentifier(email), code);
    if (!ok) {
      return NextResponse.json(
        { ok: false, message: "인증번호가 올바르지 않거나 만료되었습니다." },
        { status: 400 },
      );
    }

    const proof = generateSignupProof();
    await storeSignupProof(email, proof);

    const res = NextResponse.json({
      ok: true,
      proof,
      message: "이메일 인증이 완료되었습니다.",
    });
    res.cookies.set(SIGNUP_PROOF_COOKIE, hashSignupProof(proof), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SIGNUP_PROOF_COOKIE_MAX_AGE_SEC,
    });
    return res;
  });
}
