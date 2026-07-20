import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

import { auth } from "@/auth";
import { countAdmins, listUsers } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { status: 401 as const, session: null };
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!dbUser || dbUser.disabled || dbUser.role !== "ADMIN") {
    return { status: 403 as const, session: null };
  }
  return { status: 200 as const, session };
}

export async function GET() {
  const gate = await assertAdmin();
  if (!gate.session) {
    return NextResponse.json(
      { ok: false, message: gate.status === 401 ? "로그인이 필요합니다." : "권한 없음" },
      { status: gate.status },
    );
  }
  const users = await listUsers();
  return NextResponse.json({ ok: true, users });
}

export async function PATCH(request: Request) {
  const gate = await assertAdmin();
  if (!gate.session) {
    return NextResponse.json(
      { ok: false, message: gate.status === 401 ? "로그인이 필요합니다." : "권한 없음" },
      { status: gate.status },
    );
  }
  const session = gate.session;

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
  const userId = typeof data.userId === "string" ? data.userId : "";
  if (!userId) {
    return NextResponse.json({ ok: false, message: "userId 필요" }, { status: 400 });
  }
  if (userId === session.user.id) {
    return NextResponse.json(
      { ok: false, message: "본인 계정은 여기서 변경할 수 없습니다." },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, disabled: true },
  });
  if (!target) {
    return NextResponse.json({ ok: false, message: "사용자 없음" }, { status: 404 });
  }

  const patch: { role?: Role; disabled?: boolean } = {};
  if (data.role === "USER" || data.role === "ADMIN") {
    patch.role = data.role;
  }
  if (typeof data.disabled === "boolean") {
    patch.disabled = data.disabled;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, message: "변경 항목 없음" }, { status: 400 });
  }

  const demotingAdmin =
    target.role === "ADMIN" &&
    ((patch.role === "USER") || patch.disabled === true);
  if (demotingAdmin) {
    const admins = await countAdmins();
    if (admins <= 1) {
      return NextResponse.json(
        { ok: false, message: "마지막 관리자는 강등하거나 비활성화할 수 없습니다." },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: patch,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      disabled: true,
      emailVerified: true,
    },
  });

  return NextResponse.json({ ok: true, user: updated });
}
