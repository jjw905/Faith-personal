import { NextResponse } from "next/server";

import { requireUser } from "@/lib/require-user";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request) {
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

  const name =
    typeof body === "object" &&
    body !== null &&
    "name" in body &&
    typeof (body as { name: unknown }).name === "string"
      ? (body as { name: string }).name.trim()
      : "";

  if (!name || name.length > 40) {
    return NextResponse.json(
      { ok: false, message: "이름은 1~40자로 입력해 주세요." },
      { status: 400 },
    );
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data: { name },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ ok: true, user });
}
