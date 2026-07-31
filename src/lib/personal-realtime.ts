import "server-only";

import { prisma } from "@/lib/prisma";

export const PERSONAL_REALTIME_MAX_PARTICIPANTS = 4;
export const PERSONAL_REALTIME_MAX_INVITEES =
  PERSONAL_REALTIME_MAX_PARTICIPANTS - 1;

export type PersonalRealtimeMeetingAccess = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "REMOVED";
  userId: string;
  user: {
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  };
  joinedAt: Date | null;
};

export async function getPersonalRealtimeMeeting(meetingId: string) {
  return prisma.personalRealtimeMeeting.findUnique({
    where: { id: meetingId },
    include: {
      owner: {
        select: { id: true, name: true, handle: true, image: true },
      },
      access: {
        include: {
          user: {
            select: { id: true, name: true, handle: true, image: true },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export function isPersonalRealtimeParticipant(params: {
  meeting: {
    ownerId: string;
    access: Array<{ userId: string; status: string }>;
  };
  userId: string;
}) {
  return (
    params.meeting.ownerId === params.userId ||
    params.meeting.access.some(
      (access) =>
        access.userId === params.userId && access.status === "ACCEPTED",
    )
  );
}

export function acceptedPersonalRealtimeParticipantCount(meeting: {
  ownerId: string;
  access: Array<{ status: string }>;
}) {
  return Math.max(
    1,
    meeting.access.filter((access) => access.status === "ACCEPTED").length,
  );
}

export function personalRealtimeHref(meetingId: string) {
  return `/meetings/live/${encodeURIComponent(meetingId)}`;
}
