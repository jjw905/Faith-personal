import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

import { withAuthTiming } from "@/lib/auth-timing";
import { authEmailLookupOrder } from "@/lib/auth-store";
import { isValidEmail, normalizeAuthEmail } from "@/lib/auth-validation";
import { maskEmail } from "@/lib/mask-email";
import { storeResetToken } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { beginMailSendLimits } from "@/lib/rate-limit";
import {
  AUTH_MAIL_UNAVAILABLE,
  AUTH_RESET_CHECK,
} from "@/lib/auth-messages";
import { verifyRecaptchaToken } from "@/lib/recaptcha";
import { isResendConfigured, sendPasswordResetEmail } from "@/lib/resend-mail";

const UNIFORM_MESSAGE = AUTH_RESET_CHECK;

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
      typeof data.email === "string" ? normalizeAuthEmail(data.email) : "";
    const captchaToken =
      typeof data.captchaToken === "string" ? data.captchaToken : "";

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { ok: false, message: "올바른 이메일을 입력해 주세요." },
        { status: 400 },
      );
    }

    const captcha = await verifyRecaptchaToken({
      token: captchaToken,
      action: "forgot_password",
    });
    if (!captcha.ok) {
      return NextResponse.json(
        { ok: false, message: captcha.message },
        { status: 400 },
      );
    }

    const gate = await beginMailSendLimits(request, "forgot-password", email, {
      emailPerDay: 5,
      ipPerHour: 10,
    });
    if (!gate.ok) return gate.response;

    const mailEnabled = isResendConfigured();

    if (!mailEnabled) {
      await gate.rollback();
      return NextResponse.json({
        ok: true,
        mailEnabled: false,
        message: AUTH_MAIL_UNAVAILABLE,
      });
    }

    try {
      let user: {
        id: string;
        passwordHash: string | null;
        disabled: boolean;
        email: string | null;
      } | null = null;
      for (const candidate of authEmailLookupOrder(email)) {
        user = await prisma.user.findUnique({
          where: { email: candidate },
          select: {
            id: true,
            passwordHash: true,
            disabled: true,
            email: true,
          },
        });
        if (user) break;
      }

      if (user?.email && !user.disabled && user.passwordHash) {
        const raw = randomBytes(32).toString("base64url");
        await storeResetToken(user.email, raw);
        const sent = await sendPasswordResetEmail(user.email, raw);
        if (!sent.ok) {
          await gate.rollback();
          return NextResponse.json({
            ok: true,
            mailEnabled: true,
            message: UNIFORM_MESSAGE,
          });
        }
      }
      await gate.commitCooldown();
    } catch (err) {
      await gate.rollback();
      console.error(
        "[forgot-password]",
        maskEmail(email),
        err instanceof Error ? err.message.slice(0, 300) : err,
      );
      // 존재 여부 비공개: 실패해도 동일 성공 메시지
      return NextResponse.json({
        ok: true,
        mailEnabled: true,
        message: UNIFORM_MESSAGE,
      });
    }

    return NextResponse.json({
      ok: true,
      mailEnabled: true,
      message: UNIFORM_MESSAGE,
    });
  });
}
