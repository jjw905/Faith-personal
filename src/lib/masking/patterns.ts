import { extractDigits, maskPhoneDigits } from "@/lib/masking/korean-digits";
import {
  alt,
  AT_SPOKEN,
  CUE_VARIANTS,
  DIGIT_TOKEN_ALT,
  DOT_SPOKEN,
  PASSPORT_PREFIX_SPOKEN,
  VEHICLE_HANGUL,
} from "@/lib/masking/spoken";
import type { PiiType } from "@/lib/masking/types";

const DOT_ALT = `${alt(DOT_SPOKEN)}|\\.`;
const AT_ALT = alt(AT_SPOKEN);
const CUE = (key: keyof typeof CUE_VARIANTS) => alt(CUE_VARIANTS[key]!);

export interface PiiPattern {
  type: PiiType;
  /** Global regex; do not use sticky flag */
  regex: RegExp;
  replace: (match: string) => string;
}

const SURNAMES =
  "김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|전|홍|유|고|문|양|손|배|백|허|남|심|노|하|곽|성|차|주|우|류|표|변|염|석|선|설|마|길|위|제|목|빈";

const SIDO =
  "서울(?:특별)?시|부산(?:광역)?시|대구(?:광역)?시|인천(?:광역)?시|광주(?:광역)?시|대전(?:광역)?시|울산(?:광역)?시|세종특별자치시|서울|부산|대구|인천|광주|대전|울산|세종|경기(?:도)?|강원(?:특별자치)?도|충청?북도|충청?남도|전라?북도|전라?남도|경상?북도|경상?남도|제주특별자치도|제주";

// 긴 것 우선(아웃룩메일 > 아웃룩) 정렬해 provider 뒤 '메일' 잔여 방지.
const MAIL_PROVIDERS = alt([
  "지메일닷컴",
  "네이버닷컴",
  "구글 메일",
  "아웃룩메일",
  "카카오메일",
  "프로톤메일",
  "지 메일",
  "쥐 메일",
  "지메일",
  "쥐메일",
  "지매",
  "지멜",
  "네이버",
  "다음",
  "한메일",
  "카카오",
  "핫메일",
  "야후",
  "아웃룩",
  "아이 클라우드",
  "아이클라우드",
  "네이트",
  "프로톤",
  "라이브",
  "엠에스엔",
]);

/** 철자 발음(에이 비 씨…) → 영문 소문자 */
const LETTER_NAMES: [RegExp, string][] = [
  [/^에이치$/, "h"], [/^에이$/, "a"], [/^비$/, "b"], [/^씨$/, "c"], [/^시$/, "c"],
  [/^디$/, "d"], [/^이$/, "e"], [/^에프$/, "f"], [/^지$/, "g"], [/^아이$/, "i"],
  [/^제이$/, "j"], [/^케이$/, "k"], [/^엘$/, "l"], [/^엠$/, "m"], [/^엔$/, "n"],
  [/^오$/, "o"], [/^피$/, "p"], [/^큐$/, "q"], [/^알$/, "r"], [/^아르$/, "r"],
  [/^에스$/, "s"], [/^티$/, "t"], [/^유$/, "u"], [/^브이$/, "v"], [/^뷔$/, "v"],
  [/^더블유$/, "w"], [/^떠블유$/, "w"], [/^따블유$/, "w"], [/^엑스$/, "x"],
  [/^와이$/, "y"], [/^제트$/, "z"], [/^지드$/, "z"],
];

function spelledLetterToken(tok: string): string | null {
  for (const [re, ch] of LETTER_NAMES) if (re.test(tok)) return ch;
  return null;
}

/** 구어 이메일 최상위 도메인 발음 */
const MAIL_TLDS =
  "컴|콤|씨오엠|넷|오알지|오아르지|아이오|데브|에이아이|에듀|씨오케이알|코닷케이알|케이알|미";

function maskLocalEmail(local: string): string {
  if (local.length <= 2) return "*".repeat(Math.max(local.length, 1));
  return `${local[0]}${"*".repeat(Math.max(local.length - 2, 1))}${local[local.length - 1]}`;
}

