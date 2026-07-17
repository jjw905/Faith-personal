/**
 * 은행 계열 ↔ 계좌 형식 정합성.
 */

import {
  getSpecById,
  parseDigitGroups,
  type DigitGroups,
} from "@/lib/masking/account-formats";
import { extractDigits, normalizeKoreanDigits } from "@/lib/masking/korean-digits";

export type BankFamily =
  | "kdb"
  | "ibk"
  | "kb"
  | "suhyup"
  | "nh"
  | "woori"
  | "sc"
  | "citi"
  | "im"
  | "busan"
  | "gwangju"
  | "jeju"
  | "saemaul"
  | "shinhyup"
  | "savings"
  | "forest"
  | "post"
  | "hana"
  | "shinhan"
  | "kbank"
  | "kakao"
  | "toss";

const ALIAS_TO_FAMILY: Array<{ alias: string; family: BankFamily }> = [
  { alias: "한국산업은행", family: "kdb" },
  { alias: "산업은행", family: "kdb" },
  { alias: "산은", family: "kdb" },
  { alias: "KDB", family: "kdb" },
  { alias: "IBK기업은행", family: "ibk" },
  { alias: "기업은행", family: "ibk" },
  { alias: "기은", family: "ibk" },
  { alias: "아이비케이", family: "ibk" },
  { alias: "IBK", family: "ibk" },
  { alias: "KB국민은행", family: "kb" },
  { alias: "국민은행", family: "kb" },
  { alias: "국은", family: "kb" },
  { alias: "국민", family: "kb" },
  { alias: "케비", family: "kb" },
  { alias: "KB", family: "kb" },
  { alias: "Sh수협은행", family: "suhyup" },
  { alias: "수협은행", family: "suhyup" },
  { alias: "수협", family: "suhyup" },
  { alias: "수은", family: "suhyup" },
  { alias: "NH농협은행", family: "nh" },
  { alias: "농협은행", family: "nh" },
  { alias: "단위농협", family: "nh" },
  { alias: "농축협", family: "nh" },
  { alias: "농협", family: "nh" },
  { alias: "엔에이치", family: "nh" },
  { alias: "NH", family: "nh" },
  { alias: "우리은행", family: "woori" },
  { alias: "우은", family: "woori" },
  { alias: "우리", family: "woori" },
  { alias: "SC제일은행", family: "sc" },
  { alias: "제일은행", family: "sc" },
  { alias: "제일", family: "sc" },
  { alias: "SC", family: "sc" },
  { alias: "한국씨티은행", family: "citi" },
  { alias: "씨티은행", family: "citi" },
  { alias: "씨티", family: "citi" },
  { alias: "iM뱅크", family: "im" },
  { alias: "아이엠뱅크", family: "im" },
  { alias: "아이엠", family: "im" },
  { alias: "대구은행", family: "im" },
  { alias: "대구", family: "im" },
  { alias: "DGB", family: "im" },
  { alias: "BNK부산은행", family: "busan" },
  { alias: "부산은행", family: "busan" },
  { alias: "부산", family: "busan" },
  { alias: "BNK", family: "busan" },
  { alias: "광주은행", family: "gwangju" },
  { alias: "광주", family: "gwangju" },
  { alias: "제주은행", family: "jeju" },
  { alias: "제주", family: "jeju" },
  { alias: "새마을금고", family: "saemaul" },
  { alias: "새마을", family: "saemaul" },
  { alias: "엠지", family: "saemaul" },
  { alias: "MG", family: "saemaul" },
  { alias: "신용협동조합", family: "shinhyup" },
  { alias: "신협", family: "shinhyup" },
  { alias: "상호저축은행", family: "savings" },
  { alias: "저축은행", family: "savings" },
  { alias: "저축", family: "savings" },
  { alias: "산림조합", family: "forest" },
  { alias: "산림", family: "forest" },
  { alias: "우체국예금", family: "post" },
  { alias: "우체국", family: "post" },
  { alias: "우체", family: "post" },
  { alias: "KEB하나은행", family: "hana" },
  { alias: "하나은행", family: "hana" },
  { alias: "외환은행", family: "hana" },
  { alias: "하은", family: "hana" },
  { alias: "하나", family: "hana" },
  { alias: "외환", family: "hana" },
  { alias: "신한은행", family: "shinhan" },
  { alias: "신한", family: "shinhan" },
  { alias: "케이뱅크", family: "kbank" },
  { alias: "케뱅", family: "kbank" },
  { alias: "케이", family: "kbank" },
  { alias: "카카오뱅크", family: "kakao" },
  { alias: "카뱅", family: "kakao" },
  { alias: "카카오", family: "kakao" },
  { alias: "토스뱅크", family: "toss" },
  { alias: "토스은행", family: "toss" },
  { alias: "토뱅", family: "toss" },
  { alias: "토스", family: "toss" },
].sort((a, b) => b.alias.length - a.alias.length);

