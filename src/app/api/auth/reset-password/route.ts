import { NextResponse } from "next/server";

import { isValidEmail, isValidPassword } from "@/lib/auth-validation";
import { consumeResetToken } from "@/lib/otp";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { enforceAuthRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = enforceAuthRateLimit(request, "reset-password", 10, 60_000);
  if (limited) return limited;

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
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const token = typeof data.token === "string" ? data.token : "";
  const password = typeof data.password === "string" ? data.password : "";
  const passwordConfirm =
    typeof data.passwordConfirm === "string" ? data.passwordConfirm : "";

  if (!isValidEmail(email) || !token) {
    return NextResponse.json(
      { ok: false, message: "재설정 정보가 올바르지 않습니다." },
      { status: 400 },
    );
  }
  if (!isValidPassword(password)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "비밀번호는 8~72자, 영문 대소문자와 특수문자를 각각 1자 이상 포함해야 합니다.",
      },
      { status: 400 },
    );
  }
  if (password !== passwordConfirm) {
    return NextResponse.json(
      { ok: false, message: "비밀번호 확인이 일치하지 않습니다." },
      { status: 400 },
    );
  }

  const ok = await consumeResetToken(email, token);
  if (!ok) {
    return NextResponse.json(
      { ok: false, message: "링크가 만료되었거나 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.updateMany({
    where: { email },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
