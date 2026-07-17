import {
  isAccountDigitLength,
  matchesKnownHyphenPattern,
} from "@/lib/masking/account-formats";
import { isBankFormatCompatible } from "@/lib/masking/bank-format";
import {
  ACCOUNT_CONTEXT_ALT,
  BANK_NAME_ALT,
  findLinkedBank,
  hasAccountContextNear,
} from "@/lib/masking/banks";
import {
  extractDigits,
  hasKoreanDigitToken,
  looksLikeKrPhone,
  maskAccountDigits,
  normalizeKoreanDigits,
} from "@/lib/masking/korean-digits";
import type { PiiMatch } from "@/lib/masking/types";

const H = "공영일이원둘두삼셋세사넷네오육륙칠팔구";

/** 숫자 한 토큰: 고유어 다자리(제로/다섯/여덟…) + 한글 1자리 + 아라비아 */
const DIGIT_ALT = `(?:제로|공백|하나|다섯|여섯|일곱|여덟|아홉|[${H}]|\\d)`;
/** 구분자: 하이픈/공백 + 발음(에/다시/하이픈…) */
const SEP_ALT = `(?:[-\\s]|에|다시|하이픈|빼기|대시)`;

/**
 * 아라비아 전용 / 한글숫자 시작 혼용을 분리.
 * (공백 뒤 '이'가 조사인데 숫자로 먹는 오탐 방지)
 */
export const ACCOUNT_NUMBER_BODY = `(?:\\d(?:[-\\s]*\\d){6,13}|(?:제로|공백|하나|다섯|여섯|일곱|여덟|아홉|[${H}])(?:${SEP_ALT}*${DIGIT_ALT}){6,13})`;

const BANK = `(?:${BANK_NAME_ALT})`;
const CTX = `(?:${ACCOUNT_CONTEXT_ALT})`;
const BANK_WITH_PARTICLE = `${BANK}(?:으로|로|에서|에|은|는|이|가|을|를|과|와|도|입니다|이에요|예요)?`;

export const ACCOUNT_SURFACE_PATTERNS: RegExp[] = [
  new RegExp(
    `${BANK_WITH_PARTICLE}\\s*[:：]?\\s*(${ACCOUNT_NUMBER_BODY})`,
    "g",
  ),
  new RegExp(
    `(${ACCOUNT_NUMBER_BODY})\\s*[:：]?\\s*${BANK_WITH_PARTICLE}`,
    "g",
  ),
  new RegExp(`${BANK_WITH_PARTICLE}(${ACCOUNT_NUMBER_BODY})`, "g"),
  new RegExp(`(${ACCOUNT_NUMBER_BODY})${BANK_WITH_PARTICLE}`, "g"),
  new RegExp(`${CTX}\\s*[:：]?\\s*(${ACCOUNT_NUMBER_BODY})`, "g"),
];

function isCardShape(digits: string): boolean {
  return digits.length === 16;
}

function isRrnFormat(rawNumber: string): boolean {
  const n = normalizeKoreanDigits(rawNumber).replace(/\s/g, "");
  return /^\d{6}-\d{7}$/.test(n);
}

/** 하이픈 없는 13자리가 주민번호 형태인지 (계좌와 구분) */
function isLikelyRrnDigits(digits: string): boolean {
  return /^\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{7}$/.test(digits);
}

export function scoreAccountCandidate(
  text: string,
  start: number,
  end: number,
  rawNumber: string,
  bankName?: string | null,
): boolean {
  const digits = extractDigits(rawNumber);
  if (!isAccountDigitLength(digits.length)) return false;
  if (isCardShape(digits)) return false;

  const bank = bankName
    ? { name: bankName }
    : findLinkedBank(text, start, end);
  const ctx = hasAccountContextNear(text, start, end);

  // 은행명이 명시됐는데 형식이 안 맞아도, 길이가 타당하면 계좌로 인정(STT 그룹핑 다양)
  if (bank && !isBankFormatCompatible(bank.name, rawNumber)) {
    if (digits.length < 9 || digits.length > 14) return false;
  }

  // 은행명이 명시되고 형식이 호환되면 RRN 유사 숫자라도 계좌로 인정
  const bankCompatible = bank !== null && bank !== undefined;
  if (!bankCompatible) {
    if (isRrnFormat(rawNumber)) return false;
    // 다단 하이픈 계좌는 주민 형태 숫자라도 계좌로 본다
    if ((rawNumber.match(/-/g) ?? []).length < 2 && isLikelyRrnDigits(digits)) {
      return false;
    }
  }
  if (looksLikeKrPhone(digits)) return false;

  // 은행명·문맥 있으면 승격
  if (bank || ctx) return true;

  // 하이픈이 알려진 은행 형식이면 은행명 없이도 승격
  if (rawNumber.includes("-") || /\s/.test(rawNumber)) {
    const hyphenProbe = normalizeKoreanDigits(rawNumber).replace(/\s+/g, "-");
    if (matchesKnownHyphenPattern(hyphenProbe) && digits.length >= 10) {
      return true;
    }
  }

  // 숫자만 (10~14): 전화·주민·카드 제외 후 계좌 후보로 마스킹
  if (digits.length >= 10 && digits.length <= 14) return true;

  return false;
}

