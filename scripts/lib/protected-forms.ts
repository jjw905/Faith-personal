/**
 * 보정기가 지우려는 원본이 이미 멀쩡한 한국어일 때 보호한다.
 *
 * 사전 API 없이 쓸 수 있는 최소 목록. E2에서 관측된 악화 유형
 * (있습니다→있습니까, 했습니다→하겠습니다, 기능어 접합)을 막는 것이 목표다.
 * 일반 실재어(규정에, 되었기, 자제를 등)는 scripts/lib/dict-exists.ts 관문이 담당한다.
 */

/** 흔한 종결·활용형. 원본이 이것과 같으면 덮어쓰지 않는다. */
export const PROTECTED_FORMS = new Set([
  "있습니다",
  "있습니까",
  "했습니다",
  "했습니까",
  "하겠습니다",
  "하겠습니까",
  "합니다",
  "합니까",
  "됩니다",
  "됩니까",
  "입니다",
  "입니까",
  "습니다",
  "습니까",
  "었습니다",
  "었습니까",
  "았습니다",
  "았습니까",
  "겠습니다",
  "겠습니까",
  "드립니다",
  "드립니까",
  "드리겠습니다",
]);

/**
 * 조사·지시·대용 등 기능어.
 * 단독 보정 대상에서 빼고, 어절 접합에도 끼우지 않는다.
 */
export const FUNCTION_WORDS = new Set([
  "그",
  "이",
  "저",
  "게",
  "거",
  "것",
  "수",
  "등",
  "및",
  "또",
  "바로",
  "이게",
  "그게",
  "저게",
  "이런",
  "그런",
  "저런",
  "보면",
  "큰",
  "많은",
  "많이",
  "좀",
  "더",
  "잘",
  "안",
  "못",
  "있는",
  "하는",
  "된",
  "될",
  "한",
  "할",
  "됐",
  "내년",
  "올해",
  "오늘",
  "지금",
  "이번",
  "다음",
  "지난",
]);

/** 원본 끝이 이 어미면 이미 완성된 서술·의문형으로 본다. */
export const PROTECTED_ENDINGS = [
  "습니다",
  "습니까",
  "입니다",
  "입니까",
  "됩니다",
  "됩니까",
  "합니다",
  "합니까",
  "했습니다",
  "했습니까",
  "겠습니다",
  "겠습니까",
  "드립니다",
  "드리겠습니다",
];

export function isProtectedForm(word: string): boolean {
  if (!word) return false;
  if (PROTECTED_FORMS.has(word)) return true;
  if (FUNCTION_WORDS.has(word)) return true;
  for (const end of PROTECTED_ENDINGS) {
    // '곳입니까'처럼 어미와 어간이 짧아도 보호한다.
    if (word.length > end.length && word.endsWith(end)) return true;
  }
  return false;
}

/** 접합에 끼면 가짜 덩어리가 되기 쉬운 조각인지. */
export function isJoinBlocker(word: string): boolean {
  if (!word) return true;
  if (FUNCTION_WORDS.has(word)) return true;
  if (PROTECTED_FORMS.has(word)) return true;
  // 한 글자 조사·대용은 접합하지 않는다.
  if (word.length <= 1) return true;
  return false;
}
