/**
 * 한국 금융기관 별칭 + 구어/STT 줄임말.
 * 짧은 별칭은 앞뒤가 한글·영문이 아닐 때만 매칭.
 */

type BankAlias = {
  name: string;
  /** 2글자 이하·애매한 약어는 경계 검사 */
  short?: boolean;
};

export const BANK_ALIAS_ENTRIES: BankAlias[] = [
  // 산업
  { name: "한국산업은행" },
  { name: "산업은행" },
  { name: "산은", short: true },
  { name: "KDB" },
  // 기업
  { name: "IBK기업은행" },
  { name: "기업은행" },
  { name: "기은", short: true },
  { name: "아이비케이" },
  { name: "IBK" },
  // 국민
  { name: "KB국민은행" },
  { name: "국민은행" },
  { name: "국은", short: true },
  { name: "국민", short: true },
  { name: "케비" },
  { name: "KB" },
  // 수협
  { name: "Sh수협은행" },
  { name: "수협은행" },
  { name: "수협", short: true },
  { name: "수은", short: true },
  // 농협
  { name: "NH농협은행" },
  { name: "농협은행" },
  { name: "단위농협" },
  { name: "농축협" },
  { name: "농협", short: true },
  { name: "엔에이치" },
  { name: "NH" },
  // 우리
  { name: "우리은행" },
  { name: "우은", short: true },
  { name: "우리", short: true },
  // SC제일
  { name: "SC제일은행" },
  { name: "제일은행" },
  { name: "제일", short: true },
  { name: "SC" },
  // 씨티
  { name: "한국씨티은행" },
  { name: "씨티은행" },
  { name: "씨티", short: true },
  // iM/대구
  { name: "iM뱅크" },
  { name: "아이엠뱅크" },
  { name: "아이엠", short: true },
  { name: "대구은행" },
  { name: "대구", short: true },
  { name: "DGB" },
  // 부산
  { name: "BNK부산은행" },
  { name: "부산은행" },
  { name: "부산", short: true },
  { name: "BNK" },
  // 광주/제주
  { name: "광주은행" },
  { name: "광주", short: true },
  { name: "제주은행" },
  { name: "제주", short: true },
  // 새마을
  { name: "새마을금고" },
  { name: "새마을" },
  { name: "엠지" },
  { name: "MG" },
  // 신협/저축/산림
  { name: "신용협동조합" },
  { name: "신협", short: true },
  { name: "상호저축은행" },
  { name: "저축은행" },
  { name: "저축", short: true },
  { name: "산림조합" },
  { name: "산림", short: true },
  // 우체국
  { name: "우체국예금" },
  { name: "우체국" },
  { name: "우체", short: true },
  // 하나
  { name: "KEB하나은행" },
  { name: "하나은행" },
  { name: "외환은행" },
  { name: "하은", short: true },
  { name: "하나", short: true },
  { name: "외환", short: true },
  // 신한
  { name: "신한은행" },
  { name: "신한", short: true },
  // 인터넷은행
  { name: "케이뱅크" },
  { name: "케뱅", short: true },
  { name: "케이", short: true },
  { name: "카카오뱅크" },
  { name: "카뱅", short: true },
  { name: "카카오" },
  { name: "토스뱅크" },
  { name: "토스은행" },
  { name: "토뱅", short: true },
  { name: "토스", short: true },
];

/** 하위 호환: 이름만 배열 */
export const BANK_ALIASES = BANK_ALIAS_ENTRIES.map((e) => e.name);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 긴 이름 우선. 숫자에 붙여 쓴 계좌+은행, '신한입니다' 허용 */
const BANK_PARTICLE = "(?:으로|로|에서|에|은|는|이|가|을|를|과|와|도)?";
const BANK_TAIL =
  "(?:입니다|이에요|예요|인데요|이고요|이고|은행(?:입니다|이에요|예요)?)?";

