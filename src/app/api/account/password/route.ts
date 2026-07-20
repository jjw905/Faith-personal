import { NextResponse } from "next/server";

import { isValidPassword } from "@/lib/auth-validation";
import { hashPassword, verifyPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";
import { enforceAuthRateLimit } from "@/lib/rate-limit";
import { requireUser } from "@/lib/require-user";

export async function PATCH(request: Request) {
  const limited = enforceAuthRateLimit(request, "password-change", 10, 60_000);
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

  const data =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const currentPassword =
    typeof data.currentPassword === "string" ? data.currentPassword : "";
  const newPassword = typeof data.newPassword === "string" ? data.newPassword : "";
  const newPasswordConfirm =
    typeof data.newPasswordConfirm === "string" ? data.newPasswordConfirm : "";

  if (!isValidPassword(newPassword)) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "비밀번호는 8~72자, 영문 대소문자와 특수문자를 각각 1자 이상 포함해야 합니다.",
      },
      { status: 400 },
    );
  }
  if (newPassword !== newPasswordConfirm) {
    return NextResponse.json(
      { ok: false, message: "새 비밀번호 확인이 일치하지 않습니다." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ ok: false, message: "사용자 없음" }, { status: 404 });
  }

  if (user.passwordHash) {
    if (!currentPassword) {
      return NextResponse.json(
        { ok: false, message: "현재 비밀번호를 입력해 주세요." },
        { status: 400 },
      );
    }
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) {
      return NextResponse.json(
        { ok: false, message: "현재 비밀번호가 올바르지 않습니다." },
        { status: 400 },
      );
    }
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash },
  });

  return NextResponse.json({ ok: true });
}
