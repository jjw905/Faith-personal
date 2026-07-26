import { NextResponse } from "next/server";
import type { Plan, Role } from "@prisma/client";

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
      {
        ok: false,
        message: gate.status === 401 ? "로그인이 필요합니다." : "권한 없음",
      },
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
      {
        ok: false,
        message: gate.status === 401 ? "로그인이 필요합니다." : "권한 없음",
      },
      { status: gate.status },
    );
  }
  const session = gate.session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "잘못된 요청" },
      { status: 400 },
    );
  }

  const data =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};
  const userId = typeof data.userId === "string" ? data.userId : "";
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "userId 필요" },
      { status: 400 },
    );
  }
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, plan: true, disabled: true },
  });
  if (!target) {
    return NextResponse.json(
      { ok: false, message: "사용자 없음" },
      { status: 404 },
    );
  }

  const patch: { role?: Role; plan?: Plan; disabled?: boolean } = {};
  if (data.role === "USER" || data.role === "ADMIN") {
    patch.role = data.role;
  }
  if (data.plan === "FREE" || data.plan === "PRO") {
    patch.plan = data.plan;
  }
  if (typeof data.disabled === "boolean") {
    patch.disabled = data.disabled;
  }
  const teamSlots =
    typeof data.teamSlots === "number"
      ? Math.max(0, Math.min(20, Math.floor(data.teamSlots)))
      : undefined;
  const teamSeatLimit =
    typeof data.teamSeatLimit === "number"
      ? Math.max(0, Math.min(500, Math.floor(data.teamSeatLimit)))
      : undefined;
  const isSelf = userId === session.user.id;
  if (
    isSelf &&
    (process.env.NODE_ENV !== "development" ||
      patch.role !== undefined ||
      patch.disabled !== undefined)
  ) {
    return NextResponse.json(
      {
        ok: false,
        message:
          process.env.NODE_ENV === "development"
            ? "본인 역할과 상태는 변경할 수 없습니다."
            : "본인 계정은 여기서 변경할 수 없습니다.",
      },
      { status: 400 },
    );
  }
  if (
    teamSlots !== undefined &&
    teamSlots > 0 &&
    (patch.plan ?? target.plan) !== "PRO"
  ) {
    return NextResponse.json(
      { ok: false, message: "팀 슬롯은 PRO 사용자에게만 부여할 수 있습니다." },
      { status: 400 },
    );
  }
  if (teamSlots !== undefined && teamSlots > 0 && (teamSeatLimit ?? 0) < 2) {
    return NextResponse.json(
      { ok: false, message: "팀 좌석은 2개 이상이어야 합니다." },
      { status: 400 },
    );
  }
  if (
    Object.keys(patch).length === 0 &&
    teamSlots === undefined &&
    teamSeatLimit === undefined
  ) {
    return NextResponse.json(
      { ok: false, message: "변경 항목 없음" },
      { status: 400 },
    );
  }

  const demotingAdmin =
    target.role === "ADMIN" &&
    (patch.role === "USER" || patch.disabled === true);
  if (demotingAdmin) {
    const admins = await countAdmins();
    if (admins <= 1) {
      return NextResponse.json(
        {
          ok: false,
          message: "마지막 관리자는 강등하거나 비활성화할 수 없습니다.",
        },
        { status: 400 },
      );
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (teamSlots !== undefined || teamSeatLimit !== undefined) {
      await tx.teamEntitlement.upsert({
        where: { userId },
        create: {
          userId,
          remainingTeamSlots: teamSlots ?? 0,
          seatLimit: teamSeatLimit ?? 0,
          grantedById: session.user.id,
        },
        update: {
          ...(teamSlots !== undefined ? { remainingTeamSlots: teamSlots } : {}),
          ...(teamSeatLimit !== undefined ? { seatLimit: teamSeatLimit } : {}),
          grantedById: session.user.id,
        },
      });
    }
    return tx.user.update({
      where: { id: userId },
      data: patch,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        plan: true,
        disabled: true,
        signupProvider: true,
        image: true,
        createdAt: true,
        teamEntitlement: {
          select: { remainingTeamSlots: true, seatLimit: true },
        },
        accounts: { select: { provider: true } },
      },
    });
  });

  return NextResponse.json({
    ok: true,
    user: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
