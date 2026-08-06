import type { Meeting, MeetingCapture } from "@/types/meeting";

/** 녹음 / 업로드 라벨. M3 list overline용 짧은 단어. */
export const MEETING_CAPTURE_LABEL: Record<MeetingCapture, string> = {
  live: "녹음",
  upload: "업로드",
};

/**
 * 기록 생성 경로.
 * capture 필드 우선, 없으면 업로드 id·태그·STT 벤치 id로 추론.
 */
export function resolveMeetingCapture(
  meeting: Pick<Meeting, "id" | "tags" | "capture">,
): MeetingCapture {
  if (meeting.capture === "live" || meeting.capture === "upload") {
    return meeting.capture;
  }
  if (
    meeting.id.startsWith("mtg-up-") ||
    meeting.id.startsWith("mtg-stt-") ||
    meeting.tags.includes("업로드")
  ) {
    return "upload";
  }
  return "live";
}

export function meetingCaptureLabel(
  meeting: Pick<Meeting, "id" | "tags" | "capture">,
) {
  return MEETING_CAPTURE_LABEL[resolveMeetingCapture(meeting)];
}
