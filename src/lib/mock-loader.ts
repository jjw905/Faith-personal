import meetingsData from "@/mocks/meetings.json";
import meetingTimelinesData from "@/mocks/meeting-timelines.json";
import meetingTranscriptsData from "@/mocks/meeting-transcripts.json";
import notificationsData from "@/mocks/notifications.json";
import securityMetricsData from "@/mocks/security-metrics.json";
import { resolveDateFromDaysAgo } from "@/lib/meeting-date";
import type { SecurityMetricsData } from "@/types/dashboard";
import type { Meeting } from "@/types/meeting";
import type { AppNotification } from "@/types/notification";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";
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

export function getSecurityMetrics(): SecurityMetricsData {
  return securityMetricsData as SecurityMetricsData;
}

export function getNotifications(): AppNotification[] {
  return notificationsData.items as AppNotification[];
}

export function getMeetingTimeline(meetingId: string): MeetingTimeline {
  const map = meetingTimelinesData.timelines as Record<string, MeetingTimeline>;
  const found = map[meetingId] ?? map.default;
  return { ...found, meetingId };
}

export function getMeetingTranscript(meetingId: string): MeetingTranscript {
  const map = meetingTranscriptsData.transcripts as Record<
    string,
    MeetingTranscript
  >;
  const found = map[meetingId] ?? map.default;
  return { ...found, meetingId };
}