/** FAMILY_RULES: specs에서 파생 */
export const FAMILY_RULES = Object.fromEntries(
  (
    [
      "kdb",
      "ibk",
      "kb",
      "suhyup",
      "nh",
      "woori",
      "sc",
      "citi",
      "im",
      "busan",
      "gwangju",
      "jeju",
      "saemaul",
      "shinhyup",
      "savings",
      "forest",
      "post",
      "hana",
      "shinhan",
      "kbank",
      "kakao",
      "toss",
    ] as BankFamily[]
  ).map((id) => {
    const spec = getSpecById(id)!;
    return [
      id,
      {
        lengths: spec.lengths,
        groups: spec.groups.map((g) => g.join("-")),
        prefixes: spec.prefixes ?? [],
      },
    ];
  }),
) as Record<
  BankFamily,
  { lengths: number[]; groups: string[]; prefixes: string[] }
>;

const UNIQUE_GROUP_OWNER: Record<string, BankFamily> = {
  "4-2-7": "kakao",
  "2-4-4-4": "toss",
  "3-6-5": "hana",
  "4-4-4-1": "saemaul",
  "8-2": "ibk",
  "3-8": "ibk",
};

function inferFamilyFromDigits(digits: string): BankFamily | null {
  for (const id of Object.keys(FAMILY_RULES) as BankFamily[]) {
    const prefixes = FAMILY_RULES[id].prefixes;
    if (!prefixes.length) continue;
    if (!FAMILY_RULES[id].lengths.includes(digits.length)) continue;
    for (const p of [...prefixes].sort((a, b) => b.length - a.length)) {
      if (digits.startsWith(p)) {
        // 카카오 "7"은 너무 넓어 13자리+7777/7979만
        if (id === "kakao" && p === "7") {
          if (/^(7777|7979|7942)/.test(digits)) return "kakao";
          continue;
        }
        // 토스 12자리는 1901/1001, 14자리는 17/19
        if (id === "toss") {
          if (digits.length === 12 && /^(1901|1001)/.test(digits)) return "toss";
          if (digits.length === 14 && /^(17|19)/.test(digits)) return "toss";
          continue;
        }
        return id;
      }
    }
  }
  // 카카오 13자리 3시작 (일반)
  if (digits.length === 13 && /^3\d{12}$/.test(digits)) return "kakao";
  return null;
}

function inferFamilyFromGroups(groups: DigitGroups | null): BankFamily | null {
  if (!groups) return null;
  return UNIQUE_GROUP_OWNER[groups.join("-")] ?? null;
}

function resolveFamilyStrict(bankName: string): BankFamily | null {
  const hit = ALIAS_TO_FAMILY.find((r) => r.alias === bankName);
  if (hit) return hit.family;
  for (const row of ALIAS_TO_FAMILY) {
    if (bankName.startsWith(row.alias)) return row.family;
  }
  return null;
}

export function resolveBankFamily(bankName: string): BankFamily | null {
  return resolveFamilyStrict(bankName);
}

/**
 * 은행명과 계좌 형식이 맞는지.
 * 연속 숫자(하이픈 없음)는 자리수 + 고유 접두만 검사.
 */
export function isBankFormatCompatible(
  bankName: string,
  rawNumber: string,
): boolean {
  const family = resolveFamilyStrict(bankName);
  if (!family) return true;

  const digits = extractDigits(rawNumber);
  const hyphenProbe = normalizeKoreanDigits(rawNumber).replace(/\s+/g, "-");
  const groups = hyphenProbe.includes("-")
    ? parseDigitGroups(hyphenProbe)
    : null;

  const inferred =
    inferFamilyFromGroups(groups) ?? inferFamilyFromDigits(digits);
  if (inferred && inferred !== family) return false;

  const rule = FAMILY_RULES[family];
  if (!rule.lengths.includes(digits.length)) return false;

  if (groups) {
    const key = groups.join("-");
    // 다른 은행 고유 그룹이면 거부 (예: 카카오 4-2-7)
    const owner = UNIQUE_GROUP_OWNER[key];
    if (owner && owner !== family) return false;
    // 음성/구어: 은행명이 있으면 그룹 엄격 매칭은 생략 (자리수만)
  }

  return true;
}
