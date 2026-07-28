import { NextResponse } from "next/server";

import { withAuthTiming } from "@/lib/auth-timing";
import { isEmailTaken } from "@/lib/auth-store";
import { isValidEmail, normalizeAuthEmail } from "@/lib/auth-validation";
import { isDisposableEmailDomain } from "@/lib/disposable-email";
import { maskEmail } from "@/lib/mask-email";
import {
  generateOtpCode,
  signupOtpIdentifier,
  storeOtp,
} from "@/lib/otp";
import { beginMailSendLimits } from "@/lib/rate-limit";
import { AUTH_MAIL_CHECK } from "@/lib/auth-messages";
import { verifyRecaptchaToken } from "@/lib/recaptcha";
import {
  isResendConfigured,
  sendSignupOtp,
  sendSignupRequestNotice,
} from "@/lib/resend-mail";

const UNIFORM_OK_MESSAGE = AUTH_MAIL_CHECK;

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

    // OWASP: 임시메일 남용 완화 (계정 존재와 무관한 거절)
    if (isDisposableEmailDomain(email)) {
      return NextResponse.json(
        { ok: false, message: "이 이메일은 사용할 수 없습니다." },
        { status: 400 },
      );
    }

    const captcha = await verifyRecaptchaToken({
      token: captchaToken,
      action: "signup_otp",
    });
    if (!captcha.ok) {
      return NextResponse.json(
        { ok: false, message: captcha.message },
        { status: 400 },
      );
    }

    const gate = await beginMailSendLimits(
      request,
      "signup-verify-request",
      email,
    );
    if (!gate.ok) return gate.response;

    let taken = false;
    try {
      taken = await isEmailTaken(email);
    } catch (err) {
      await gate.rollback();
      console.error(
        "[signup-verify/request] email check",
        err instanceof Error ? err.message.slice(0, 300) : err,
      );
      return NextResponse.json(
        { ok: false, message: "잠시 후 다시 시도해 주세요." },
        { status: 503 },
      );
    }

    const mailEnabled = isResendConfigured();

    if (taken) {
      if (mailEnabled) {
        const sent = await sendSignupRequestNotice(email);
        if (!sent.ok) {
          await gate.rollback();
          console.error("[signup-verify/request] signup notice failed");
          return NextResponse.json(
            {
              ok: false,
              message: "안내 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
            },
            { status: 500 },
          );
        }
        await gate.commitCooldown();
      } else if (process.env.NODE_ENV !== "production") {
        console.info(
          "[signup-otp] existing account notice (dev, no mail)",
          maskEmail(email),
        );
        await gate.commitCooldown();
      } else {
        await gate.commitCooldown();
      }
      return NextResponse.json({
        ok: true,
        message: UNIFORM_OK_MESSAGE,
      });
    }

    const code = generateOtpCode();
    await storeOtp(signupOtpIdentifier(email), code);

    if (!mailEnabled) {
      if (process.env.NODE_ENV === "production") {
        await gate.rollback();
        const { prisma } = await import("@/lib/prisma");
        await prisma.verificationToken
          .deleteMany({ where: { identifier: signupOtpIdentifier(email) } })
          .catch(() => undefined);
        return NextResponse.json(
          {
            ok: false,
            message:
              "메일 서비스가 비활성화되어 있습니다. 잠시 후 다시 시도해 주세요.",
          },
          { status: 503 },
        );
      }
      console.info("[signup-otp] dev code", maskEmail(email), code);
      await gate.commitCooldown();
      return NextResponse.json({
        ok: true,
        message: UNIFORM_OK_MESSAGE,
      });
    }

    const sent = await sendSignupOtp(email, code);
    if (!sent.ok) {
      await gate.rollback();
      const { prisma } = await import("@/lib/prisma");
      await prisma.verificationToken
        .deleteMany({ where: { identifier: signupOtpIdentifier(email) } })
        .catch(() => undefined);
      return NextResponse.json(
        {
          ok: false,
          message: "안내 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.",
        },
        { status: 500 },
      );
    }

    await gate.commitCooldown();
    return NextResponse.json({
      ok: true,
      message: UNIFORM_OK_MESSAGE,
    });
  });
}
