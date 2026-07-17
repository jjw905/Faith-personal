import { maskAccountDigits, maskPhoneDigits, extractDigits, looksLikeKrPhone } from "@/lib/masking/korean-digits";
import { maskPii } from "@/lib/masking/mask";
import { applyStyle } from "@/lib/masking/mask-style";
import {
  maskAddressPartial,
  maskHealthJoined,
  normalizeSpokenEmail,
} from "@/lib/masking/patterns";
import type { MaskOptions, MaskResult, PiiMatch, PiiType } from "@/lib/masking/types";

export type NerSpan = {
  label: string;
  start: number;
  end: number;
  text: string;
  score?: number | null;
};

const NER_TO_PII: Record<string, PiiType> = {
  PHONE: "phone",
  EMAIL: "email",
  RRN: "rrn",
  FOREIGN_ID: "foreign_id",
  CARD: "card",
  ACCOUNT: "account",
  BANK: "bank",
  NAME: "name",
  ADDRESS: "address",
  PASSPORT: "passport",
  DRIVER_LICENSE: "driver_license",
  BIZ_NO: "biz_no",
  CORP_NO: "corp_no",
  VEHICLE: "vehicle",
  HEALTH_ID: "health_id",
  IP: "ip",
  EMP_ID: "emp_id",
  SECRET: "secret",
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function replaceForType(type: PiiType, value: string): string {
  switch (type) {
    case "phone":
      return maskPhoneDigits(extractDigits(value) || value.replace(/\D/g, ""));
    case "account":
      return maskAccountDigits(extractDigits(value) || value.replace(/\D/g, ""));
    case "rrn":
    case "foreign_id": {
      const digits = value.replace(/\D/g, "");
      // 미완성 주민번호는 * 개수만 실제 길이에 맞춤
      if (digits.length < 13) {
        if (digits.length <= 6) return "*".repeat(Math.max(digits.length, 1));
        return `${digits.slice(0, 6)}-${"*".repeat(digits.length - 6)}`;
      }
      return `${digits.slice(0, 6)}-*******`;
    }
    case "card": {
      const digits = value.replace(/\D/g, "");
      if (digits.length < 15) {
        if (digits.length <= 4) return "*".repeat(Math.max(digits.length, 1));
        return `${digits.slice(0, 4)}${"*".repeat(digits.length - 4)}`;
      }
      if (digits.length >= 16) {
        return `${digits.slice(0, 4)}-****-****-${digits.slice(-4)}`;
      }
      return "[카드번호]";
    }
    case "email": {
      const cueRe =
        /^(?:내\s*)?(?:메일\s*주소|메일주소|이메일|이멜|메일)\s*(?:는|은|이|가)?\s*/u;
      const cue = value.match(cueRe)?.[0] ?? "";
      const body = value.slice(cue.length);
      const normalized = normalizeSpokenEmail(body);
      const at = normalized.indexOf("@");
      if (at < 0 || at === normalized.length - 1) return "[이메일]";
      const local = normalized.slice(0, at);
      const domain = normalized.slice(at + 1);
      const safe =
        local.length <= 2
          ? "*".repeat(Math.max(local.length, 1))
          : `${local[0]}${"*".repeat(Math.max(local.length - 2, 1))}${local[local.length - 1]}`;
      return `${cue}${safe}@${domain}`;
    }
    case "name":
      return value.length <= 2
        ? "*".repeat(value.length)
        : `${value[0]}${"*".repeat(value.length - 1)}`;
    case "address":
      return maskAddressPartial(value);
    case "passport":
      return "[여권번호]";
    case "driver_license":
      return "[운전면허]";
    case "biz_no":
      return "[사업자번호]";
    case "corp_no":
      return "[법인번호]";
    case "vehicle":
      return "[차량번호]";
    case "health_id":
      if (/\d\s*하고\s*\d/.test(value)) return maskHealthJoined(value);
      {
        const digits = value.replace(/\D/g, "");
        if (digits.length >= 8) {
          const head = digits.slice(0, 2);
          const tail = digits.slice(-2);
          return `${head}${"*".repeat(Math.max(digits.length - 4, 0))}${tail}`;
        }
      }
      return "[건강보험번호]";
    case "ip":
      return "[IP]";
    case "emp_id":
      return "[사번]";
    case "secret":
      return "[비밀키]";
    case "bank":
      return value; // 은행명은 보통 유지
    default:
      return "[개인정보]";
  }
}

function nerSpanCredible(type: PiiType, text: string): boolean {
  const digits = extractDigits(text) || text.replace(/\D/g, "");
  switch (type) {
    case "phone":
      // 미완성 전화는 NER 스킵 (규칙도 완성본만 탐지)
      return digits.length >= 10 && looksLikeKrPhone(digits);
    case "rrn":
    case "foreign_id":
      return digits.length >= 13;
    case "card":
      return digits.length >= 15;
    case "account":
      return digits.length >= 7;
    case "passport":
      return text.replace(/\s/g, "").length >= 8;
    case "biz_no":
      return digits.length >= 10;
    case "name":
      return text.length >= 2 && text.length <= 4;
    case "email":
      return text.includes("@") && text.indexOf("@") < text.length - 1;
    case "health_id":
      return (
        (/\d+\s*하고\s*\d+/.test(text) &&
          (extractDigits(text) || "").length >= 8) ||
        digits.length >= 10
      );
    case "secret":
      return text.length >= 12;
    case "address":
      return text.length >= 8;
    default:
      return text.trim().length > 0;
  }
}

function nerToMatches(spans: NerSpan[], exclude: Set<PiiType>): PiiMatch[] {
  const out: PiiMatch[] = [];
  for (const span of spans) {
    const type = NER_TO_PII[span.label];
    if (!type || exclude.has(type)) continue;
    if (type === "bank") continue; // 은행명 단독은 마스킹하지 않음
    if (span.end <= span.start) continue;
    if (!nerSpanCredible(type, span.text)) continue;
    out.push({
      type,
      value: span.text,
      start: span.start,
      end: span.end,
      replacement: replaceForType(type, span.text),
      source: "ner",
    });
  }
  return out;
}

function resolveOverlaps(matches: PiiMatch[]): PiiMatch[] {
  const priority = (m: PiiMatch) => {
    // 규칙 우선, 그다음 계좌/주민 등 고신뢰
    if (m.source === "rule") return 4;
    if (m.type === "account" || m.type === "rrn" || m.type === "phone") return 3;
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

function applyMatches(text: string, matches: PiiMatch[]): string {
  let cursor = 0;
  let masked = "";
  for (const match of matches) {
    masked += text.slice(cursor, match.start);
    masked += match.replacement;
    cursor = match.end;
  }
  masked += text.slice(cursor);
  return masked;
}

/**
 * 규칙 마스킹 + NER span 병합.
 * NER 서버가 없거나 spans가 비면 규칙만 사용.
 */
export function mergeRuleAndNer(
  text: string,
  nerSpans: NerSpan[] = [],
  options: MaskOptions = {},
): MaskResult {
  const exclude = new Set(options.excludeTypes ?? []);
  const rule = maskPii(text, options);
  const ruleMatches = rule.matches.map((m) => ({ ...m, source: "rule" as const }));
  const nerMatches = nerToMatches(nerSpans, exclude);
  const merged = resolveOverlaps([...ruleMatches, ...nerMatches]);
  const matches = options.style ? applyStyle(merged, options.style) : merged;

  const stats = {
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
  } satisfies Record<PiiType, number>;

  for (const m of matches) stats[m.type] += 1;

  return {
    original: text,
    masked: applyMatches(text, matches),
    matches,
    stats,
    nerUsed: nerSpans.length > 0,
  };
}
