/** 검색용: 대소문자·공백 무시. */
export function compactDocsQuery(value: string): string {
  return value.toLowerCase().replace(/\s+/g, "");
}

export function docsTextMatches(haystack: string, query: string): boolean {
  const q = compactDocsQuery(query);
  if (!q) return true;
  return compactDocsQuery(haystack).includes(q);
}
