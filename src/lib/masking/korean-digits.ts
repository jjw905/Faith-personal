/** 한글·아라비아 혼용 숫자열을 마스킹 탐지용으로 정규화한다. */

import { DIGIT_TOKEN_ALT, SEP_SPOKEN } from "@/lib/masking/spoken";

/** 긴 토큰 우선 (제로, 하나, 다섯…) */
const MULTI_DIGIT: Array<[string, string]> = [
  ["제로", "0"],
  ["공백", "0"],
  ["하나", "1"],
  ["다섯", "5"],
  ["여섯", "6"],
  ["일곱", "7"],
  ["여덟", "8"],
  ["아홉", "9"],
];

const SINGLE_DIGIT: Record<string, string> = {
  공: "0",
  영: "0",
  일: "1",
  원: "1", // STT 오인식 후보
  이: "2",
  둘: "2",
  두: "2",
  삼: "3",
  셋: "3",
  세: "3",
  사: "4",
  넷: "4",
  네: "4",
  오: "5",
  육: "6",
  륙: "6",
  칠: "7",
  팔: "8",
  구: "9",
};

const HANGUL_DIGIT_CLASS = "공영일이원둘두삼셋세사넷네오육륙칠팔구";

/** 제로(2글자) + 한글 1글자 숫자 + 아라비아 숫자 */
export const MIXED_DIGIT_TOKEN = `(?:${DIGIT_TOKEN_ALT})`;

/** 구분자: 하이픈/공백/에/다시/하이픈… */
const SEP_CLASS = `[-\\s에]|다시|하이픈|빼기|대시|바|에에`;

/**
 * 하이픈/공백/구어 구분자로 이어진 혼용 숫자열 후보.
 * 예: 공일공-2394-2493, 공일공에 일이삼사, 하나영 오오…
 */
export const MIXED_DIGIT_RUN = new RegExp(
  `(?:\\d(?:(?:${SEP_CLASS})*\\d){7,19}|(?:${DIGIT_TOKEN_ALT})(?:(?:${SEP_CLASS})*(?:${DIGIT_TOKEN_ALT})){7,19})`,
  "g",
);

