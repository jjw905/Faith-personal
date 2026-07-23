import meetingsData from "@/mocks/meetings.json";
import { resolveDateFromDaysAgo } from "@/lib/meeting-date";
import type { Meeting } from "@/types/meeting";
import type { WorkspaceId } from "@/lib/workspaces";

type MeetingMock = Omit<Meeting, "date"> & {
  date?: string;
  daysAgo?: number;
  time?: string;
};

function resolveMeeting(raw: MeetingMock): Meeting {
  const { daysAgo, time, date, tags, summaryTags, ...rest } = raw;
  const base = {
    ...rest,
    tags: tags ?? [],
    summaryTags: summaryTags ?? [],
  } as Omit<Meeting, "date">;

  if (typeof daysAgo === "number") {
    return {
      ...base,
      date: resolveDateFromDaysAgo(daysAgo, time ?? "12:00:00"),
    };
  }
  return {
    ...base,
    date: date ?? new Date().toISOString(),
  };
}

export function getRecentMeetings(): Meeting[] {
  return (meetingsData.meetings as MeetingMock[]).map(resolveMeeting);
}

/** 워크스페이스별 회의 목록. */
export function getMeetingsByWorkspace(workspaceId: WorkspaceId): Meeting[] {
  return getRecentMeetings().filter((m) => m.workspace === workspaceId);
}
