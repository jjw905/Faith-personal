/** 검색용 정규화. 모든 공백 제거 후 소문자. */
export function normalizeSearchKey(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/** haystack 조각들을 공백 무시로 이어 붙여 query 포함 여부. */
export function matchesSearchText(
  parts: Array<string | null | undefined>,
  query: string,
): boolean {
  const q = normalizeSearchKey(query);
  if (!q) return true;
  const hay = normalizeSearchKey(parts.filter(Boolean).join(""));
  return hay.includes(q);
}
