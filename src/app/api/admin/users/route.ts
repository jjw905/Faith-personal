import { NextResponse } from "next/server";
import type { Plan, Role } from "@prisma/client";

import { auth } from "@/auth";
import {
  countAdmins,
  countUserStats,
  listUsersPage,
  type UserListFilter,
  type UserListSort,
} from "@/lib/admin";
import { writeAdminAudit } from "@/lib/admin-audit";
import { prisma } from "@/lib/prisma";

const ADMIN_SECURITY_PHRASE = "관리자 변경";
const REASON_MIN_LENGTH = 15;

function hasConsecutiveSameChars(value: string): boolean {
  for (let i = 1; i < value.length; i += 1) {
    if (value[i] === value[i - 1]) return true;
  }
  return false;
}

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

function parseFilter(value: string | null): UserListFilter {
  if (
    value === "admin" ||
    value === "pro" ||
    value === "paused" ||
    value === "noteam" ||
    value === "all"
  ) {
    return value;
  }
  return "all";
}

function parseSort(value: string | null): UserListSort {
  if (value === "asc" || value === "desc") {
    return value;
  }
  return "desc";
}

function parseUntil(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function serializeUser(
  user: Awaited<ReturnType<typeof listUsersPage>>["users"][number],
) {
  return {
    ...user,
    createdAt: user.createdAt.toISOString(),
    planUntil: user.planUntil ? user.planUntil.toISOString() : null,
    disabledUntil: user.disabledUntil
      ? user.disabledUntil.toISOString()
      : null,
  };
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? undefined;
  const filter = parseFilter(url.searchParams.get("filter"));
  const sort = parseSort(url.searchParams.get("sort"));
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "9");

  const [pageResult, stats] = await Promise.all([
    listUsersPage({
      q,
      filter,
      sort,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    }),
    countUserStats(),
  ]);

  return NextResponse.json({
    ok: true,
    users: pageResult.users.map(serializeUser),
    total: pageResult.total,
    page: pageResult.page,
    pageSize: pageResult.pageSize,
    stats,
  });
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
    select: {
      role: true,
      plan: true,
      disabled: true,
      planUntil: true,
      disabledUntil: true,
      teamEntitlement: {
        select: { remainingTeamSlots: true, seatLimit: true },
      },
    },
  });
  if (!target) {
    return NextResponse.json(
      { ok: false, message: "사용자 없음" },
      { status: 404 },
    );
  }

  const patch: {
    role?: Role;
    plan?: Plan;
    disabled?: boolean;
    planUntil?: Date | null;
    disabledUntil?: Date | null;
  } = {};
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
  const reason =
    typeof data.reason === "string" ? data.reason.trim() : "";
  const until = parseUntil(data.until);
  const adminConfirm =
    typeof data.adminConfirm === "string" ? data.adminConfirm.trim() : "";

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

  const changingPlan =
    patch.plan !== undefined && patch.plan !== target.plan;
  const changingRole =
    patch.role !== undefined && patch.role !== target.role;
  const changingDisabled =
    patch.disabled !== undefined && patch.disabled !== target.disabled;
  const sensitive =
    changingPlan || changingRole || changingDisabled;

  if (sensitive) {
    if (reason.length < REASON_MIN_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          message: `변경 사유는 ${REASON_MIN_LENGTH}자 이상 입력하세요.`,
        },
        { status: 400 },
      );
    }
    if (hasConsecutiveSameChars(reason)) {
      return NextResponse.json(
        {
          ok: false,
          message: "같은 글자나 특수문자를 연속으로 입력할 수 없습니다.",
        },
        { status: 400 },
      );
    }
  }

  if (changingPlan) {
    if (patch.plan === "PRO") {
      if (!until || until.getTime() <= Date.now()) {
        return NextResponse.json(
          { ok: false, message: "PRO 부여 기간(종료일)이 필요합니다." },
          { status: 400 },
        );
      }
      patch.planUntil = until;
    } else {
      // FREE 수동 지정: 즉시 확정, 자동 복원 없음. 기간 불필요.
      patch.planUntil = null;
    }
  }

  if (changingDisabled && patch.disabled === true) {
    if (!until || until.getTime() <= Date.now()) {
      return NextResponse.json(
        { ok: false, message: "정지 기간(종료일)이 필요합니다." },
        { status: 400 },
      );
    }
    patch.disabledUntil = until;
  }
  if (changingDisabled && patch.disabled === false) {
    patch.disabledUntil = null;
  }

  if (
    changingRole &&
    (patch.role === "ADMIN" || target.role === "ADMIN") &&
    adminConfirm !== ADMIN_SECURITY_PHRASE
  ) {
    return NextResponse.json(
      {
        ok: false,
        message: `관리자 역할 변경은 「${ADMIN_SECURITY_PHRASE}」 입력이 필요합니다.`,
      },
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
          message: "마지막 관리자는 강등하거나 정지할 수 없습니다.",
        },
        { status: 400 },
      );
    }
  }

  const actorId = session.user.id;
  const updated = await prisma.$transaction(async (tx) => {
    let entitlementAfter: {
      teamSlots: number | null;
      teamSeatLimit: number | null;
    } | null = null;

    if (teamSlots !== undefined || teamSeatLimit !== undefined) {
      const entitlement = await tx.teamEntitlement.upsert({
        where: { userId },
        create: {
          userId,
          remainingTeamSlots: teamSlots ?? 0,
          seatLimit: teamSeatLimit ?? 0,
          grantedById: session.user.id,
        },
        update: {
          ...(teamSlots !== undefined
            ? { remainingTeamSlots: teamSlots }
            : {}),
          ...(teamSeatLimit !== undefined ? { seatLimit: teamSeatLimit } : {}),
          grantedById: session.user.id,
        },
        select: { remainingTeamSlots: true, seatLimit: true },
      });
      entitlementAfter = {
        teamSlots: entitlement.remainingTeamSlots,
        teamSeatLimit: entitlement.seatLimit,
      };
    }

    const user = await tx.user.update({
      where: { id: userId },
      data: patch,
      select: {
        id: true,
        name: true,
        email: true,
        handle: true,
        role: true,
        plan: true,
        disabled: true,
        planUntil: true,
        disabledUntil: true,
        signupProvider: true,
        image: true,
        createdAt: true,
        teamEntitlement: {
          select: { remainingTeamSlots: true, seatLimit: true },
        },
        accounts: { select: { provider: true } },
        teamMemberships: {
          take: 5,
          orderBy: { joinedAt: "desc" },
          select: {
            role: true,
            team: { select: { name: true, slug: true } },
          },
        },
        _count: { select: { teamMemberships: true } },
      },
    });

    const auditJobs: Promise<unknown>[] = [];
    if (changingPlan) {
      auditJobs.push(
        writeAdminAudit({
          db: tx,
          actorId,
          targetUserId: userId,
          action: "user.plan",
          metadata: {
            before: target.plan,
            after: patch.plan,
            reason,
            until:
              patch.plan === "PRO" ? (until?.toISOString() ?? null) : null,
          },
          request,
        }),
      );
    }
    if (changingRole) {
      auditJobs.push(
        writeAdminAudit({
          db: tx,
          actorId,
          targetUserId: userId,
          action: "user.role",
          metadata: {
            before: target.role,
            after: patch.role,
            reason,
          },
          request,
        }),
      );
    }
    if (changingDisabled) {
      auditJobs.push(
        writeAdminAudit({
          db: tx,
          actorId,
          targetUserId: userId,
          action: "user.disabled",
          metadata: {
            before: target.disabled,
            after: patch.disabled,
            reason,
            until: until?.toISOString() ?? null,
          },
          request,
        }),
      );
    }
    if (entitlementAfter) {
      const beforeSlots = target.teamEntitlement?.remainingTeamSlots ?? null;
      const beforeSeats = target.teamEntitlement?.seatLimit ?? null;
      if (
        beforeSlots !== entitlementAfter.teamSlots ||
        beforeSeats !== entitlementAfter.teamSeatLimit
      ) {
        auditJobs.push(
          writeAdminAudit({
            db: tx,
            actorId,
            targetUserId: userId,
            action: "user.team_entitlement",
            metadata: {
              before: { teamSlots: beforeSlots, teamSeatLimit: beforeSeats },
              after: entitlementAfter,
            },
            request,
          }),
        );
      }
    }
    if (auditJobs.length > 0) {
      await Promise.all(auditJobs);
    }

    return user;
  });

  return NextResponse.json({
    ok: true,
    user: {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      planUntil: updated.planUntil
        ? updated.planUntil.toISOString()
        : null,
      disabledUntil: updated.disabledUntil
        ? updated.disabledUntil.toISOString()
        : null,
    },
  });
}
