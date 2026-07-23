import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  getDevChangelogState,
  normalizeDevState,
  saveDevChangelogState,
} from "@/lib/changelog-store";
import { prisma } from "@/lib/prisma";

async function assertAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { status: 401 as const, ok: false };
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true },
  });
  if (!dbUser || dbUser.disabled || dbUser.role !== "ADMIN") {
    return { status: 403 as const, ok: false };
  }
  return { status: 200 as const, ok: true };
}

export async function GET() {
  const gate = await assertAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, message: gate.status === 401 ? "로그인이 필요합니다." : "권한 없음" },
      { status: gate.status },
    );
  }
  const state = await getDevChangelogState();
  return NextResponse.json({ ok: true, state });
}

export async function PUT(request: Request) {
  const gate = await assertAdmin();
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, message: gate.status === 401 ? "로그인이 필요합니다." : "권한 없음" },
      { status: gate.status },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "잘못된 요청" }, { status: 400 });
  }

  const state = normalizeDevState(body);
  const saved = await saveDevChangelogState(state);
  return NextResponse.json({ ok: true, state: saved });
}
