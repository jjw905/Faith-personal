import { NextResponse } from "next/server";

import { isValidEmail } from "@/lib/auth-validation";
import { generateOtpCode, storeOtp } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/require-user";
import { sendEmailChangeOtp } from "@/lib/resend-mail";

export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "email-change-request", 5, 60_000);
  if (limited) return limited;

  const session = await requireUser();
  if (!session) {
    return NextResponse.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 });
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
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";

  if (!isValidEmail(newEmail)) {
    return NextResponse.json(
      { ok: false, message: "올바른 이메일을 입력해 주세요." },
      { status: 400 },
    );
  }

  if (newEmail === (session.user.email || "").toLowerCase()) {
    return NextResponse.json(
      { ok: false, message: "현재 이메일과 동일합니다." },
      { status: 400 },
    );
  }

  const taken = await prisma.user.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (taken) {
    return NextResponse.json(
      { ok: false, message: "이미 사용 중인 이메일입니다." },
      { status: 409 },
    );
  }

  const code = generateOtpCode();
  const identifier = `email-change:${session.user.id}:${newEmail}`;
  await storeOtp(identifier, code);
  const sent = await sendEmailChangeOtp(newEmail, code);
  if (!sent.ok) {
    await prisma.verificationToken.deleteMany({ where: { identifier } }).catch(() => undefined);
    return NextResponse.json(
      {
        ok: false,
        message:
          sent.reason === "missing_key"
            ? "메일 서비스가 비활성화되어 있습니다. 이메일 변경은 나중에 이용해 주세요."
            : "인증번호 발송에 실패했습니다.",
      },
      { status: sent.reason === "missing_key" ? 503 : 500 },
    );
  }

  return NextResponse.json({ ok: true, message: "인증번호를 발송했습니다." });
}
