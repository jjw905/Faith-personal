import { NextResponse } from "next/server";

import { isValidEmail } from "@/lib/auth-validation";
import { consumeOtp } from "@/lib/otp";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

export async function POST(request: Request) {
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

  const data =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const newEmail =
    typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
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

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      email: newEmail,
      emailVerified: new Date(),
    },
  });

  return NextResponse.json({ ok: true, email: newEmail });
}
