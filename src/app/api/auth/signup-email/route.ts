import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isEmailTaken } from "@/lib/auth-store";
import { isValidEmail, normalizeAuthEmail } from "@/lib/auth-validation";
import {
  consumeSignupProof,
  hashSignupProof,
  SIGNUP_PROOF_COOKIE,
} from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { enforceAuthRateLimit } from "@/lib/rate-limit";

/** 소셜 가입 후 이메일 등록. 이메일 OTP 증명 필수. */
export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "signup-email", 5, 15 * 60_000);
  if (limited) return limited;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요합니다.", redirect: "/signup" },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청" },
      { status: 400 },
    );
  }

  const data =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const emailRaw =
    typeof data.email === "string" ? data.email.trim() : "";
  const proof = typeof data.proof === "string" ? data.proof.trim() : "";

  if (!isValidEmail(emailRaw)) {
    return NextResponse.json(
      { ok: false, message: "올바른 이메일을 입력해 주세요.", code: "invalid" },
      { status: 400 },
    );
  }
  const email = normalizeAuthEmail(emailRaw);

  if (!proof) {
    return NextResponse.json(
      {
        ok: false,
        message: "이메일 인증이 필요합니다.",
        code: "proof_required",
      },
      { status: 400 },
    );
  }

  const jar = await cookies();
  const bind = jar.get(SIGNUP_PROOF_COOKIE)?.value;
  if (!bind || bind !== hashSignupProof(proof)) {
    return NextResponse.json(
      {
        ok: false,
        message: "이메일 인증이 만료되었습니다. 다시 인증해 주세요.",
        code: "proof_expired",
      },
      { status: 400 },
    );
  }

  if (await isEmailTaken(email)) {
    const self = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    });
    if (normalizeAuthEmail(self?.email || "") !== email) {
      return NextResponse.json(
        {
          ok: false,
          message: "이 이메일은 사용할 수 없습니다.",
          code: "unavailable",
        },
        { status: 409 },
      );
    }
  }

  const proofOk = await consumeSignupProof(email, proof);
  if (!proofOk) {
    return NextResponse.json(
      {
        ok: false,
        message: "이메일 인증이 만료되었습니다. 다시 인증해 주세요.",
        code: "proof_expired",
      },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { email, emailVerified: new Date() },
  });

  const res = NextResponse.json({
    ok: true,
    redirect: "/dashboard",
  });
  res.cookies.set(SIGNUP_PROOF_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
