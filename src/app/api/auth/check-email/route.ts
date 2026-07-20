import { NextResponse } from "next/server";

import { isEmailTaken } from "@/lib/auth-store";
import { isValidEmail } from "@/lib/auth-validation";

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

  const email =
    typeof body === "object" &&
    body !== null &&
    "email" in body &&
    typeof (body as { email: unknown }).email === "string"
      ? (body as { email: string }).email.trim()
      : "";

  if (!email) {
    return NextResponse.json(
      { ok: false, available: false, message: "이메일을 입력해 주세요." },
      { status: 400 },
    );
  }

  if (!isValidEmail(email)) {
    return NextResponse.json(
      {
        ok: false,
        available: false,
        message: "올바른 이메일 형식이 아닙니다.",
      },
      { status: 400 },
    );
  }

  if (await isEmailTaken(email)) {
    return NextResponse.json({
      ok: true,
      available: false,
      message: "이미 사용 중인 이메일입니다.",
    });
  }

  return NextResponse.json({
    ok: true,
    available: true,
    message: "사용 가능한 이메일입니다.",
  });
}