export const BANK_NAME_ALT = [...BANK_ALIAS_ENTRIES]
  .sort((a, b) => b.name.length - a.name.length)
  .map((e) => {
    const body = escapeRegex(e.name);
    if (e.short) {
      return `(?<![가-힣A-Za-z])${body}(?=${BANK_PARTICLE}${BANK_TAIL}(?:[^가-힣A-Za-z]|\\s|$))`;
    }
    return body;
  })
  .join("|");

export const BANK_NAME_RE = new RegExp(`(?:${BANK_NAME_ALT})`, "g");

/** 계좌 문맥 키워드 (구어 포함) */
export const ACCOUNT_CONTEXT_ALT =
  "계좌번호|계좌번|계좌|통장번호|통장|입금할|입금처|입금|이체처|이체할|이체|송금할|송금|수취인|수취|계좌로|은행으로|은행은|은행이";

export const ACCOUNT_CONTEXT_RE = new RegExp(
  `(?:${ACCOUNT_CONTEXT_ALT})`,
  "g",
);

/**
 * 숫자와 은행명 사이 허용 구간.
 * 예: "이고", "입니다", "은행은", 공백, 문장부호
 */
const LINK_GAP_RE =
  /^(?:[\s.,!?。·…:：]|이고요?|인데요|입니다|이에요|예요|요|은요?|는요?|이|가|을|를|의|과|와|도|으로|로|에서|에|은행(?:은|이|가|으로|입니다|이에요)?|계좌(?:번호|는|가|이고)?|입금|이체|송금)*$/u;

function isLinkGap(gap: string): boolean {
  if (gap.length > 40) return false;
  return LINK_GAP_RE.test(gap);
}

/**
 * 같은 문장·짧은 연결어로 떨어진 은행명까지 찾음.
 * "110112134938 이고 신한 입니다"
 */
export function findLinkedBank(
  text: string,
  start: number,
  end: number,
  radius = 72,
): { name: string; before: boolean } | null {
  const winStart = Math.max(0, start - radius);
  const winEnd = Math.min(text.length, end + radius);
  const window = text.slice(winStart, winEnd);

  let best: { name: string; before: boolean; dist: number } | null = null;

  for (const found of window.matchAll(new RegExp(BANK_NAME_RE.source, "g"))) {
    const name = found[0];
    const absStart = winStart + (found.index ?? 0);
    const absEnd = absStart + name.length;

    // 숫자 구간과 겹치면 span 내부 은행
    if (absStart < end && absEnd > start) {
      const before = absStart <= start;
      const dist = 0;
      if (
        !best ||
        dist < best.dist ||
        (dist === best.dist && name.length > best.name.length)
      ) {
        best = { name, before, dist };
      }
      continue;
    }

    if (absEnd <= start) {
      const gap = text.slice(absEnd, start);
      if (!isLinkGap(gap)) continue;
      const dist = start - absEnd;
      if (
        !best ||
        dist < best.dist ||
        (dist === best.dist && name.length > best.name.length)
      ) {
        best = { name, before: true, dist };
      }
      continue;
    }

    if (absStart >= end) {
      const gap = text.slice(end, absStart);
      if (!isLinkGap(gap)) continue;
      const dist = absStart - end;
      if (
        !best ||
        dist < best.dist ||
        (dist === best.dist && name.length > best.name.length)
      ) {
        best = { name, before: false, dist };
      }
    }
  }

  return best ? { name: best.name, before: best.before } : null;
}

/** @deprecated findLinkedBank 사용 — 호환용 */
export function findBankNear(
  text: string,
  start: number,
  end: number,
  radius = 72,
): { name: string; before: boolean } | null {
  return findLinkedBank(text, start, end, radius);
}

export function hasAccountContextNear(
  text: string,
  start: number,
  end: number,
  radius = 48,
): boolean {
  const window = text.slice(
    Math.max(0, start - radius),
    Math.min(text.length, end + radius),
  );
  ACCOUNT_CONTEXT_RE.lastIndex = 0;
  return ACCOUNT_CONTEXT_RE.test(window);
}
