import "server-only";

import { getUserMeeting } from "@/lib/user-meetings-store";
import type { Meeting } from "@/types/meeting";
import type { MeetingTranscript } from "@/types/transcript";

const SAMPLE_POOL = [
  "/samples/audio/meeting-summary-noise30.wav",
  "/samples/audio/meeting-intro-noise30.wav",
  "/samples/audio/meeting-action-noise30.wav",
  "/samples/audio/meeting-cafe-noise30.wav",
  "/samples/audio/meeting-pii-noise30.wav",
] as const;

const SAMPLE_BY_NAME = new Map(
  SAMPLE_POOL.map((src) => [src.split("/").pop()!, src]),
);

function pickSample(meetingId: string): string {
  let hash = 0;
  for (let i = 0; i < meetingId.length; i++) {
    hash = (hash + meetingId.charCodeAt(i) * (i + 1)) % 997;
  }
  return SAMPLE_POOL[hash % SAMPLE_POOL.length]!;
}

function attachmentSampleSrc(transcript: MeetingTranscript): string | null {
  for (const line of transcript.lines) {
    const name = line.attachment?.name;
    if (!name) continue;
    const hit = SAMPLE_BY_NAME.get(name);
    if (hit) return hit;
  }
  return null;
}

/**
 * 대화기록 다시듣기용 오디오 URL.
 * 보관함 파일 우선, 없으면 첨부/샘플.
 */
export function resolveMeetingReplayAudio(input: {
  meeting: Meeting;
  transcript: MeetingTranscript;
}): { src: string; label: string } | null {
  const { meeting, transcript } = input;
  const row = getUserMeeting(meeting.id);
  if (row?.vaultFileId) {
    return {
      src: `/api/vault/${row.vaultFileId}/content`,
      label: "회의 녹음",
    };
  }

  const fromAttachment = attachmentSampleSrc(transcript);
  if (fromAttachment) {
    return {
      src: fromAttachment,
      label: fromAttachment.split("/").pop() || "회의 녹음",
    };
  }

  return { src: pickSample(meeting.id), label: "회의 녹음" };
}