/** 한글 숫자를 아라비아로 치환. 구분자는 유지. */
export function normalizeKoreanDigits(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; ) {
    let matched = false;
    for (const [tok, dig] of MULTI_DIGIT) {
      if (text.startsWith(tok, i)) {
        out += dig;
        i += tok.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // 구어 구분자 → 하이픈 (추출 시 제거됨)
    let sepHit = false;
    for (const sep of SEP_SPOKEN) {
      if (text.startsWith(sep, i)) {
        out += "-";
        i += sep.length;
        sepHit = true;
        break;
      }
    }
    if (sepHit) continue;

    const ch = text[i]!;
    if (ch in SINGLE_DIGIT) {
      out += SINGLE_DIGIT[ch];
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

export function extractDigits(text: string): string {
  return normalizeKoreanDigits(text).replace(/\D/g, "");
}

/** 발음 구분자(긴 것 우선) */
const SPOKEN_SEP_TOKENS = ["하이픈", "빼기", "대시", "에에", "다시", "에", "바"];
/** 점 발음(IP 등): 숫자런 안에서 '.'로 */
const DOT_TOKENS = ["도트", "마침표", "쩜", "점", "닷"];

type RunToken = { out: string; oStart: number; oEnd: number };

/**
 * i 위치에서 시작하는 "숫자열 후보"를 파싱.
 * 숫자 토큰(한글/아라비아) + 구분자(발음/공백/하이픈/점)로 구성.
 * 숫자 토큰이 3개 이상이고 그중 한글이 1개 이상일 때만 확정(commit).
 */
function parseDigitRun(
  text: string,
  start: number,
  prevChar: string,
): { tokens: RunToken[]; end: number; commit: boolean } | null {
  let i = start;
  const tokens: RunToken[] = [];
  let digitCount = 0;
  let hangulCount = 0;
  let lastDigitIdx = -1;

  while (i < text.length) {
    let hit = false;
    for (const [tok, dig] of MULTI_DIGIT) {
      if (text.startsWith(tok, i)) {
        tokens.push({ out: dig, oStart: i, oEnd: i + tok.length });
        digitCount++;
        hangulCount++;
        lastDigitIdx = tokens.length - 1;
        i += tok.length;
        hit = true;
        break;
      }
    }
    if (hit) continue;

    const ch = text[i]!;
    if (ch in SINGLE_DIGIT) {
      tokens.push({ out: SINGLE_DIGIT[ch]!, oStart: i, oEnd: i + 1 });
      digitCount++;
      hangulCount++;
      lastDigitIdx = tokens.length - 1;
      i += 1;
      continue;
    }
    if (ch >= "0" && ch <= "9") {
      tokens.push({ out: ch, oStart: i, oEnd: i + 1 });
      digitCount++;
      lastDigitIdx = tokens.length - 1;
      i += 1;
      continue;
    }

    let sepHit = false;
    for (const sep of SPOKEN_SEP_TOKENS) {
      if (text.startsWith(sep, i)) {
        tokens.push({ out: "-", oStart: i, oEnd: i + sep.length });
        i += sep.length;
        sepHit = true;
        break;
      }
    }
    if (sepHit) continue;

    let dotHit = false;
    for (const dot of DOT_TOKENS) {
      if (text.startsWith(dot, i)) {
        tokens.push({ out: ".", oStart: i, oEnd: i + dot.length });
        i += dot.length;
        dotHit = true;
        break;
      }
    }
    if (dotHit) continue;

    if (ch === " " || ch === "-" || ch === ".") {
      tokens.push({ out: ch, oStart: i, oEnd: i + 1 });
      i += 1;
      continue;
    }
    break;
  }

  if (lastDigitIdx < 0) return null;
  let trimmed = tokens.slice(0, lastDigitIdx + 1);

  // 앞 글자가 한글이고, 런이 고립된 '이'(엠이/알이의 접미 등)로 시작해 곧 구분자가
  // 오면 그 '이'는 숫자가 아님 → 런에서 제외 (엠이 72… → 엠이 + 72…)
  if (
    trimmed.length >= 2 &&
    /[가-힣]/.test(prevChar) &&
    trimmed[0]!.oEnd - trimmed[0]!.oStart === 1 &&
    text[trimmed[0]!.oStart] === "이" &&
    /[-\s]/.test(trimmed[1]!.out)
  ) {
    let cut = 1;
    while (cut < trimmed.length && /[-\s]/.test(trimmed[cut]!.out)) cut++;
    trimmed = trimmed.slice(cut);
    if (trimmed.length < 3) return null;
    digitCount -= 1;
    hangulCount -= 1;
  }

  // 끝 '이'가 조사(이고/이은/이는…)면 숫자에서 제외
  const last = trimmed[trimmed.length - 1]!;
  if (
    last.oEnd - last.oStart === 1 &&
    text[last.oStart] === "이" &&
    "고요은는랑도".includes(text[last.oEnd] ?? "")
  ) {
    trimmed = trimmed.slice(0, -1);
    while (trimmed.length && trimmed[trimmed.length - 1]!.out.match(/[-\s]/)) {
      trimmed = trimmed.slice(0, -1);
    }
    if (!trimmed.length) return null;
    digitCount -= 1;
    hangulCount -= 1;
  }
  return {
    tokens: trimmed,
    end: trimmed[trimmed.length - 1]!.oEnd,
    commit: digitCount >= 3 && hangulCount >= 1,
  };
}

/**
 * 발음 숫자열만 아라비아로 바꾼 사본과 위치 매핑 반환.
 * 아라비아 전용 구간/일반 텍스트는 원문 그대로 유지(조사 '이', 단어 '사업자' 보존).
 */
export function normalizeWithMap(text: string): {
  out: string;
  startMap: number[];
  endMap: number[];
} {
  const outChars: string[] = [];
  const startMap: number[] = [];
  const endMap: number[] = [];
  const emit = (s: string, oStart: number, oEnd: number) => {
    for (const ch of s) {
      outChars.push(ch);
      startMap.push(oStart);
      endMap.push(oEnd);
    }
  };

  let i = 0;
  while (i < text.length) {
    const run = parseDigitRun(text, i, i > 0 ? text[i - 1]! : "");
    if (run && run.commit) {
      // 앞에서 잘려나간(런에 포함 안 된) 원문 구간은 그대로 유지
      const runStart = run.tokens[0]!.oStart;
      for (let k = i; k < runStart; k++) emit(text[k]!, k, k + 1);
      for (const t of run.tokens) emit(t.out, t.oStart, t.oEnd);
      i = run.end;
      continue;
    }
    emit(text[i]!, i, i + 1);
    i += 1;
  }

  return { out: outChars.join(""), startMap, endMap };
}

/** 한국 휴대폰/유선 번호 형태인지 (숫자만). */
export function looksLikeKrPhone(digits: string): boolean {
  if (/^01[016789]\d{7,8}$/.test(digits)) return true;
  if (/^02\d{7,8}$/.test(digits)) return true;
  if (/^0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4])\d{7,8}$/.test(digits)) return true;
  return false;
}

/** 계좌 후보 자리수 (한국 은행 7~14자리). */
export function looksLikeKrAccount(digits: string): boolean {
  return digits.length >= 7 && digits.length <= 14 && /^\d+$/.test(digits);
}

export function maskPhoneDigits(digits: string): string {
  // 입력 중(미완성)에는 010-****-xxxx 틀로 자릿수를 채우지 않는다.
  if (digits.length < 10) {
    if (digits.length <= 3) return "*".repeat(digits.length) || "[전화]";
    return `${digits.slice(0, 3)}${"*".repeat(digits.length - 3)}`;
  }
  if (digits.startsWith("01")) {
    return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
  }
  if (digits.startsWith("02")) {
    return `02-****-${digits.slice(-4)}`;
  }
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

export function maskAccountDigits(digits: string): string {
  const keepHead = Math.min(2, digits.length);
  const keepTail = Math.min(2, Math.max(digits.length - keepHead, 0));
  const mid = Math.max(digits.length - keepHead - keepTail, 0);
  return `${digits.slice(0, keepHead)}${"*".repeat(mid)}${digits.slice(digits.length - keepTail)}`;
}

/** 원문에 한글 숫자 토큰이 하나라도 있으면 true. */
export function hasKoreanDigitToken(text: string): boolean {
  return /제로|공백|하나|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉|[공영일이원삼사오육륙칠팔구]/.test(
    text,
  );
}

export { HANGUL_DIGIT_CLASS };