/** 구어 도메인 → 영문 (지메일 점 컴 → gmail.com) */
export function normalizeSpokenEmailDomain(domain: string): string {
  let d = domain
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/닷/g, "점");

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d) && !/[가-힣]/.test(d)) {
    return d;
  }

  const providers: [RegExp, string][] = [
    [/^(?:지메일|지매|지멜|쥐메일|구글메일)/, "gmail"],
    [/^네이버/, "naver"],
    [/^다음/, "daum"],
    [/^한메일/, "hanmail"],
    [/^카카오(?:메일)?/, "kakao"],
    [/^핫메일/, "hotmail"],
    [/^야후/, "yahoo"],
    [/^아웃룩(?:메일)?/, "outlook"],
    [/^아이클라우드/, "icloud"],
    [/^네이트/, "nate"],
    [/^프로톤(?:메일)?/, "proton"],
    [/^라이브/, "live"],
    [/^엠에스엔/, "msn"],
  ];

  let provider = "";
  for (const [re, eng] of providers) {
    if (re.test(d)) {
      provider = eng;
      d = d.replace(re, "");
      break;
    }
  }

  d = d.replace(/점|쩜|\./g, ".");
  d = d
    .replace(/씨오\.?케이알|코닷케이알|씨오케이에르/g, "co.kr")
    .replace(/컴|콤/g, "com")
    .replace(/넷/g, "net")
    .replace(/오알지|오아르지/g, "org")
    .replace(/아이오/g, "io")
    .replace(/데브/g, "dev")
    .replace(/에이아이/g, "ai")
    .replace(/씨오엠/g, "com")
    .replace(/에듀/g, "edu")
    .replace(/미(?=$|\.)/g, "me")
    .replace(/케이알/g, "kr");

  d = d.replace(/[가-힣]/g, "").replace(/\.{2,}/g, ".").replace(/^\.|\.$/g, "");

  if (provider) {
    if (!d) d = "com";
    if (!d.includes(".")) return `${provider}.${d}`;
    return `${provider}.${d.replace(/^\./, "")}`;
  }

  return d || domain.trim();
}

function normalizeSpokenLocal(local: string): string {
  const trimmed = local.trim();
  // 철자/숫자 발음이 공백으로 나열된 경우: 토큰별 변환 (에이 비 씨 = abc)
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    const mapped = tokens.map((t) => {
      const letter = spelledLetterToken(t);
      if (letter) return letter;
      if (/^(?:제로|[공영일이삼사오육륙칠팔구])+$/.test(t)) return extractDigits(t);
      return t;
    });
    // 변환된 토큰이 대부분 1글자(철자/숫자)면 붙임
    const shortRatio = mapped.filter((m) => m.length === 1).length / mapped.length;
    if (shortRatio >= 0.5) return mapped.join("");
  }
  const compact = trimmed.replace(/\s+/g, "");
  if (/^(?:제로|[공영일이삼사오육륙칠팔구])+$/.test(compact)) {
    return extractDigits(compact) || compact;
  }
  return compact;
}

/** 골뱅이/점/닷 구어 이메일을 local@domain 영문으로 */
export function normalizeSpokenEmail(raw: string): string {
  let s = raw
    .replace(/\s*골\s*뱅\s*이\s*/g, "@")
    .replace(/\s*골뱅이\s*/g, "@")
    .replace(/\s*골뱅\s*/g, "@")
    .replace(/\s*(?:앳|엣|에트|at)\s*/gi, "@")
    .replace(/\s*(?:닷|도트|마침표)\s*/g, "점")
    .replace(/\s*쩜\s*/g, "점");

  s = s.replace(/\s*(?:입니다|이에요|예요|이요|요)$/u, "");

  const at = s.indexOf("@");
  if (at < 0) return s.trim();
  const local = normalizeSpokenLocal(s.slice(0, at));
  const domain = normalizeSpokenEmailDomain(s.slice(at + 1));
  return `${local}@${domain}`;
}

