import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

import { withAuthTiming } from "@/lib/auth-timing";
import { isValidEmail } from "@/lib/auth-validation";
import { storeResetToken } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { enforceAuthDualRateLimit } from "@/lib/rate-limit";
import { isResendConfigured, sendPasswordResetEmail } from "@/lib/resend-mail";

const UNIFORM_MESSAGE = "가입된 이메일이면 재설정 안내를 보냈습니다.";

export async function POST(request: Request) {
  return withAuthTiming(480, async () => {
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
      typeof data.email === "string" ? data.email.trim().toLowerCase() : "";

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, message: "올바른 이메일을 입력해 주세요." },
        { status: 400 },
      );
    }

    const limited = enforceAuthDualRateLimit(request, "forgot-password", {
      ipLimit: 5,
      ipWindowMs: 60_000,
      email,
      emailLimit: 3,
      emailWindowMs: 15 * 60_000,
    });
    if (limited) return limited;

    const mailEnabled = isResendConfigured();

    if (!mailEnabled) {
      return NextResponse.json({
        ok: true,
        mailEnabled: false,
        message:
          "현재 이메일 재설정 기능을 사용할 수 없습니다. 관리자에게 문의해 주세요.",
      });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, passwordHash: true, disabled: true },
      });

      if (user && !user.disabled && user.passwordHash) {
        const raw = randomBytes(32).toString("base64url");
        await storeResetToken(email, raw);
        await sendPasswordResetEmail(email, raw);
      }
    } catch (err) {
      console.error(
        "[forgot-password]",
        err instanceof Error ? err.message.slice(0, 300) : err,
      );
    }

    return NextResponse.json({
      ok: true,
      mailEnabled: true,
      message: UNIFORM_MESSAGE,
    });
  });
}
