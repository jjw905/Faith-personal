import "server-only";

import { Role } from "@prisma/client";

import { getRecentMeetings as getMockRecentMeetings } from "@/lib/meetings-mock";
import { prisma } from "@/lib/prisma";
import { getTeamFeatureAccess } from "@/lib/team-feature-access";
import { getUserMeeting } from "@/lib/user-meetings-store";

function isCatalogMock(meetingId: string) {
  return getMockRecentMeetings().some((m) => m.id === meetingId);
}

export async function canReadMeeting(meetingId: string, userId: string) {
  const teamMeeting = await prisma.teamMeeting.findFirst({
    where: { OR: [{ id: meetingId }, { legacyMeetingId: meetingId }] },
    include: {
      team: {
        select: {
          ownerId: true,
          policy: { select: { allowAdminUnmask: true } },
          members: {
            where: { userId },
            select: { userId: true, role: true },
            take: 1,
          },
        },
      },
      access: { where: { userId }, take: 1 },
    },
  });
  if (teamMeeting) {
    const teamFeature = await getTeamFeatureAccess(userId);
    if (!teamFeature.ok) {
      return {
        allowed: false,
        teamMeeting: null,
        maskedOnly: false,
        canUnmask: false,
        acknowledgementRequired: false,
      };
    }
    const access = teamMeeting.access[0];
    const member = teamMeeting.team.members[0];
    const isCurrentMember = Boolean(member);
    const isPrivilegedReader =
      teamMeeting.team.ownerId === userId || teamMeeting.createdById === userId;
    const acknowledgementRequired = Boolean(
      isCurrentMember &&
        !isPrivilegedReader &&
        access &&
        !access.acknowledgedAt &&
        (access.isParticipant || access.canReadMasked),
    );
    const canUnmask =
      isCurrentMember &&
      (member.role === "OWNER" || member.role === "ADMIN") &&
      teamMeeting.team.policy?.allowAdminUnmask === true;
    return {
      allowed:
        isCurrentMember &&
        !acknowledgementRequired &&
        (teamMeeting.team.ownerId === userId ||
          teamMeeting.createdById === userId ||
          Boolean(access?.isParticipant || access?.canReadMasked)),
      teamMeeting,
      maskedOnly: Boolean(isCurrentMember && !canUnmask),
      canUnmask,
      acknowledgementRequired,
    };
  }

  const legacy = getUserMeeting(meetingId);
  if (legacy) {
    return {
      allowed: legacy.userId === userId,
      teamMeeting: null,
      maskedOnly: false,
      canUnmask: true,
      acknowledgementRequired: false,
    };
  }

  // 목/카탈로그: 로컬 데모는 로그인 사용자, 프로덕션은 관리자만.
  if (!isCatalogMock(meetingId)) {
    return {
      allowed: false,
      teamMeeting: null,
      maskedOnly: false,
      canUnmask: false,
      acknowledgementRequired: false,
    };
  }
  if (process.env.NODE_ENV !== "production") {
    return {
      allowed: true,
      teamMeeting: null,
      maskedOnly: false,
      canUnmask: true,
      acknowledgementRequired: false,
    };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return {
    allowed: user?.role === Role.ADMIN,
    teamMeeting: null,
    maskedOnly: false,
    canUnmask: true,
    acknowledgementRequired: false,
  };
}
