import "server-only";

import { Role } from "@prisma/client";

import { getRecentMeetings as getMockRecentMeetings } from "@/lib/meetings-mock";
import { prisma } from "@/lib/prisma";
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
          members: {
            where: { userId },
            select: { userId: true },
            take: 1,
          },
        },
      },
      access: { where: { userId }, take: 1 },
    },
  });
  if (teamMeeting) {
    const access = teamMeeting.access[0];
    const isCurrentMember = teamMeeting.team.members.length > 0;
    return {
      allowed:
        isCurrentMember &&
        (teamMeeting.team.ownerId === userId ||
          teamMeeting.createdById === userId ||
          Boolean(access?.isParticipant || access?.canReadMasked)),
      teamMeeting,
      maskedOnly: Boolean(
        isCurrentMember && access?.canReadMasked && !access?.isParticipant,
      ),
    };
  }

  const legacy = getUserMeeting(meetingId);
  if (legacy) {
    return {
      allowed: legacy.userId === userId,
      teamMeeting: null,
      maskedOnly: false,
    };
  }

  // 목/카탈로그: 로컬 데모는 로그인 사용자, 프로덕션은 관리자만.
  if (!isCatalogMock(meetingId)) {
    return { allowed: false, teamMeeting: null, maskedOnly: false };
  }
  if (process.env.NODE_ENV !== "production") {
    return { allowed: true, teamMeeting: null, maskedOnly: false };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  return {
    allowed: user?.role === Role.ADMIN,
    teamMeeting: null,
    maskedOnly: false,
  };
}
