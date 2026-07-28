import { NextResponse } from "next/server";

import { withAuthTiming } from "@/lib/auth-timing";
import { isEmailTaken } from "@/lib/auth-store";
import { isValidEmail, normalizeAuthEmail } from "@/lib/auth-validation";
import { consumeOtp } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/require-user";
import { sendEmailChangedNotice } from "@/lib/resend-mail";

export async function POST(request: Request) {
  return withAuthTiming(400, async () => {
    const limited = enforceAuthRateLimit(
      request,
      "email-change-confirm",
      10,
      60_000,
    );
    if (limited) return limited;

    const session = await requireUser();
    if (!session) {
      return NextResponse.json(
        { ok: false, message: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

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
    const newEmail =
      typeof data.email === "string" ? normalizeAuthEmail(data.email) : "";
    const code = typeof data.code === "string" ? data.code.trim() : "";

    if (!isValidEmail(newEmail) || !/^\d{6}$/.test(code)) {
      return NextResponse.json(
        { ok: false, message: "이메일과 6자리 인증번호를 확인해 주세요." },
        { status: 400 },
      );
    }

    const identifier = `email-change:${session.user.id}:${newEmail}`;
    const ok = await consumeOtp(identifier, code);
    if (!ok) {
      return NextResponse.json(
        { ok: false, message: "인증번호가 올바르지 않거나 만료되었습니다." },
        { status: 400 },
      );
    }

    if (await isEmailTaken(newEmail)) {
      return NextResponse.json(
        { ok: false, message: "이 이메일은 사용할 수 없습니다." },
        { status: 409 },
      );
    }

    const oldEmail = normalizeAuthEmail(session.user.email || "");

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        email: newEmail,
        emailVerified: new Date(),
      },
    });

    if (oldEmail && oldEmail !== newEmail) {
      void sendEmailChangedNotice(oldEmail, newEmail).catch(() => undefined);
    }

    return NextResponse.json({ ok: true, email: newEmail });
  });
}
