import type { Meeting } from "@/types/meeting";

/**
 * 회의록에서 자주 쓰는 핵심 키워드.
 * 참고: 안건 / 논의 / 결정 / 후속(액션) / 미결 구조가 한국어 회의록 양식의 공통축.
 */
export const MEETING_KEYWORD_HINTS = [
  "안건",
  "논의",
  "결정",
  "합의",
  "후속",
  "액션",
  "담당",
  "마감",
  "미결",
  "리스크",
  "블로커",
  "일정",
] as const;

/** 처리·파이프라인·섹션 라벨처럼 보이는 태그 제외 */
const PROCESS_LIKE =
  /변환|마스킹\s*중|처리\s*중|처리\s*완료|^완료$|^예정$|^실패$|업로드\s*완료|녹음\s*완료|^(?:STT|업로드|요약|타임라인|처리중|AI|diarize|화자분리|녹음|변환|실패)$/i;

function cleanKeyword(raw: string): string | null {
  const t = raw.trim().replace(/^#/, "");
  if (!t || t.length > 18 || PROCESS_LIKE.test(t)) return null;
  return t;
}

export function meetingTopicKeywords(
  summaryTags: string[],
  fallbackTags: string[] = [],
  limit = 3,
): string[] {
  const cleaned = summaryTags.map(cleanKeyword).filter(Boolean) as string[];
  const source =
    cleaned.length > 0
      ? cleaned
      : (fallbackTags.map(cleanKeyword).filter(Boolean) as string[]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of source) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

/** 목록 표시용: 메타 키워드 → 참석자 태그 순으로 회의 내용 핵심어. */
export function meetingDisplayKeywords(
  meeting: Meeting,
  limit = 3,
): string[] {
  const primary = meetingTopicKeywords(
    meeting.summaryTags,
    meeting.tags,
    limit,
  );
  if (primary.length > 0) return primary;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of meeting.participants) {
    for (const raw of p.tags ?? []) {
      const t = cleanKeyword(raw);
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
