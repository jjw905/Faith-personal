import "server-only";

import { prisma } from "@/lib/prisma";
import { getUserMeeting } from "@/lib/user-meetings-store";

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
  return {
    allowed: !legacy || legacy.userId === userId,
    teamMeeting: null,
    maskedOnly: false,
  };
}
