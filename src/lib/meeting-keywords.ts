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

/** 처리·파이프라인 상태처럼 보이는 태그 제외 */
const PROCESS_LIKE =
  /변환|마스킹\s*중|처리\s*중|처리\s*완료|^완료$|^예정$|업로드\s*완료|녹음\s*완료/;

export function meetingTopicKeywords(
  summaryTags: string[],
  fallbackTags: string[] = [],
  limit = 3,
): string[] {
  const cleaned = summaryTags.filter((t) => t.trim() && !PROCESS_LIKE.test(t));
  const source = cleaned.length > 0 ? cleaned : fallbackTags;
  return source.filter((t) => t.trim() && !PROCESS_LIKE.test(t)).slice(0, limit);
}
