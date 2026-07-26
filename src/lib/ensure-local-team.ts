import { Plan, Role, TeamRole } from "@prisma/client";

import {
  LOCAL_DEV_ADMIN_EMAIL,
  LOCAL_DEV_ADMIN_PASSWORD,
  ensureLocalDevAdmin,
} from "@/lib/ensure-admin";
import { hashPassword } from "@/lib/password";
import { prisma } from "@/lib/prisma";

export const LOCAL_DEV_TEAM_NAME = "제품기획팀";
const LEGACY_TEAM_NAMES = ["Faith 역할 실험팀"];

const TEAM_ACCOUNTS = [
  {
    email: "faith-team-leader@faith.local",
    name: "김서연",
    handle: "faith-team-leader",
    inviteCode: "LEADTEST",
    teamRole: TeamRole.ADMIN,
    canInvite: true,
    canCreateMeeting: true,
    canManageRecordAccess: true,
  },
  {
    email: "faith-team-member1@faith.local",
    name: "이준호",
    handle: "faith-team-member1",
    inviteCode: "MEMBTEST1",
    teamRole: TeamRole.MEMBER,
    canInvite: false,
    canCreateMeeting: false,
    canManageRecordAccess: false,
  },
  {
    email: "faith-team-member2@faith.local",
    name: "박지민",
    handle: "faith-team-member2",
    inviteCode: "MEMBTEST2",
    teamRole: TeamRole.MEMBER,
    canInvite: false,
    canCreateMeeting: false,
    canManageRecordAccess: false,
  },
] as const;

/** 예전 단독 대표 계정. 시드 시 멤버로 유지하거나 대표에서 교체. */
const LEGACY_OWNER_EMAIL = "faith-team-owner@faith.local";

function localDevPassword() {
  return (
    process.env.TEAM_SEED_PASSWORD?.trim() ||
    process.env.ADMIN_SEED_PASSWORD?.trim() ||
    LOCAL_DEV_ADMIN_PASSWORD
  );
}

/**
 * 로컬 어드민을 제품기획팀 대표로 두고 팀장·팀원 계정을 채운다.
 * 비프로덕션 전용.
 */
export async function ensureLocalDevProductTeam() {
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false as const,
      message: "production에서는 로컬 팀을 만들지 않습니다.",
    };
  }

  const adminResult = await ensureLocalDevAdmin();
  if (!adminResult.ok) {
    return adminResult;
  }

  const password = localDevPassword();
  const passwordHash = await hashPassword(password);

  const owner = await prisma.user.upsert({
    where: { email: LOCAL_DEV_ADMIN_EMAIL },
    create: {
      email: LOCAL_DEV_ADMIN_EMAIL,
      name: "Faith Admin",
      handle: "faith-admin",
      inviteCode: "ADMTEST",
      role: Role.ADMIN,
      plan: Plan.PRO,
      emailVerified: new Date(),
      passwordHash,
      signupProvider: "credentials",
      disabled: false,
      teamEntitlement: {
        create: { remainingTeamSlots: 2, seatLimit: 10 },
      },
    },
    update: {
      name: "Faith Admin",
      handle: "faith-admin",
      role: Role.ADMIN,
      plan: Plan.PRO,
      emailVerified: new Date(),
      passwordHash,
      disabled: false,
    },
  });

  await prisma.teamEntitlement.upsert({
    where: { userId: owner.id },
    create: { userId: owner.id, remainingTeamSlots: 2, seatLimit: 10 },
    update: { remainingTeamSlots: 2, seatLimit: 10 },
  });

  let team = await prisma.team.findFirst({
    where: {
      OR: [
        { name: LOCAL_DEV_TEAM_NAME },
        { name: { in: LEGACY_TEAM_NAMES } },
        { ownerId: owner.id },
        { owner: { email: LEGACY_OWNER_EMAIL } },
      ],
    },
    orderBy: { createdAt: "asc" },
  });

  if (!team) {
    team = await prisma.team.create({
      data: {
        name: LOCAL_DEV_TEAM_NAME,
        slug: `product-planning-${Date.now().toString(36)}`,
        ownerId: owner.id,
        seatLimit: 10,
        members: {
          create: {
            userId: owner.id,
            role: TeamRole.OWNER,
            canInvite: true,
            canCreateMeeting: true,
            canManageRecordAccess: true,
          },
        },
        policy: { create: {} },
      },
    });
  } else {
    team = await prisma.team.update({
      where: { id: team.id },
      data: {
        name: LOCAL_DEV_TEAM_NAME,
        ownerId: owner.id,
        seatLimit: Math.max(team.seatLimit, 10),
      },
    });
  }

  await prisma.teamMember.upsert({
    where: {
      teamId_userId: { teamId: team.id, userId: owner.id },
    },
    create: {
      teamId: team.id,
      userId: owner.id,
      role: TeamRole.OWNER,
      canInvite: true,
      canCreateMeeting: true,
      canManageRecordAccess: true,
    },
    update: {
      role: TeamRole.OWNER,
      canInvite: true,
      canCreateMeeting: true,
      canManageRecordAccess: true,
    },
  });

  // 예전 대표 계정이 남아 있으면 팀원으로 내린다 (로그인 테스트용).
  const legacyOwner = await prisma.user.findUnique({
    where: { email: LEGACY_OWNER_EMAIL },
    select: { id: true },
  });
  if (legacyOwner && legacyOwner.id !== owner.id) {
    await prisma.teamMember.upsert({
      where: {
        teamId_userId: { teamId: team.id, userId: legacyOwner.id },
      },
      create: {
        teamId: team.id,
        userId: legacyOwner.id,
        role: TeamRole.MEMBER,
        canInvite: false,
        canCreateMeeting: false,
        canManageRecordAccess: false,
      },
      update: {
        role: TeamRole.MEMBER,
        canInvite: false,
        canCreateMeeting: false,
        canManageRecordAccess: false,
      },
    });
  }

  const seeded: Array<{ email: string; teamRole: TeamRole }> = [
    { email: owner.email!, teamRole: TeamRole.OWNER },
  ];

  for (const account of TEAM_ACCOUNTS) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        email: account.email,
        name: account.name,
        handle: account.handle,
        inviteCode: account.inviteCode,
        role: Role.USER,
        plan: Plan.PRO,
        emailVerified: new Date(),
        passwordHash,
        signupProvider: "credentials",
        disabled: false,
      },
      update: {
        name: account.name,
        handle: account.handle,
        inviteCode: account.inviteCode,
        plan: Plan.PRO,
        emailVerified: new Date(),
        passwordHash,
        disabled: false,
      },
    });

    await prisma.teamMember.upsert({
      where: {
        teamId_userId: { teamId: team.id, userId: user.id },
      },
      create: {
        teamId: team.id,
        userId: user.id,
        role: account.teamRole,
        canInvite: account.canInvite,
        canCreateMeeting: account.canCreateMeeting,
        canManageRecordAccess: account.canManageRecordAccess,
      },
      update: {
        role: account.teamRole,
        canInvite: account.canInvite,
        canCreateMeeting: account.canCreateMeeting,
        canManageRecordAccess: account.canManageRecordAccess,
      },
    });

    seeded.push({ email: account.email, teamRole: account.teamRole });
  }

  const memberCount = await prisma.teamMember.count({
    where: { teamId: team.id },
  });

  return {
    ok: true as const,
    teamId: team.id,
    teamName: team.name,
    ownerEmail: LOCAL_DEV_ADMIN_EMAIL,
    password,
    memberCount,
    seeded,
  };
}
