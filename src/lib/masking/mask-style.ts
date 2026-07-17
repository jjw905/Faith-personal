import { extractDigits } from "@/lib/masking/korean-digits";
import {
  PII_TYPE_LABELS,
  type MaskStyle,
  type PiiMatch,
  type PiiType,
} from "@/lib/masking/types";

function starDigits(d: string, head = 2, tail = 2): string {
  if (d.length <= head + tail) {
    if (d.length <= 2) return "*".repeat(Math.max(d.length, 1));
    return `${d.slice(0, 1)}${"*".repeat(d.length - 1)}`;
  }
  return `${d.slice(0, head)}${"*".repeat(d.length - head - tail)}${d.slice(-tail)}`;
}

/** 유형/값을 부분 별표 표기로 (앞2 + **** + 뒤2). 발음/한글 숫자도 처리. */
export function partialFor(type: PiiType, value: string): string {
  if (type === "secret") {
    const t = value.trim();
    return `${t.slice(0, 4)}${"*".repeat(Math.min(Math.max(t.length - 4, 4), 12))}`;
  }
  const d = extractDigits(value);
  if (d.length >= 3) return starDigits(d);
  // 숫자가 거의 없으면 문자 기준으로 가림
  const t = value.replace(/\s+/g, "");
  if (t.length <= 2) return "*".repeat(Math.max(t.length, 1));
  return `${t[0]}${"*".repeat(t.length - 2)}${t[t.length - 1]}`;
}

/** 라벨 토큰: [유형] */
export function labelFor(type: PiiType): string {
  return `[${PII_TYPE_LABELS[type]}]`;
}

/**
 * 매치들의 치환 표기를 스타일에 맞춰 통일.
 * - label: 모두 [유형] 토큰
 * - partial: 라벨 토큰으로 되어있는 것만 부분 별표로 변환(이미 부분표기는 유지)
 */
export function applyStyle(matches: PiiMatch[], style: MaskStyle): PiiMatch[] {
  return matches.map((m) => {
    if (m.type === "bank") return m;
    if (style === "label") {
      return { ...m, replacement: labelFor(m.type) };
    }
    if (/^\[[^\]]+\]$/.test(m.replacement)) {
      return { ...m, replacement: partialFor(m.type, m.value) };
    }
    return m;
  });
}
