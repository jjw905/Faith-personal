import { collectAccountMatches } from "@/lib/masking/account";
import { applyStyle } from "@/lib/masking/mask-style";
import {
  extractDigits,
  hasKoreanDigitToken,
  looksLikeKrPhone,
  maskPhoneDigits,
  MIXED_DIGIT_RUN,
  normalizeWithMap,
} from "@/lib/masking/korean-digits";
import { PII_PATTERNS } from "@/lib/masking/patterns";
import type {
  MaskOptions,
  MaskResult,
  PiiMatch,
  PiiType,
} from "@/lib/masking/types";

function emptyStats(): Record<PiiType, number> {
  return {
    phone: 0,
    email: 0,
    rrn: 0,
    card: 0,
    account: 0,
    address: 0,
    name: 0,
    passport: 0,
    driver_license: 0,
    biz_no: 0,
    corp_no: 0,
    vehicle: 0,
    foreign_id: 0,
    health_id: 0,
    ip: 0,
    emp_id: 0,
    bank: 0,
    secret: 0,
  };
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function collectPatternMatches(
  text: string,
  exclude: Set<PiiType>,
): PiiMatch[] {
  const matches: PiiMatch[] = [];

  for (const pattern of PII_PATTERNS) {
    if (exclude.has(pattern.type)) continue;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    for (const found of text.matchAll(regex)) {
      const value = found[0];
      const start = found.index ?? 0;
      const end = start + value.length;
      matches.push({
        type: pattern.type,
        value,
        start,
        end,
        replacement: pattern.replace(value),
      });
    }
  }

  return matches;
}

/**
 * 발음 숫자열(팔팔공구…)을 아라비아로 정규화한 사본에 패턴을 돌리고,
 * 매치 구간을 원문 위치로 되돌려 탐지. 순수 아라비아 구간은 원문과 동일하므로
 * collectPatternMatches 결과와 겹쳐 resolveOverlaps 로 중복 제거된다.
 */
function collectSpokenPatternMatches(
  text: string,
  exclude: Set<PiiType>,
): PiiMatch[] {
  const { out, startMap, endMap } = normalizeWithMap(text);
  if (out === text) return [];

  const matches: PiiMatch[] = [];
  for (const pattern of PII_PATTERNS) {
    if (exclude.has(pattern.type)) continue;
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    for (const found of out.matchAll(regex)) {
      const nStart = found.index ?? 0;
      const nEnd = nStart + found[0].length;
      if (nEnd === nStart) continue;
      const start = startMap[nStart]!;
      const end = endMap[nEnd - 1]!;
      matches.push({
        type: pattern.type,
        value: text.slice(start, end),
        start,
        end,
        replacement: pattern.replace(found[0]),
      });
    }
  }

  // 계좌도 정규화 사본에서 탐지(발음 은행/계좌) 후 원문 위치로 매핑
  if (!exclude.has("account")) {
    for (const m of collectAccountMatches(out)) {
      const start = startMap[m.start]!;
      const end = endMap[m.end - 1]!;
      matches.push({
        type: "account",
        value: text.slice(start, end),
        start,
        end,
        replacement: m.replacement,
      });
    }
  }
  return matches;
}

/**
 * 공일공-2394-2493 처럼 한글·숫자 혼용 전화 탐지.
 * 계좌는 collectAccountMatches 가 담당.
 */
function collectMixedPhoneMatches(
  text: string,
  exclude: Set<PiiType>,
): PiiMatch[] {
  if (exclude.has("phone")) return [];

  const matches: PiiMatch[] = [];
  const regex = new RegExp(MIXED_DIGIT_RUN.source, MIXED_DIGIT_RUN.flags);

  for (const found of text.matchAll(regex)) {
    const value = found[0];
    if (!hasKoreanDigitToken(value)) continue;

    const digits = extractDigits(value);
    if (!looksLikeKrPhone(digits)) continue;

    const start = found.index ?? 0;
    matches.push({
      type: "phone",
      value,
      start,
      end: start + value.length,
      replacement: maskPhoneDigits(digits),
    });
  }

  return matches;
}

function collectNameMatches(
  text: string,
  names: string[],
  exclude: Set<PiiType>,
): PiiMatch[] {
  if (exclude.has("name") || names.length === 0) return [];

  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );

  const matches: PiiMatch[] = [];
  for (const name of unique) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escaped, "g");
    for (const found of text.matchAll(regex)) {
      const value = found[0];
      const start = found.index ?? 0;
      matches.push({
        type: "name",
        value,
        start,
        end: start + value.length,
        replacement:
          name.length <= 2
            ? "*".repeat(name.length)
            : `${name[0]}${"*".repeat(name.length - 1)}`,
      });
    }
  }
  return matches;
}

/** Longer / earlier matches win. 계좌(은행 포함)가 주민·전화와 겹치면 계좌 우선. */
function resolveOverlaps(matches: PiiMatch[]): PiiMatch[] {
  const priority = (m: PiiMatch) => {
    if (m.type === "account") return 3;
    if (m.type === "rrn" || m.type === "phone") return 1;
    return 2;
  };

  const sorted = [...matches].sort((a, b) => {
    const lenDiff = b.value.length - a.value.length;
    if (lenDiff !== 0) return lenDiff;
    const pDiff = priority(b) - priority(a);
    if (pDiff !== 0) return pDiff;
    return a.start - b.start;
  });

  const accepted: PiiMatch[] = [];
  for (const candidate of sorted) {
    const clash = accepted.some((kept) =>
      overlaps(candidate.start, candidate.end, kept.start, kept.end),
    );
    if (!clash) accepted.push(candidate);
  }

  return accepted.sort((a, b) => a.start - b.start);
}

/**
 * Detect and mask PII in meeting text (R-08).
 * Independent of STT — feed corrected transcript text (or mock text) directly.
 */
export function maskPii(text: string, options: MaskOptions = {}): MaskResult {
  const exclude = new Set(options.excludeTypes ?? []);
  const raw = [
    ...collectPatternMatches(text, exclude),
    ...collectSpokenPatternMatches(text, exclude),
    ...collectMixedPhoneMatches(text, exclude),
    ...(exclude.has("account") ? [] : collectAccountMatches(text)),
    ...collectNameMatches(text, options.names ?? [], exclude),
  ];
  const matches = options.style
    ? applyStyle(resolveOverlaps(raw), options.style)
    : resolveOverlaps(raw);

  let cursor = 0;
  let masked = "";
  for (const match of matches) {
    masked += text.slice(cursor, match.start);
    masked += match.replacement;
    cursor = match.end;
  }
  masked += text.slice(cursor);

  const stats = emptyStats();
  for (const match of matches) {
    stats[match.type] += 1;
  }

  return {
    original: text,
    masked,
    matches,
    stats,
  };
}

export function detectPii(text: string, options: MaskOptions = {}): PiiMatch[] {
  return maskPii(text, options).matches;
}