const EMAIL_CUE_RE =
  /^(?:내\s*)?(?:메일\s*주소|메일주소|이메일|이멜|메일)\s*(?:는|은|이|가)?\s*/u;

function maskEmailValue(m: string): string {
  const cue = m.match(EMAIL_CUE_RE)?.[0] ?? "";
  const body = m.slice(cue.length);
  const normalized = normalizeSpokenEmail(body);
  const at = normalized.indexOf("@");
  if (at < 0) return m;
  const local = normalized.slice(0, at);
  const domain = normalized.slice(at + 1);
  return `${cue}${maskLocalEmail(local)}@${domain}`;
}

function maskDigitRun(digits: string, keepHead = 2, keepTail = 0): string {
  if (!digits) return "";
  const head = Math.min(keepHead, digits.length);
  const tail = Math.min(keepTail, Math.max(digits.length - head, 0));
  const mid = Math.max(digits.length - head - tail, 0);
  return `${digits.slice(0, head)}${"*".repeat(mid)}${digits.slice(digits.length - tail)}`;
}

/** 건보: 47978하고01424 → 47***하고0**** */
export function maskHealthJoined(raw: string): string {
  const m = raw.match(/(\d+)\s*하고(?:요)?\s*(\d+)/);
  if (m) {
    return `${maskDigitRun(m[1]!, 2, 0)}하고${maskDigitRun(m[2]!, 1, 0)}`;
  }
  const digits = raw.replace(/\D/g, "");
  return maskDigitRun(digits, 2, 2);
}

/**
 * 도로명(로/길)은 유지, 번지·동·층·호만 가림.
 * [상세주소] 같은 통째 치환 금지.
 */
export function maskAddressPartial(raw: string): string {
  return raw
    .replace(/(\d+)\s*층/g, "**층")
    .replace(/(\d+)\s*동/g, "**동")
    .replace(/(\d+)\s*호/g, "***호")
    .replace(
      /(로|길)\s*(\d+(?:\s+\d+)*(?:-\d+)?)/g,
      (_m, road: string, num: string) => {
        const digits = num.replace(/\D/g, "");
        const stars = "*".repeat(Math.min(Math.max(digits.length || num.length, 2), 4));
        return `${road} ${stars}`;
      },
    );
}

/**
 * Pattern-based PII detectors — 음성(STT) 입력 가정:
 * 특수문자 적음, 공백·구어·조사 많음.
 */
