import type { TeamMeetingState } from "@prisma/client";

import { isPastDataRetention } from "@/lib/data-retention";

export const TEAM_MEETING_RETENTION_STATES = [
  "ENDED",
  "CANCELED",
  "READY",
  "FAILED",
] as const satisfies readonly TeamMeetingState[];

export type TeamRetentionPreview = {
  teamId: string;
  teamName: string;
  retentionDays: number;
  expiredMeetings: number;
  oldestExpiredAt: string | null;
};

export function normalizedTeamRetentionDays(
  value: number | null | undefined,
) {
  return value === 30 || value === 60 || value === 90 ? value : 90;
}

export function teamMeetingRetentionDate(meeting: {
  createdAt: Date | string;
  endedAt: Date | string | null;
}) {
  return meeting.endedAt ?? meeting.createdAt;
}

export function isTeamMeetingRetentionCandidate(
  meeting: {
    state: string;
    recordingActive?: boolean;
    createdAt: Date | string;
    endedAt: Date | string | null;
  },
  retentionDays: number,
  now = new Date(),
) {
  if (
    !TEAM_MEETING_RETENTION_STATES.includes(
      meeting.state as (typeof TEAM_MEETING_RETENTION_STATES)[number],
    )
  ) {
    return false;
  }
  if (meeting.recordingActive) return false;
  const retainedAt = new Date(teamMeetingRetentionDate(meeting));
  if (Number.isNaN(retainedAt.getTime())) return false;
  return isPastDataRetention(
    retainedAt.toISOString(),
    normalizedTeamRetentionDays(retentionDays),
    now,
  );
}
