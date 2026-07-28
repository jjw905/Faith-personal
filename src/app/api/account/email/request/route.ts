import { NextResponse } from "next/server";

import { withAuthTiming } from "@/lib/auth-timing";
import { isEmailTaken } from "@/lib/auth-store";
import { isValidEmail, normalizeAuthEmail } from "@/lib/auth-validation";
import { isDisposableEmailDomain } from "@/lib/disposable-email";
import { generateOtpCode, storeOtp } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { beginMailSendLimits } from "@/lib/rate-limit";
import { AUTH_MAIL_CHECK } from "@/lib/auth-messages";
import { requireUser } from "@/lib/require-user";
import { sendEmailChangeOtp } from "@/lib/resend-mail";

const UNIFORM_OK = AUTH_MAIL_CHECK;

export async function POST(request: Request) {
  return withAuthTiming(450, async () => {
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

    const newEmail =
      typeof body === "object" &&
      body !== null &&
      "email" in body &&
      typeof (body as { email: unknown }).email === "string"
        ? normalizeAuthEmail((body as { email: string }).email)
        : "";

    if (!isValidEmail(newEmail)) {
      return NextResponse.json(
        { ok: false, message: "올바른 이메일을 입력해 주세요." },
        { status: 400 },
      );
    }

    if (isDisposableEmailDomain(newEmail)) {
      return NextResponse.json(
        { ok: false, message: "이 이메일은 사용할 수 없습니다." },
        { status: 400 },
      );
    }

    if (newEmail === normalizeAuthEmail(session.user.email || "")) {
      return NextResponse.json(
        { ok: false, message: "현재 이메일과 동일합니다." },
        { status: 400 },
      );
    }

    const gate = await beginMailSendLimits(
      request,
      "email-change-request",
      newEmail,
      { emailPerDay: 5, ipPerHour: 10 },
    );
    if (!gate.ok) return gate.response;

    // OWASP: 존재 여부 비공개 — taken이어도 동일 성공 응답, 메일만 생략
    if (await isEmailTaken(newEmail)) {
      await gate.commitCooldown();
      return NextResponse.json({ ok: true, message: UNIFORM_OK });
    }

    const code = generateOtpCode();
    const identifier = `email-change:${session.user.id}:${newEmail}`;
    await storeOtp(identifier, code);
    const sent = await sendEmailChangeOtp(newEmail, code);
    if (!sent.ok) {
      await gate.rollback();
      await prisma.verificationToken
        .deleteMany({ where: { identifier } })
        .catch(() => undefined);
      return NextResponse.json(
        {
          ok: false,
          message:
            sent.reason === "missing_key"
              ? "메일 서비스가 비활성화되어 있습니다. 이메일 변경은 나중에 이용해 주세요."
              : "안내 발송에 실패했습니다.",
        },
        { status: sent.reason === "missing_key" ? 503 : 500 },
      );
    }

    await gate.commitCooldown();
    return NextResponse.json({ ok: true, message: UNIFORM_OK });
  });
}
