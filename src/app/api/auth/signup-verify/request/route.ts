import { NextResponse } from "next/server";

import { withAuthTiming } from "@/lib/auth-timing";
import { isEmailTaken } from "@/lib/auth-store";
import { isValidEmail } from "@/lib/auth-validation";
import {
  generateOtpCode,
  signupOtpIdentifier,
  storeOtp,
} from "@/lib/otp";
import { enforceAuthDualRateLimit } from "@/lib/rate-limit";
import {
  isResendConfigured,
  sendSignupOtp,
  sendSignupRequestNotice,
} from "@/lib/resend-mail";

const UNIFORM_OK_MESSAGE =
  "해당 이메일로 안내를 보냈습니다. 메일을 확인해 주세요.";

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

    const limited = enforceAuthDualRateLimit(request, "signup-verify-request", {
      ipLimit: 8,
      ipWindowMs: 60_000,
      email,
      emailLimit: 3,
      emailWindowMs: 15 * 60_000,
    });
    if (limited) return limited;

    let taken = false;
    try {
      taken = await isEmailTaken(email);
    } catch (err) {
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

    // 기가입: OTP 없이 로그인 안내 메일. UI 응답은 신규와 동일.
    if (taken) {
      if (mailEnabled) {
        const sent = await sendSignupRequestNotice(email);
        if (!sent.ok) {
          console.error("[signup-verify/request] signup notice failed");
        }
      } else if (process.env.NODE_ENV !== "production") {
        console.info("[signup-otp] existing account notice (dev, no mail)", email);
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
      console.info("[signup-otp] dev code", email, code);
      return NextResponse.json({
        ok: true,
        message: UNIFORM_OK_MESSAGE,
      });
    }

    const sent = await sendSignupOtp(email, code);
    if (!sent.ok) {
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

    return NextResponse.json({
      ok: true,
      message: UNIFORM_OK_MESSAGE,
    });
  });
}
