import { randomBytes } from "crypto";

import { NextResponse } from "next/server";

import { isValidEmail } from "@/lib/auth-validation";
import { storeResetToken } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/resend-mail";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
  }

  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, message: "올바른 이메일을 입력해 주세요." },
      { status: 400 },
    );
  }

  // 열거 완화: 항상 동일 응답
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true, disabled: true },
  });

  if (user && !user.disabled && user.passwordHash) {
    const raw = randomBytes(32).toString("base64url");
    await storeResetToken(email, raw);
    await sendPasswordResetEmail(email, raw);
  }

  return NextResponse.json({
    ok: true,
    message: "가입된 이메일이면 재설정 안내를 보냈습니다.",
  });
}
