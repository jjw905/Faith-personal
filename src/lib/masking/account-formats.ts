/**
 * 은행별 계좌 하이픈·자리수 (나무위키/금융결제원 관례 + 시중 표기).
 * 하이픈은 가독성용 — 그룹 길이만 맞으면 동일 계좌.
 */

export type DigitGroups = number[];

export type BankFormatSpec = {
  id: string;
  label: string;
  lengths: number[];
  groups: DigitGroups[];
  /** 연속 숫자일 때 강한 접두 (상품/과목 코드) */
  prefixes?: string[];
};

/** 전 은행 스펙 (마스킹 정합성·하이픈 판별 공용) */
export const BANK_FORMAT_SPECS: BankFormatSpec[] = [
  {
    id: "kdb",
    label: "산업은행",
    lengths: [11, 14],
    groups: [
      [3, 4, 4, 3],
      [3, 2, 6],
    ],
  },
  {
    id: "ibk",
    label: "기업은행",
    lengths: [10, 11, 12, 14],
    groups: [
      [3, 2, 7],
      [3, 6, 2, 3],
      [8, 2],
      [3, 8],
    ],
  },
  {
    id: "kb",
    label: "국민은행",
    lengths: [10, 11, 12, 14],
    groups: [
      [6, 2, 6],
      [4, 2, 6],
      [4, 2, 8],
      [3, 2, 4, 3],
      [3, 2, 6],
    ],
  },
  {
    id: "suhyup",
    label: "수협",
    lengths: [11, 12, 14],
    groups: [
      [4, 4, 4],
      [3, 2, 8, 1],
      [3, 2, 5, 1],
    ],
  },
  {
    id: "nh",
    label: "농협",
    lengths: [10, 11, 12, 13, 14],
    groups: [
      [3, 4, 4, 2],
      [3, 4, 4, 3],
      [4, 2, 6],
      [6, 2, 6],
      [3, 2, 6],
    ],
    prefixes: ["301", "302", "312", "351", "352", "384", "790", "791"],
  },
  {
    id: "woori",
    label: "우리은행",
    lengths: [11, 12, 13, 14],
    groups: [
      [4, 3, 6],
      [3, 6, 2, 3],
      [3, 2, 6],
      [3, 2, 7],
    ],
  },
  {
    id: "sc",
    label: "SC제일",
    lengths: [11, 14],
    groups: [
      [3, 2, 6],
      [3, 2, 9],
    ],
  },
  {
    id: "citi",
    label: "씨티",
    lengths: [10, 11, 12, 13],
    groups: [
      [3, 5, 3, 2],
      [1, 6, 3, 2],
      [3, 5, 3],
      [2, 2, 6],
      [1, 6, 3],
      [3, 6, 3],
    ],
  },
  {
    id: "im",
    label: "iM/대구",
    lengths: [7, 8, 9, 10, 11, 12, 13, 14],
    groups: [
      [3, 2, 6, 1],
      [3, 2, 6, 2],
      [3, 2, 6, 3],
      [3, 2, 6],
    ],
  },
  {
    id: "busan",
    label: "부산은행",
    lengths: [12, 13],
    groups: [
      [3, 4, 4, 2],
      [3, 2, 7],
    ],
  },
  {
    id: "gwangju",
    label: "광주은행",
    lengths: [12, 13],
    groups: [
      [4, 3, 6],
      [3, 3, 6],
    ],
  },
  {
    id: "jeju",
    label: "제주은행",
    lengths: [10, 12],
    groups: [
      [3, 3, 6],
      [2, 2, 6],
    ],
  },
  {
    id: "saemaul",
    label: "새마을금고",
    lengths: [13, 14],
    groups: [
      [4, 4, 4, 1],
      [4, 2, 6, 1],
      [4, 3, 6, 1],
    ],
  },
  {
    id: "shinhyup",
    label: "신협",
    lengths: [12, 13],
    groups: [
      [3, 3, 6],
      [5, 2, 5, 1],
    ],
  },
  {
    id: "savings",
    label: "저축은행",
    lengths: [11, 14],
    groups: [
      [3, 2, 2, 7],
      [3, 2, 2, 4],
    ],
  },
  {
    id: "forest",
    label: "산림조합",
    lengths: [11, 12, 13],
    groups: [
      [5, 2, 6],
      [3, 2, 6],
    ],
  },
  {
    id: "post",
    label: "우체국",
    lengths: [12, 13, 14],
    groups: [
      [6, 2, 6],
      [6, 6, 1],
      [3, 8, 1],
      [3, 9],
    ],
  },
  {
    id: "hana",
    label: "하나은행",
    lengths: [11, 12, 14],
    groups: [
      [3, 6, 5],
      [3, 2, 5, 1],
      [3, 6, 3],
      [3, 5, 1],
    ],
  },
  {
    id: "shinhan",
    label: "신한은행",
    lengths: [10, 11, 12, 13, 14],
    groups: [
      [3, 3, 6],
      [3, 3, 8],
      [3, 2, 6],
      [3, 2, 8],
    ],
  },
  {
    id: "kbank",
    label: "케이뱅크",
    lengths: [12],
    groups: [[3, 3, 6]],
  },
  {
    id: "kakao",
    label: "카카오뱅크",
    lengths: [13],
    groups: [[4, 2, 7]],
    prefixes: ["3333", "3900", "7777", "7979", "7942", "7"],
  },
  {
    id: "toss",
    label: "토스뱅크",
    lengths: [10, 11, 12, 13, 14],
    groups: [
      [4, 4, 4],
      [2, 4, 4, 4],
      [3, 3, 6],
      [3, 2, 6],
      [3, 3, 8],
      [6, 6],
    ],
    prefixes: ["1901", "1001", "17", "19"],
  },
];

export const ACCOUNT_HYPHEN_PATTERNS: DigitGroups[] = [
  ...new Map(
    BANK_FORMAT_SPECS.flatMap((s) => s.groups).map((g) => [g.join("-"), g]),
  ).values(),
];

const PATTERN_KEYS = new Set(
  ACCOUNT_HYPHEN_PATTERNS.map((g) => g.join("-")),
);

export function parseDigitGroups(raw: string): DigitGroups | null {
  const parts = raw
    .trim()
    .split(/[-\s]+/)
    .filter(Boolean);
  if (parts.length < 2) return null;
  const groups: number[] = [];
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    groups.push(p.length);
  }
  return groups;
}

export function matchesKnownHyphenPattern(raw: string): boolean {
  const groups = parseDigitGroups(raw);
  if (!groups) return false;
  return PATTERN_KEYS.has(groups.join("-"));
}

export function isAccountDigitLength(len: number): boolean {
  return len >= 7 && len <= 14;
}

export function getSpecById(id: string): BankFormatSpec | undefined {
  return BANK_FORMAT_SPECS.find((s) => s.id === id);
}
