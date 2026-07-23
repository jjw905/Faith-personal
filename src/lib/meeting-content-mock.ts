import meetingTimelinesData from "@/mocks/meeting-timelines.json";
import meetingTranscriptsData from "@/mocks/meeting-transcripts.json";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";

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
