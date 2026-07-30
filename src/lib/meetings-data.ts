import "server-only";

import {
  getMeetingTimeline as getMockTimeline,
  getMeetingTranscript as getMockTranscript,
} from "@/lib/meeting-content-mock";
import {
  meetingDisplayKeywords,
  meetingTopicKeywords,
} from "@/lib/meeting-keywords";
import {
  getMeetingsByWorkspace as getMockMeetingsByWorkspace,
  getRecentMeetings as getMockRecentMeetings,
} from "@/lib/meetings-mock";
import { keywordsFromSemantic } from "@/lib/stt/semantic-structure";
import {
  getUserMeeting,
  listUserMeetings,
  type UserMeetingRecord,
} from "@/lib/user-meetings-store";
import type { Meeting } from "@/types/meeting";
import { withStructuredTimeline } from "@/lib/meeting-summary";
import type { MeetingTranscript } from "@/types/transcript";
import type { MeetingTimeline, TimelineSegment } from "@/types/timeline";
import type { WorkspaceId } from "@/lib/workspaces";

/** 기존 STT/업로드 등 파이프라인 태그를 내용 키워드로 보강. */
function withContentKeywords(
  meeting: Meeting,
  row?: UserMeetingRecord | null,
): Meeting {
  if (row?.phase === "error" || row?.phase === "empty") {
    return {
      ...meeting,
      status: "completed",
      tags: [],
      summaryTags: [],
    };
  }

  if (row && (row.phase === "transcribing" || row.phase === "structuring")) {
    return {
      ...meeting,
      status: "in_progress",
    };
  }

  const metaOk =
    meetingTopicKeywords(meeting.summaryTags, meeting.tags, 1).length > 0;
  if (metaOk) return meeting;

  const fromSemantic = row?.semantic
    ? keywordsFromSemantic(row.semantic, 5)
    : [];
  const fromDisplay = meetingDisplayKeywords(meeting, 5);
  const keywords = fromSemantic.length > 0 ? fromSemantic : fromDisplay;
  if (keywords.length === 0) return meeting;

  return {
    ...meeting,
    tags: keywords,
    summaryTags: keywords.slice(0, 3),
  };
}

function userMeetingAsMeeting(id: string): Meeting | null {
  const row = getUserMeeting(id);
  if (!row) return null;
  return withContentKeywords(row.meeting, row);
}

/** mock만. 유저 업로드 회의는 getMeetingsForUser로만 합친다. */
export function getRecentMeetings(): Meeting[] {
  return getMockRecentMeetings();
}

export function getMeetingsByWorkspace(workspaceId: WorkspaceId): Meeting[] {
  return getRecentMeetings().filter((m) => m.workspace === workspaceId);
}

export function getMeetingById(meetingId: string): Meeting | null {
  return (
    userMeetingAsMeeting(meetingId) ??
    getMockRecentMeetings().find((m) => m.id === meetingId) ??
    null
  );
}

function enrichSegmentSpeakers(
  timeline: MeetingTimeline,
  transcript: MeetingTranscript,
): MeetingTimeline {
  if (!transcript.lines.length) return timeline;
  const bySegment = new Map<string, Set<string>>();
  for (const line of transcript.lines) {
    if (!line.segmentId || !line.speaker) continue;
    let set = bySegment.get(line.segmentId);
    if (!set) {
      set = new Set();
      bySegment.set(line.segmentId, set);
    }
    set.add(line.speaker);
  }
  if (bySegment.size === 0) return timeline;

  const segments: TimelineSegment[] = timeline.segments.map((seg) => {
    const extra = bySegment.get(seg.id);
    if (!extra || extra.size === 0) return seg;
    const speakers = [...new Set([...(seg.speakers ?? []), ...extra])];
    return { ...seg, speakers };
  });
  return { ...timeline, segments };
}

export function getMeetingTimeline(meetingId: string): MeetingTimeline {
  const row = getUserMeeting(meetingId);
  if (row) {
    if (row.phase === "error" || row.phase === "empty") {
      return {
        ...row.timeline,
        overallSummary:
          row.errorMessage?.trim() ||
          row.timeline.overallSummary ||
          (row.phase === "empty"
            ? "감지된 음성이 없어 저장되지 않았습니다."
            : "처리에 실패했습니다."),
        segments: [],
      };
    }
    const structured = withStructuredTimeline(row.timeline, row.semantic);
    return enrichSegmentSpeakers(structured, row.transcript);
  }
  return getMockTimeline(meetingId);
}

export function getMeetingTranscript(meetingId: string): MeetingTranscript {
  const row = getUserMeeting(meetingId);
  if (row) return row.transcript;
  return getMockTranscript(meetingId);
}

/**
 * 클라이언트/API용: 해당 유저 업로드 회의.
 * 목 회의는 로컬 데모에서만 목록에 섞는다(프로덕션 공유 열람 차단).
 */
export function getMeetingsForUser(
  userId: string,
  workspaceId: WorkspaceId,
): Meeting[] {
  const mocks =
    process.env.NODE_ENV === "production"
      ? []
      : getMockMeetingsByWorkspace(workspaceId);
  const users = listUserMeetings(userId)
    .filter((r) => r.workspace === workspaceId)
    .map((r) => withContentKeywords(r.meeting, r));
  const byId = new Map<string, Meeting>();
  for (const m of mocks) byId.set(m.id, m);
  for (const m of users) byId.set(m.id, m);
  return [...byId.values()]
    .filter((m) => m.status !== "in_progress")
    .sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
}
