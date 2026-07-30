import { redirect } from "next/navigation";
import { Prisma, Role } from "@prisma/client";

import { auth } from "@/auth";
import { expireManualOverrides } from "@/lib/admin-expire";
import { isPlatformAdminEmail } from "@/lib/platform-admin";
import { prisma } from "@/lib/prisma";

export type UserListFilter = "all" | "admin" | "pro" | "paused" | "noteam";
/** 가입일 기준 */
export type UserListSort = "desc" | "asc";

export type UserListParams = {
  q?: string;
  filter?: UserListFilter;
  sort?: UserListSort;
  page?: number;
  pageSize?: number;
};

const USER_LIST_SELECT = {
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
    orderBy: { joinedAt: "desc" as const },
    select: {
      role: true,
      team: { select: { name: true, slug: true } },
    },
  },
  _count: { select: { teamMemberships: true } },
} satisfies Prisma.UserSelect;

export type ListedUser = Prisma.UserGetPayload<{
  select: typeof USER_LIST_SELECT;
}>;

function buildUserWhere(params: {
  q?: string;
  filter?: UserListFilter;
}): Prisma.UserWhereInput {
  const filter = params.filter ?? "all";
  const q = params.q?.trim();

  const where: Prisma.UserWhereInput = {};

  if (filter === "admin") {
    where.role = Role.ADMIN;
  } else if (filter === "pro") {
    where.role = { not: Role.ADMIN };
    where.plan = "PRO";
  } else if (filter === "paused") {
    where.disabled = true;
  } else if (filter === "noteam") {
    where.role = { not: Role.ADMIN };
    where.teamMemberships = { none: {} };
  }

  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { handle: { contains: q, mode: "insensitive" } },
    ];
  }

  return where;
}

function buildUserOrderBy(
  sort: UserListSort = "desc",
): Prisma.UserOrderByWithRelationInput {
  return { createdAt: sort === "asc" ? "asc" : "desc" };
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, disabled: true, email: true },
  });
  if (!dbUser || dbUser.disabled) {
    redirect("/dashboard");
  }

  if (dbUser.role !== Role.ADMIN) {
    // JWT에만 ADMIN이 남고 DB는 USER인 경우를 정리: 허용 이메일이면 승격, 아니면 차단
    if (isPlatformAdminEmail(dbUser.email)) {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { role: Role.ADMIN },
      });
    } else {
      redirect("/dashboard");
    }
  }

  return session;
}

export async function countUserStats() {
  const [total, admins, pro, paused, noteam] = await Promise.all([
    prisma.user.count({ where: { role: { not: Role.ADMIN } } }),
    prisma.user.count({ where: { role: Role.ADMIN } }),
    prisma.user.count({
      where: { role: { not: Role.ADMIN }, plan: "PRO" },
    }),
    prisma.user.count({
      where: { role: { not: Role.ADMIN }, disabled: true },
    }),
    prisma.user.count({
      where: {
        role: { not: Role.ADMIN },
        teamMemberships: { none: {} },
      },
    }),
  ]);
  return { total, admins, pro, paused, noteam };
}

export async function listUsersPage(params: UserListParams = {}) {
  await expireManualOverrides();

  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 20));
  const page = Math.max(1, params.page ?? 1);
  const where = buildUserWhere({ q: params.q, filter: params.filter });
  const orderBy = buildUserOrderBy(params.sort);

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: USER_LIST_SELECT,
    }),
  ]);

  return { users, total, page, pageSize };
}

/** @deprecated Prefer listUsersPage for paginated admin views. */
export async function listUsers() {
  const { users } = await listUsersPage({ page: 1, pageSize: 1000 });
  return users;
}

export async function countAdmins() {
  return prisma.user.count({ where: { role: "ADMIN", disabled: false } });
}

export type TeamListParams = {
  q?: string;
  /** 이 사용자가 속한 팀만 */
  memberId?: string;
  page?: number;
  pageSize?: number;
};

