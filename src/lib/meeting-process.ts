import type { MeetingProcessPhase } from "@/lib/user-meetings-store";

export type { MeetingProcessPhase };

export const MEETING_PROCESS_LABEL: Record<MeetingProcessPhase, string> = {
  transcribing: "받아쓰는 중이에요",
  structuring: "정리하는 중이에요",
  done: "완료",
  error: "실패",
  empty: "저장되지 않음",
};

/** 확장자 제거. 회의 제목·리스트 표기와 맞춤. */
export function stripFileExtension(name: string): string {
  const t = name.trim();
  if (!t) return "";
  return t.replace(/\.[^.]+$/, "") || t;
}

/**
 * 처리중·리스트·상세 공통 표시명.
 * meeting.title 우선 (업로드 시 확장자 제거한 값과 동일).
 */
export function meetingDisplayTitle(input: {
  title?: string | null;
  vaultFileName?: string | null;
  fallback?: string;
}): string {
  const fromTitle = input.title?.trim();
  if (fromTitle) return fromTitle;
  const fromVault = stripFileExtension(input.vaultFileName ?? "");
  if (fromVault) return fromVault;
  return input.fallback ?? "파일";
}

export function meetingProcessDetail(
  phase: MeetingProcessPhase,
  errorMessage?: string | null,
): string {
  if (phase === "error" || phase === "empty") {
    const msg = errorMessage?.trim();
    if (phase === "error" && msg && isUploadQuotaErrorMessage(msg)) {
      return "한도";
    }
    return msg || MEETING_PROCESS_LABEL[phase];
  }
  return MEETING_PROCESS_LABEL[phase];
}

/** 쿼터 초과 실패 메시지인지. 활동 목록 짧은 라벨에 쓴다. */
export function isUploadQuotaErrorMessage(message: string): boolean {
  const t = message.trim();
  return (
    t.includes("분석 가능 시간") ||
    t.includes("무료 분석 시간") ||
    t.includes("모두 사용")
  );
}