function maskWithBank(
  numberPart: string,
  bankName: string,
  bankBefore: boolean,
): string {
  const masked = maskAccountDigits(extractDigits(numberPart));
  return bankBefore ? `${bankName} ${masked}` : `${masked} ${bankName}`;
}

function expandToLinkedBank(
  text: string,
  numStart: number,
  numEnd: number,
  bank: { name: string; before: boolean },
): { start: number; end: number } {
  if (bank.before) {
    const idx = text.lastIndexOf(bank.name, numStart);
    if (idx >= 0 && idx < numStart) {
      return { start: idx, end: numEnd };
    }
    return { start: numStart, end: numEnd };
  }

  const idx = text.indexOf(bank.name, numEnd);
  if (idx >= 0 && idx - numEnd <= 40) {
    let end = idx + bank.name.length;
    const tail = text
      .slice(end)
      .match(/^(?:입니다|이에요|예요|인데요|이고요|이고|은행)?/);
    if (tail) end += tail[0].length;
    return { start: numStart, end };
  }
  return { start: numStart, end: numEnd };
}

export function collectAccountMatches(text: string): PiiMatch[] {
  const matches: PiiMatch[] = [];
  const seen = new Set<string>();

  const push = (
    start: number,
    end: number,
    value: string,
    replacement: string,
  ) => {
    const key = `${start}:${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    matches.push({ type: "account", value, start, end, replacement });
  };

  for (const pattern of ACCOUNT_SURFACE_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    for (const found of text.matchAll(regex)) {
      const full = found[0];
      const start = found.index ?? 0;
      const end = start + full.length;
      const numberPart = found[1] ?? full;
      const bank = findLinkedBank(text, start, end);
      if (!scoreAccountCandidate(text, start, end, numberPart, bank?.name)) {
        continue;
      }

      // 번호 부분만 마스킹하고 큐·은행 등 주변 텍스트는 원문 유지
      const maskedNum = maskAccountDigits(extractDigits(numberPart));
      push(start, end, full, full.replace(numberPart, maskedNum));
    }
  }

  const arabicOnly = new RegExp(
    `(?<!\\d)(\\d(?:${SEP_ALT}*\\d){6,13})(?!\\d)`,
    "g",
  );
  const hangulStart = new RegExp(
    `(?<![${H}0-9])((?:제로|공백|하나|다섯|여섯|일곱|여덟|아홉|[${H}])(?:${SEP_ALT}*${DIGIT_ALT}){6,13})(?![${H}0-9])`,
    "g",
  );

  for (const regex of [arabicOnly, hangulStart]) {
    for (const found of text.matchAll(regex)) {
      let numberPart = found[1];
      const start = found.index ?? 0;
      let end = start + numberPart.length;
      // 조사 '이'(이고요/이에요…)를 계좌 끝자리로 과다 소비하지 않도록 절단
      if (numberPart.endsWith("이") && "고요은는랑도".includes(text[end] ?? "")) {
        numberPart = numberPart.slice(0, -1);
        end -= 1;
      }
      const bank = findLinkedBank(text, start, end);
      if (!scoreAccountCandidate(text, start, end, numberPart, bank?.name)) {
        continue;
      }

      if (bank) {
        const span = expandToLinkedBank(text, start, end, bank);
        const value = text.slice(span.start, span.end);
        push(
          span.start,
          span.end,
          value,
          maskWithBank(numberPart, bank.name, bank.before),
        );
        continue;
      }

      push(
        start,
        end,
        numberPart,
        maskAccountDigits(extractDigits(numberPart)),
      );
    }
  }

  return matches;
}