export const PII_PATTERNS: PiiPattern[] = [
  {
    type: "rrn",
    regex: /\b\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?:[-\s]|에|다시|하이픈)?\d{7}\b/g,
    replace: (m) => {
      const digits = m.replace(/\D/g, "");
      return `${digits.slice(0, 6)}-${"*".repeat(7)}`;
    },
  },
  {
    type: "card",
    regex: /\b(?:\d{4}(?:[-\s]|에|다시|하이픈)?){3}\d{4}\b/g,
    replace: (m) => {
      const digits = m.replace(/\D/g, "");
      return `${digits.slice(0, 4)}-****-****-${digits.slice(-4)}`;
    },
  },
  {
    type: "phone",
    regex:
      /(?<!\d)(?:01[016789]|02|0(?:3[1-3]|4[1-4]|5[1-5]|6[1-4]))(?:[-\s]?\d{3,4}){2}(?!\d)/g,
    replace: (m) => maskPhoneDigits(extractDigits(m)),
  },
  // 일반 이메일
  {
    type: "email",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    replace: maskEmailValue,
  },
  // @ 있는 구어 도메인
  {
    type: "email",
    regex: new RegExp(
      `[A-Za-z0-9._%+-]+\\s*@\\s*(?:${MAIL_PROVIDERS})(?:\\s*(?:${DOT_ALT}))?\\s*(?:${MAIL_TLDS})?|[A-Za-z0-9._%+-]+\\s*@\\s*[가-힣A-Za-z0-9]+(?:\\s*(?:${DOT_ALT})\\s*[가-힣A-Za-z0-9]+)+`,
      "g",
    ),
    replace: maskEmailValue,
  },
  // 음성: 에이 비 씨 골뱅이 지메일 점 컴 / 테스트 앳 야후 쩜 넷
  {
    type: "email",
    regex: new RegExp(
      `(?:(?:내\\s*)?(?:${CUE("email")})\\s*(?:는|은|이|가)?\\s*(?:[가-힣A-Za-z0-9]{1,6}(?:\\s+[가-힣A-Za-z0-9]{1,6}){0,15})|[가-힣A-Za-z0-9]{2,20})\\s*(?:${AT_ALT})\\s*(?:${MAIL_PROVIDERS})(?:\\s*(?:${DOT_ALT}))?\\s*(?:${MAIL_TLDS})?`,
      "gi",
    ),
    replace: maskEmailValue,
  },
  // 건보
  {
    type: "health_id",
    regex: new RegExp(
      `(?:${CUE("health_id")})?\\s*(?:는|은)?\\s*(?:이겁니다\\s*)?\\d{4,8}\\s*하고(?:요)?\\s*\\d{4,8}`,
      "g",
    ),
    replace: (m) => {
      const joined = m.match(/\d+\s*하고\s*\d+/)?.[0] ?? m;
      const prefix = m.slice(0, m.indexOf(joined));
      return `${prefix}${maskHealthJoined(joined)}`;
    },
  },
  {
    type: "health_id",
    regex: new RegExp(
      `(?:${CUE("health_id")})\\s*(?:는|은|가|:|：)?\\s*(?:이겁니다\\s*)?\\d{6,13}(?!\\d)`,
      "g",
    ),
    replace: (m) => {
      const digits = m.replace(/\D/g, "");
      return m.replace(digits, maskDigitRun(digits, 2, 2));
    },
  },
  // 주소: 도로명 유지, 번지/층/호만 부분 마스킹
  {
    type: "address",
    regex: new RegExp(
      `(?:${SIDO})\\s+[가-힣0-9\\s]+?(?:로|길)(?:\\s*\\d+(?:-\\d+)?)?(?:\\s*\\d+\\s*동)?(?:\\s*\\d+\\s*층)?(?:\\s*\\d+\\s*호)?`,
      "g",
    ),
    replace: maskAddressPartial,
  },
  {
    type: "address",
    regex: new RegExp(
      `(?:(?:${SIDO})\\s+[가-힣]+(?:시|군|구)|(?:${CUE("address")})(?:는|가|를)?)[^\\n]{0,40}?\\d{1,4}\\s*층(?:\\s*\\d{1,4}\\s*호)?|\\d{1,4}\\s*층\\s*\\d{1,4}\\s*호`,
      "g",
    ),
    replace: maskAddressPartial,
  },
  // 호칭/직책 뒤 이름
  {
    type: "name",
    regex: new RegExp(
      `(?:${SURNAMES})[가-힣]{1,2}(?=\\s*(?:님|씨|군|양|과장|대리|팀장|부장|차장|사원|주임|이사|대표|사장|부사장|실장|본부장|센터장|매니저|프로|선임|책임|수석|고객님|회원|환자|님은|님의|님께|씨가|씨는|에게|에게서|께서))`,
      "g",
    ),
    replace: (m) =>
      m.length <= 2 ? "*".repeat(m.length) : `${m[0]}${"*".repeat(m.length - 1)}`,
  },
  {
    type: "name",
    regex: new RegExp(
      `(?:${CUE("name")})\\s*(?:님|분)?\\s*(?:는|은|이|가|께|의|:|：)?\\s*((?:${SURNAMES})[가-힣]{1,2})`,
      "g",
    ),
    replace: (m) => {
      const name = m.replace(
        new RegExp(
          `^(?:${CUE("name")})\\s*(?:님|분)?\\s*(?:는|은|이|가|께|의|:|：)?\\s*`,
        ),
        "",
      );
      const masked =
        name.length <= 2
          ? "*".repeat(name.length)
          : `${name[0]}${"*".repeat(name.length - 1)}`;
      return m.replace(name, masked);
    },
  },
  // ─── 문맥+형식: 여권/면허/사업자/법인/차량/외국인/IP/사번 ───
  {
    type: "passport",
    regex: new RegExp(
      `(?:${CUE("passport")})\\s*(?:는|은|이|가|:|：)?\\s*(?:[MSRG]|${alt([
        ...PASSPORT_PREFIX_SPOKEN.M!,
        ...PASSPORT_PREFIX_SPOKEN.S!,
        ...PASSPORT_PREFIX_SPOKEN.R!,
        ...PASSPORT_PREFIX_SPOKEN.G!,
      ])})\\s*\\d{8}`,
      "gi",
    ),
    replace: () => "[여권번호]",
  },
  {
    type: "passport",
    regex: /\b[MSRG]\d{8}\b/g,
    replace: () => "[여권번호]",
  },
  // 큐 없이 발음 접두(알/엠/에스/지) + 8자리
  {
    type: "passport",
    regex: new RegExp(
      `(?<![가-힣A-Za-z])(?:${alt([
        ...PASSPORT_PREFIX_SPOKEN.M!,
        ...PASSPORT_PREFIX_SPOKEN.S!,
        ...PASSPORT_PREFIX_SPOKEN.R!,
        ...PASSPORT_PREFIX_SPOKEN.G!,
      ])})\\s*\\d{8}(?!\\d)`,
      "g",
    ),
    replace: () => "[여권번호]",
  },
  {
    type: "driver_license",
    regex: new RegExp(
      `(?:${CUE("driver_license")})\\s*(?:는|은|이|가|:|：)?\\s*\\d{2}(?:[-\\s]|에|다시|하이픈)?\\d{2}(?:[-\\s]|에|다시|하이픈)?\\d{6}(?:[-\\s]|에|다시|하이픈)?\\d{2}`,
      "g",
    ),
    replace: () => "[운전면허]",
  },
  // 큐 없이 형식만 (고노이즈: 큐 손상돼도 탐지) — 구분자 필수
  {
    type: "driver_license",
    regex:
      /(?<![\d가-힣])\d{2}(?:[-\s]|에|다시|하이픈)\d{2}(?:[-\s]|에|다시|하이픈)\d{6}(?:[-\s]|에|다시|하이픈)\d{2}(?![\d])/g,
    replace: () => "[운전면허]",
  },
  {
    type: "biz_no",
    regex: new RegExp(
      `(?:${CUE("biz_no")})\\s*(?:는|은|이|가|:|：)?\\s*\\d{3}(?:[-\\s]|에|다시)?\\d{2}(?:[-\\s]|에|다시)?\\d{5}`,
      "g",
    ),
    replace: () => "[사업자번호]",
  },
  // 큐 없이 형식만 (3-2-5, 구분자 필수)
  {
    type: "biz_no",
    regex:
      /(?<![\d가-힣])\d{3}(?:[-\s]|에|다시|하이픈)\d{2}(?:[-\s]|에|다시|하이픈)\d{5}(?![\d])/g,
    replace: () => "[사업자번호]",
  },
  {
    type: "corp_no",
    regex: new RegExp(
      `(?:${CUE("corp_no")})\\s*(?:는|은|이|가|:|：)?\\s*\\d{6}(?:[-\\s]|에|다시)?\\d{7}`,
      "g",
    ),
    replace: () => "[법인번호]",
  },
  {
    type: "vehicle",
    regex: new RegExp(
      `(?:${CUE("vehicle")})\\s*(?:는|은|이|가|:|：)?\\s*(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)?\\s*\\d{2,3}\\s*[${VEHICLE_HANGUL}]\\s*\\d{4}`,
      "g",
    ),
    replace: () => "[차량번호]",
  },
  {
    type: "vehicle",
    regex: new RegExp(
      `(?<![가-힣\\d])(?:서울|부산|대구|인천|광주|대전|울산|세종|경기)?\\s*\\d{2,3}[${VEHICLE_HANGUL}]\\d{4}(?![\\d가-힣])`,
      "g",
    ),
    replace: () => "[차량번호]",
  },
  // 발음 차량번호: 한글숫자 2~3 + 번호판글자 + 한글숫자 4 (사=4/바 등 동음 허용)
  {
    type: "vehicle",
    regex: new RegExp(
      `(?<![0-9공영일이원둘두삼셋세사넷네오육륙칠팔구${VEHICLE_HANGUL}])(?:${DIGIT_TOKEN_ALT})(?:\\s*(?:${DIGIT_TOKEN_ALT})){1,2}\\s*[${VEHICLE_HANGUL}]\\s*(?:${DIGIT_TOKEN_ALT})(?:\\s*(?:${DIGIT_TOKEN_ALT})){3}(?![0-9공영일이원둘두삼셋세사넷네오육륙칠팔구])`,
      "g",
    ),
    replace: () => "[차량번호]",
  },
  {
    type: "foreign_id",
    regex: new RegExp(
      `(?:${CUE("foreign_id")})\\s*(?:는|은|이|가|:|：)?\\s*\\d{6}(?:[-\\s]|에|다시|하이픈)?[5-8]\\d{6}`,
      "g",
    ),
    replace: (m) => {
      const digits = m.replace(/\D/g, "");
      if (digits.length >= 13) return `${digits.slice(0, 6)}-*******`;
      return "[외국인등록번호]";
    },
  },
  {
    type: "ip",
    regex: new RegExp(
      `(?:${CUE("ip")})\\s*(?:는|은|이|가|:|：)?\\s*(?:\\d{1,3}\\s*\\.\\s*){3}\\d{1,3}`,
      "gi",
    ),
    replace: () => "[IP]",
  },
  {
    type: "ip",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    replace: () => "[IP]",
  },
  // 점 주변 공백 있는 발음 IP (정규화 사본: 187 . 80 . 99 . 100)
  {
    type: "ip",
    regex:
      /(?<![\d.])(?:\d{1,3}\s*\.\s*){3}\d{1,3}(?![\d.])/g,
    replace: () => "[IP]",
  },
  {
    type: "emp_id",
    regex: new RegExp(
      `(?:${CUE("emp_id")})\\s*(?:는|은|이|가|:|：)?\\s*[A-Za-z]{0,4}[-]?\\d{4,8}`,
      "g",
    ),
    replace: () => "[사번]",
  },
  // 큐 없이 알려진 접두(EMP/HR/KR/EN) + 숫자
  {
    type: "emp_id",
    regex: /\b(?:EMP|HR|KR|EN|SN)-?\d{4,8}\b/g,
    replace: () => "[사번]",
  },
  // 큐 없이 접두 문자 + 숫자 (단일문자는 5~6자리로 오탐 억제, 여권 [MSRG]\d{8} 회피)
  {
    type: "emp_id",
    regex: /\b(?:[A-Z]{1,4}-\d{3,6}|[A-Z]{2,4}\d{3,6}|[A-Z]\d{5,6})\b/g,
    replace: () => "[사번]",
  },
  {
    type: "secret",
    regex:
      /\bsk-(?:live|test|proj|ant-)?[A-Za-z0-9_\-]{16,}\b|\bpk-(?:live|test)?[A-Za-z0-9_\-]{16,}\b|\brk-(?:live|test)?[A-Za-z0-9_\-]{16,}\b|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9_]{20,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bAIza[0-9A-Za-z\-_]{20,}\b|\bBearer\s+[A-Za-z0-9\-._~+/]+=*|(?:api[_-]?key|secret[_-]?key|access[_-]?token|private[_-]?key|client[_-]?secret|비밀키|시크릿(?:키)?|인증키)\s*[=:]\s*['"]?[A-Za-z0-9_\-./+=]{12,}/gi,
    replace: () => "[비밀키]",
  },
];