const TEAM_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  seatLimit: true,
  createdAt: true,
  updatedAt: true,
  owner: {
    select: {
      id: true,
      name: true,
      handle: true,
      email: true,
      disabled: true,
    },
  },
  members: {
    where: { role: { in: ["OWNER", "ADMIN"] } },
    select: {
      role: true,
      user: {
        select: {
          id: true,
          name: true,
          handle: true,
          email: true,
          disabled: true,
        },
      },
    },
  },
  invites: {
    where: { status: "PENDING" as const },
    select: {
      id: true,
      invitedUser: {
        select: {
          email: true,
          name: true,
          handle: true,
        },
      },
    },
  },
  meetings: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { createdAt: true },
  },
  _count: {
    select: {
      members: true,
      meetings: true,
    },
  },
} satisfies Prisma.TeamSelect;

export type ListedTeam = Prisma.TeamGetPayload<{
  select: typeof TEAM_LIST_SELECT;
}>;

/** 운영 메타만. 회의·공지·정책 본문/내용은 포함하지 않음. */
export type AdminTeamOpsContact = {
  id: string;
  role: "OWNER" | "ADMIN";
  name: string | null;
  handle: string | null;
  email: string | null;
  disabled: boolean;
};

export type AdminTeamOpsInvite = {
  email: string | null;
  name: string | null;
  handle: string | null;
};

export type AdminTeamOpsRow = {
  id: string;
  name: string;
  slug: string;
  /** 팀 요금제. 팀은 개인 FREE가 아님. */
  plan: "TEAM";
  seatLimit: number;
  memberCount: number;
  adminCount: number;
  pendingInviteCount: number;
  meetingCount: number;
  lastMeetingAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string | null;
    handle: string | null;
    email: string | null;
    disabled: boolean;
  };
  /** 대표·팀장 연락처. 문의·복구용. */
  managers: AdminTeamOpsContact[];
  /** 수락 대기 초대 대상. 이메일·이름만. */
  pendingInvites: AdminTeamOpsInvite[];
};

function toAdminTeamOpsRow(t: ListedTeam): AdminTeamOpsRow {
  const managers: AdminTeamOpsContact[] = t.members.map((m) => ({
    id: m.user.id,
    role: m.role === "OWNER" ? "OWNER" : "ADMIN",
    name: m.user.name,
    handle: m.user.handle,
    email: m.user.email,
    disabled: m.user.disabled,
  }));
  const pendingInvites: AdminTeamOpsInvite[] = t.invites.map((inv) => ({
    email: inv.invitedUser.email,
    name: inv.invitedUser.name,
    handle: inv.invitedUser.handle,
  }));
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    plan: "TEAM",
    seatLimit: t.seatLimit,
    memberCount: t._count.members,
    adminCount: managers.length,
    pendingInviteCount: pendingInvites.length,
    meetingCount: t._count.meetings,
    lastMeetingAt: t.meetings[0]?.createdAt.toISOString() ?? null,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    owner: {
      id: t.owner.id,
      name: t.owner.name,
      handle: t.owner.handle,
      email: t.owner.email,
      disabled: t.owner.disabled,
    },
    managers,
    pendingInvites,
  };
}

/** 플랫폼 관리자용 팀 목록. 이름·대표·인원 등 운영 메타만. */
export async function listTeamsPage(params: TeamListParams = {}) {
  const pageSize = Math.max(1, Math.min(100, params.pageSize ?? 2));
  const page = Math.max(1, params.page ?? 1);
  const q = params.q?.trim();
  const memberId = params.memberId?.trim();

  const where: Prisma.TeamWhereInput = {};
  if (memberId) {
    where.members = { some: { userId: memberId } };
  }
  if (q) {
    where.AND = [
      {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { slug: { contains: q, mode: "insensitive" } },
          { owner: { name: { contains: q, mode: "insensitive" } } },
          { owner: { handle: { contains: q, mode: "insensitive" } } },
          { owner: { email: { contains: q, mode: "insensitive" } } },
        ],
      },
    ];
  }

  const [total, teams] = await Promise.all([
    prisma.team.count({ where }),
    prisma.team.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: TEAM_LIST_SELECT,
    }),
  ]);

  return {
    teams: teams.map(toAdminTeamOpsRow),
    total,
    page,
    pageSize,
  };
}
