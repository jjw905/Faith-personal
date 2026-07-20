import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { auth } from "@/auth";
import { isEmailVerified } from "@/lib/auth-store";
import { isValidEmail } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { isResendConfigured, sendVerificationEmail } from "@/lib/resend-mail";

/** 소셜 가입 후 이메일 직접 등록 (Server Action 대신). */
export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "signup-email", 10, 60_000);
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
    return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
  }

  const emailRaw =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim()
      : "";

  if (!isValidEmail(emailRaw)) {
    return NextResponse.json(
      { ok: false, message: "올바른 이메일을 입력해 주세요.", code: "invalid" },
      { status: 400 },
    );
  }
  const email = emailRaw.toLowerCase();

  const taken = await prisma.user.findFirst({
    where: { email, NOT: { id: session.user.id } },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      { ok: false, message: "이미 사용 중인 이메일입니다.", code: "taken" },
      { status: 409 },
    );
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { email },
  });

  const jar = await cookies();
  jar.set("faith.pending-email", email, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  if (!(await isEmailVerified(email))) {
    if (!isResendConfigured()) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { emailVerified: new Date() },
      });
      return NextResponse.json({
        ok: true,
        redirect: "/dashboard",
        emailVerified: true,
      });
    }
    await sendVerificationEmail(email, session.user.name);
  }

  return NextResponse.json({ ok: true, redirect: "/signup/verify" });
}
