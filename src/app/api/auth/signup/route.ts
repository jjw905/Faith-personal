import { NextResponse } from "next/server";

import { isEmailTaken } from "@/lib/auth-store";
import {
  isValidEmail,
  isValidKoreanName,
  isValidPassword,
} from "@/lib/auth-validation";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/resend-mail";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "요청 형식이 올바르지 않습니다." },
      { status: 400 },
    );
  }

  const data =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const password = typeof data.password === "string" ? data.password : "";
  const passwordConfirm =
    typeof data.passwordConfirm === "string" ? data.passwordConfirm : "";
  const name = typeof data.name === "string" ? data.name.trim() : "";

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, message: "올바른 이메일을 입력해 주세요." },
      { status: 400 },
    );
  }
  if (await isEmailTaken(email)) {
    return NextResponse.json(
      { ok: false, message: "이미 사용 중인 이메일입니다." },
      { status: 409 },
    );
  }
  if (!isValidPassword(password)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "비밀번호는 8자 이상, 영문 대소문자와 특수문자를 각각 1자 이상 포함해야 합니다.",
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
  if (!isValidKoreanName(name)) {
    return NextResponse.json(
      {
        ok: false,
        message: "이름은 정확한 한글 이름(2~5자)으로 입력해 주세요.",
      },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
    },
  });

  await sendVerificationEmail(email, name);

  const res = NextResponse.json({
    ok: true,
    message: "회원가입이 완료되었습니다. 이메일 인증을 진행해 주세요.",
  });
  res.cookies.set("faith.pending-email", email, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24,
    sameSite: "lax",
  });
  return res;
}
