import type { MeetingProcessPhase } from "@/lib/user-meetings-store";

export type { MeetingProcessPhase };

export const MEETING_PROCESS_LABEL: Record<MeetingProcessPhase, string> = {
  transcribing: "받아쓰는 중이에요",
  structuring: "정리하는 중이에요",
  done: "완료",
  error: "실패",
  empty: "저장되지 않음",
};

/** 진행 중 문구를 사용자용으로 부드럽게. 예전 딱딱한 표기도 흡수한다. */
export function friendlyProcessStageLabel(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  if (/보완/.test(t)) return "추가 보완 중이에요";

  const stripped = t
    .replace(/\s*\(\d+\s*\/\s*\d+\)\s*$/, "")
    .replace(/\s*\(\d+\)\s*$/, "")
    .trim();
  // "… 중입니다/중이에요" → "… 중" (앞 공백은 유지)
  const base = stripped
    .replace(/중(?:입니다|이에요|이예요)$/, "중")
    .replace(/\s+/g, " ")
    .trim();

  const map: Record<string, string> = {
    "분석하는 중": "이야기의 흐름을 잡는 중이에요",
    "이야기의 흐름을 정리하는 중": "이야기의 흐름을 잡는 중이에요",
    "이야기의 흐름을 잡는 중": "이야기의 흐름을 잡는 중이에요",
    "받아쓰는 중": "받아쓰는 중이에요",
    "정리하는 중": "정리하는 중이에요",
    "파일 확인하는 중": "파일을 살펴보는 중이에요",
    "파일을 확인하는 중": "파일을 살펴보는 중이에요",
    "파일을 살펴보는 중": "파일을 살펴보는 중이에요",
    "오디오 불러오는 중": "소리를 불러오는 중이에요",
    "오디오를 불러오는 중": "소리를 불러오는 중이에요",
    "소리를 불러오는 중": "소리를 불러오는 중이에요",
    "타임라인 작성하는 중": "타임라인을 그리는 중이에요",
    "타임라인을 작성하는 중": "타임라인을 그리는 중이에요",
    "타임라인을 그리는 중": "타임라인을 그리는 중이에요",
    "화자 확인하는 중": "누가 말했는지 맞추는 중이에요",
    "화자를 확인하는 중": "누가 말했는지 맞추는 중이에요",
    "누가 말했는지 맞추는 중": "누가 말했는지 맞추는 중이에요",
    "표현 다듬는 중": "표현을 다듬는 중이에요",
    "표현을 다듬는 중": "표현을 다듬는 중이에요",
    "빠진 말을 다시 확인하는 중": "빠진 말을 다시 확인하는 중이에요",
    "말한 위치를 정밀하게 맞추는 중": "말한 위치를 정밀하게 맞추는 중이에요",
    "같은 화자의 발언을 모으는 중": "같은 목소리를 모으는 중이에요",
    "같은 목소리를 모으는 중": "같은 목소리를 모으는 중이에요",
    "긴 회의라 나누어 정리하는 중": "긴 회의라 나눠서 정리 중이에요",
    "긴 회의라 나눠서 정리 중": "긴 회의라 나눠서 정리 중이에요",
    "이어서 정리하는 중": "이어서 정리 중이에요",
    "이어서 정리 중": "이어서 정리 중이에요",
    "한 번 더 확인하는 중": "한 번 더 살펴보는 중이에요",
    "한 번 더 살펴보는 중": "한 번 더 살펴보는 중이에요",
    "분석 대기 중": "잠시 기다리는 중이에요",
    "잠시 기다리는 중": "잠시 기다리는 중이에요",
  };

  if (base.startsWith("분석하는 중")) return map["분석하는 중"]!;
  if (map[base]) return map[base]!;

  if (/중이에요$|중이예요$/.test(stripped)) {
    return stripped.replace(/중이예요$/, "중이에요");
  }
  if (/중입니다$/.test(stripped)) {
    return stripped.replace(/중입니다$/, "중이에요");
  }
  return stripped;
}

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
      return "사용 제한";
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
    t.includes("잔여 시간이 없습니다") ||
    t.includes("모두 사용")
  );
}
