import type { TranscriptUtterance } from "@/lib/masking/types";
import { BANK_FORMAT_SPECS } from "@/lib/masking/account-formats";

const SURNAMES = [
  "김",
  "이",
  "박",
  "최",
  "정",
  "강",
  "조",
  "윤",
  "장",
  "임",
  "한",
  "오",
  "서",
  "신",
  "권",
  "황",
  "안",
  "송",
  "전",
  "홍",
] as const;

const GIVEN = [
  "민수",
  "서연",
  "지훈",
  "하은",
  "도윤",
  "수아",
  "준호",
  "예진",
  "현우",
  "채원",
  "성민",
  "유진",
  "재현",
  "소희",
  "태영",
  "나경",
  "승현",
  "다은",
  "건우",
  "예린",
] as const;

const BANK_ALIASES = [
  "국민",
  "국은",
  "KB",
  "신한",
  "우리",
  "하나",
  "농협",
  "NH",
  "카카오",
  "카뱅",
  "토스",
  "기업",
  "IBK",
  "수협",
  "우체국",
] as const;

const CITIES = [
  { sido: "서울특별시", gu: "강남구", road: "테헤란로" },
  { sido: "서울특별시", gu: "마포구", road: "월드컵북로" },
  { sido: "경기도", gu: "성남시", road: "판교역로" },
  { sido: "부산광역시", gu: "해운대구", road: "센텀중앙로" },
  { sido: "대전광역시", gu: "유성구", road: "대학로" },
  { sido: "인천광역시", gu: "연수구", road: "컨벤시아대로" },
  { sido: "대구광역시", gu: "수성구", road: "달구벌대로" },
] as const;

const NOISE = [
  "참고로",
  "일단",
  "그리고",
  "추가로",
  "확인용",
  "테스트",
  "메모",
  "전달드립니다",
  "부탁합니다",
  "입니다",
  "이에요",
  "이고",
  "관련해서",
  "아래",
  "위",
  "다시",
  "혹시",
  "바로",
] as const;

type PiiKind =
  | "phone"
  | "email"
  | "rrn"
  | "card"
  | "account"
  | "address"
  | "name"
  | "passport"
  | "driver_license"
  | "biz_no"
  | "vehicle"
  | "ip"
  | "emp_id"
  | "health_id"
  | "foreign_id"
  | "secret";

const PII_KINDS: PiiKind[] = [
  "phone",
  "email",
  "rrn",
  "card",
  "account",
  "address",
  "name",
  "passport",
  "driver_license",
  "biz_no",
  "vehicle",
  "ip",
  "emp_id",
  "health_id",
  "foreign_id",
  "secret",
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)]!;
}

function shuffle<T>(arr: readonly T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function digits(n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += String(randInt(0, 9));
  return s;
}

const HANGUL_DIGITS = ["공", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const ZERO_ALT = ["공", "영", "제로"] as const;
const SIX_ALT = ["육", "륙"] as const;

function toHangulDigits(num: string) {
  return [...num]
    .map((d) => {
      if (d === "0") return pick([...ZERO_ALT]);
      if (d === "6") return pick([...SIX_ALT]);
      return HANGUL_DIGITS[Number(d)] ?? d;
    })
    .join("");
}

/** 그룹(하이픈 자리)을 발음/구분자로 */
function spokenGroups(raw: string, groups: number[]): string {
  const parts: string[] = [];
  let i = 0;
  for (const g of groups) {
    parts.push(toHangulDigits(raw.slice(i, i + g)));
    i += g;
  }
  return parts.join(pick(["에", "에", "다시", " ", "-"]));
}

function randomName() {
  return `${pick(SURNAMES)}${pick(GIVEN)}`;
}

function formatGroups(raw: string, groups: number[]) {
  let i = 0;
  const parts: string[] = [];
  for (const g of groups) {
    parts.push(raw.slice(i, i + g));
    i += g;
  }
  return parts.join("-");
}

function randomPhone() {
  const head = pick(["010", "010", "011", "016", "017", "018"]);
  const mid = digits(4);
  const last = digits(4);
  const style = randInt(0, 6);
  // 발음 위주
  if (style === 0) {
    const sep = pick(["에", "에", "다시"]);
    return `${toHangulDigits(head)}${sep} ${toHangulDigits(mid)}${sep} ${toHangulDigits(last)}`;
  }
  if (style === 1) return `${toHangulDigits(head)} ${toHangulDigits(mid)} ${toHangulDigits(last)}`;
  if (style === 2) return `${toHangulDigits(head + mid + last)}`;
  if (style === 3) return `${toHangulDigits(head)}-${mid}-${last}`;
  // 소수의 아라비아
  if (style === 4) return `${head}-${mid}-${last}`;
  if (style === 5) return `${head} ${mid} ${last}`;
  return `${head}${mid}${last}`;
}

const LETTER_SPELL: Record<string, string> = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치",
  i: "아이", j: "제이", k: "케이", l: "엘", m: "엠", n: "엔", o: "오", p: "피",
  q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스",
  y: "와이", z: "제트",
};
const DIGIT_SPELL = "공일이삼사오육칠팔구";

/** 로컬파트를 철자/숫자 발음으로 (에이 비 씨 일이) */
function spellLocal(local: string): string {
  return local
    .split("")
    .map((ch) =>
      LETTER_SPELL[ch.toLowerCase()] ??
      (/\d/.test(ch) ? DIGIT_SPELL[+ch] : ch),
    )
    .join(" ");
}

// (영문도메인, [발음변형])
const EMAIL_PROVIDERS: [string, string[]][] = [
  ["gmail.com", ["지메일", "쥐메일", "지멜", "구글메일"]],
  ["naver.com", ["네이버"]],
  ["daum.net", ["다음"]],
  ["hanmail.net", ["한메일"]],
  ["kakao.com", ["카카오", "카카오메일"]],
  ["hotmail.com", ["핫메일"]],
  ["yahoo.com", ["야후"]],
  ["outlook.com", ["아웃룩", "아웃룩메일"]],
  ["icloud.com", ["아이클라우드"]],
  ["nate.com", ["네이트"]],
  ["proton.me", ["프로톤", "프로톤메일"]],
];
const TLD_SPOKEN: Record<string, string[]> = {
  com: ["컴", "콤"], net: ["넷"], org: ["오알지"], kr: ["케이알"],
  me: ["미"], io: ["아이오"], dev: ["데브"], "co.kr": ["씨오케이알"],
};

function randomEmail() {
  const base = `${pick(["user", "mail", "info", "cs", "ops", "hong", "kim", "team"])}${digits(randInt(2, 5))}`;
  const [engDomain, spokenList] = pick(EMAIL_PROVIDERS);
  const at = pick(["골뱅이", "골뱅이", "앳", "@"]);
  const dot = pick(["점", "쩜", "닷", "."]);
  const style = randInt(0, 6);

  // 완성형 ascii
  if (style === 0) return `${base}@${engDomain}`;
  // 붙인 구어 도메인
  if (style === 1) return `${base}@${pick(spokenList)}${dot}${pick(TLD_SPOKEN[engDomain.split(".").slice(-1)[0]!] ?? ["컴"])}`;

  const prov = pick(spokenList);
  const tldKey = engDomain.endsWith("co.kr") ? "co.kr" : engDomain.split(".").slice(-1)[0]!;
  const tld = pick(TLD_SPOKEN[tldKey] ?? ["컴"]);

  // 철자 발음 로컬 (메일 큐 포함)
  if (style === 2) return `메일 주소는 ${spellLocal(base)} ${at} ${prov} ${dot} ${tld}`;
  if (style === 3) return `이메일은 ${spellLocal(pick(["abc", "cs", "info", "hr", "sales"]))} ${at} ${prov} ${dot} ${tld}`;
  // 숫자 로컬 한글발음
  if (style === 4) return `${toHangulDigits(digits(4))} ${at} ${prov} ${dot} ${tld}`;
  // 완전 구어
  if (style === 5) return `${base} ${at} ${prov} ${dot} ${tld}`;
  return `${base}@${engDomain}`;
}

function randomRrn() {
  const body = `${String(randInt(70, 99)).padStart(2, "0")}${String(randInt(1, 12)).padStart(2, "0")}${String(randInt(1, 28)).padStart(2, "0")}`;
  const tail = `${randInt(1, 4)}${digits(6)}`;
  const r = Math.random();
  // 발음 위주
  if (r < 0.5) return `${toHangulDigits(body)}${pick(["에", "다시", " "])}${toHangulDigits(tail)}`;
  if (r < 0.7) return toHangulDigits(body + tail);
  if (r < 0.85) return `${body}-${tail}`;
  return `${body}${tail}`;
}

function randomForeignId() {
  const body = `${String(randInt(80, 99)).padStart(2, "0")}${String(randInt(1, 12)).padStart(2, "0")}${String(randInt(1, 28)).padStart(2, "0")}`;
  const tail = `${randInt(5, 8)}${digits(6)}`;
  const r = Math.random();
  if (r < 0.5) return `${toHangulDigits(body)}${pick(["에", "다시", " "])}${toHangulDigits(tail)}`;
  if (r < 0.7) return toHangulDigits(body + tail);
  return `${body}-${tail}`;
}

function randomCard() {
  const raw = digits(16);
  const r = Math.random();
  // 발음 위주
  if (r < 0.5) return spokenGroups(raw, [4, 4, 4, 4]);
  if (r < 0.7) return toHangulDigits(raw);
  if (r < 0.85) return formatGroups(raw, [4, 4, 4, 4]);
  return raw;
}

function randomAccount() {
  const spec = pick(BANK_FORMAT_SPECS);
  const groups = pick(spec.groups);
  const len = groups.reduce((a, b) => a + b, 0);
  let raw = digits(len);
  if (spec.prefixes?.length && Math.random() > 0.5) {
    const prefix = pick(spec.prefixes);
    raw = prefix + digits(Math.max(0, len - prefix.length)).slice(0, len - prefix.length);
    if (raw.length < len) raw = raw.padEnd(len, "0");
    raw = raw.slice(0, len);
  }

  const bank = pick(BANK_ALIASES);
  // 발음 위주 계좌번호
  const sr = Math.random();
  const styled =
    sr < 0.45
      ? spokenGroups(raw, groups)
      : sr < 0.65
        ? toHangulDigits(raw)
        : sr < 0.82
          ? formatGroups(raw, groups)
          : raw;

  const mode = randInt(0, 5);
  if (mode === 0) return `${bank} ${styled}`;
  if (mode === 1) return `${styled} ${bank}`;
  if (mode === 2) return `${styled}${bank}`;
  if (mode === 3) return `${styled} 이고 ${bank} 입니다`;
  if (mode === 4) return `${bank}은행 ${styled}`;
  return styled;
}

function randomAddress() {
  const city = pick(CITIES);
  const spoken = Math.random() < 0.55;
  const roadNo = String(randInt(10, 300));
  const bun = spoken ? toHangulDigits(roadNo) : roadNo;
  let detail = "";
  if (Math.random() > 0.4) {
    const floor = String(randInt(1, 20));
    const ho = String(randInt(100, 2000));
    detail = spoken
      ? ` ${toHangulDigits(floor)}층 ${toHangulDigits(ho)}호`
      : ` ${floor}층 ${ho}호`;
  }
  return `${city.sido} ${city.gu} ${city.road} ${bun}${detail}`;
}

function randomPassport() {
  const prefix = pick(["M", "S", "R", "G"]);
  const num = digits(8);
  const spoken: Record<string, string[]> = {
    M: ["엠", "엠이"],
    S: ["에스"],
    R: ["알", "아르"],
    G: ["지", "쥐"],
  };
  // 발음 위주
  if (Math.random() < 0.6) return `${pick(spoken[prefix]!)} ${toHangulDigits(num)}`;
  return `${prefix}${num}`;
}

function randomDriverLicense() {
  const area = pick(["11", "12", "13", "14", "21", "22", "23", "24"]);
  const b = digits(2);
  const c = digits(6);
  const d = digits(2);
  // 발음 위주
  if (Math.random() < 0.6) {
    const sep = pick(["에", "다시", " "]);
    return `${toHangulDigits(area)}${sep}${toHangulDigits(b)}${sep}${toHangulDigits(c)}${sep}${toHangulDigits(d)}`;
  }
  return `${area}-${b}-${c}-${d}`;
}

function randomBizNo() {
  const a = digits(3);
  const b = digits(2);
  const c = digits(5);
  const r = Math.random();
  if (r < 0.5) {
    const sep = pick(["에", "다시", " "]);
    return `${toHangulDigits(a)}${sep}${toHangulDigits(b)}${sep}${toHangulDigits(c)}`;
  }
  if (r < 0.7) return toHangulDigits(a + b + c);
  return `${a}-${b}-${c}`;
}

function randomVehicle() {
  const h = pick(["가", "나", "다", "라", "마", "거", "너", "바", "사", "허", "호"]);
  const n1 = randInt(0, 2) === 0 ? digits(3) : digits(2);
  const n2 = digits(4);
  const region = randInt(0, 2) === 0 ? `${pick(["서울", "경기", "부산", "인천"])} ` : "";
  // 발음 위주
  if (Math.random() < 0.6) return `${region}${toHangulDigits(n1)}${h}${toHangulDigits(n2)}`;
  return `${region}${n1}${h}${n2}`;
}

function randomIp() {
  const parts = [randInt(1, 223), randInt(0, 255), randInt(0, 255), randInt(1, 254)];
  // 발음 위주 (점 대신 점/쩜 발음)
  if (Math.random() < 0.5) {
    const dot = pick([" 점 ", " 쩜 ", "."]);
    return parts.map((p) => toHangulDigits(String(p))).join(dot);
  }
  return parts.join(".");
}

function randomEmpId() {
  const prefix = pick(["EMP", "HR", "A", "KR", "F"]);
  const num = digits(randInt(4, 6));
  if (Math.random() < 0.5) return `${prefix}${pick(["-", ""])}${toHangulDigits(num)}`;
  return `${prefix}-${num}`;
}

function randomHealthId() {
  const a = digits(randInt(4, 6));
  const b = digits(randInt(4, 6));
  const r = Math.random();
  // 발음 위주 + 하고 연결
  if (r < 0.5) return `${toHangulDigits(a)}${pick(["하고", "하고요"])}${toHangulDigits(b)}`;
  if (r < 0.7) return `${a}하고${b}`;
  if (r < 0.85) return toHangulDigits(a + b);
  return a + b;
}

function randomSecret() {
  const style = randInt(0, 3);
  if (style === 0) return `sk-${digits(8)}${"abcdef".repeat(6)}`;
  if (style === 1) return `ghp_${"Ab1Cd2Ef3Gh4Ij5Kl6Mn7Op8Qr9St0UvWx"}`;
  if (style === 2) return `AKIA${"A1B2C3D4E5F6G7H8"}`;
  return `api_key=${digits(20)}`;
}

function valueFor(kind: PiiKind): string {
  switch (kind) {
    case "phone":
      return randomPhone();
    case "email":
      return randomEmail();
    case "rrn":
      return randomRrn();
    case "card":
      return randomCard();
    case "account":
      return randomAccount();
    case "address":
      return randomAddress();
    case "name":
      return randomName();
    case "passport":
      return randomPassport();
    case "driver_license":
      return randomDriverLicense();
    case "biz_no":
      return randomBizNo();
    case "vehicle":
      return randomVehicle();
    case "ip":
      return randomIp();
    case "emp_id":
      return randomEmpId();
    case "health_id":
      return randomHealthId();
    case "foreign_id":
      return randomForeignId();
    case "secret":
      return randomSecret();
  }
}

const LABELS: Partial<Record<PiiKind, string[]>> = {
  phone: ["연락처", "번호", "휴대폰", "전화", "전번"],
  email: ["메일", "이메일", "이멜", "메일주소"],
  rrn: ["주민", "주민번호", "주민등록번호"],
  card: ["카드", "카드번호"],
  account: ["계좌", "입금", "계좌번호", "송금"],
  address: ["주소", "방문지", "소재지", "배송지"],
  name: ["이름", "담당", "고객", "담당자", "성함"],
  passport: ["여권", "여권번호", "패스포트"],
  driver_license: ["면허", "운전면허", "면허번호"],
  biz_no: ["사업자", "사업자번호", "사업자등록번호"],
  vehicle: ["차량", "차량번호", "번호판", "차번호"],
  ip: ["IP", "아이피", "아이피주소"],
  emp_id: ["사번", "직원번호", "사원번호"],
  health_id: ["건보", "건강보험", "가입자번호"],
  foreign_id: ["외국인등록", "외국인번호", "외국인등록번호"],
  secret: ["비밀키", "api키", "토큰", "시크릿"],
};

function wrapPiece(kind: PiiKind, value: string): string {
  const style = randInt(0, 4);
  const label = pick(LABELS[kind] ?? [kind]);
  if (style === 0) return value;
  if (style === 1) return `${label} ${value}`;
  if (style === 2) return `${label}는 ${value}`;
  if (style === 3) return `${label}: ${value}`;
  return `${value} (${label})`;
}

/**
 * 무작위 PII 조각 + 노이즈 단어 조합 한 줄.
 * 정답 키/대화 스크립트 없이 조합만 섞는다.
 */
export function generateRandomText(options?: {
  pieceCount?: number;
}): string {
  const count = options?.pieceCount ?? randInt(3, 8);
  const kinds = shuffle(PII_KINDS).slice(0, count);
  const parts: string[] = [];

  if (Math.random() > 0.4) parts.push(pick(NOISE));

  for (const kind of kinds) {
    if (Math.random() > 0.55) parts.push(pick(NOISE));
    parts.push(wrapPiece(kind, valueFor(kind)));
  }

  if (Math.random() > 0.5) parts.push(pick(NOISE));

  const joiner = pick([" ", ", ", " / ", "  "]);
  return parts.join(joiner).replace(/\s+/g, " ").trim();
}

export function generateRandomTexts(options?: {
  count?: number;
  pieceCount?: number;
}): { title: string; texts: string[] } {
  const n = options?.count ?? randInt(4, 7);
  const texts = Array.from({ length: n }, () =>
    generateRandomText({ pieceCount: options?.pieceCount }),
  );
  return {
    title: `무작위 조합, ${n}줄`,
    texts,
  };
}

/**
 * 스트림 UI 호환용. 화자 대화가 아니라 샘플 텍스트 묶음.
 */
export function generateRandomConversation(options?: {
  utteranceCount?: number;
}): { title: string; utterances: TranscriptUtterance[] } {
  const batch = generateRandomTexts({
    count: options?.utteranceCount ?? randInt(4, 7),
  });
  return {
    title: batch.title,
    utterances: batch.texts.map((text) => ({
      id: `u-${crypto.randomUUID()}`,
      speaker: "",
      delayMs: randInt(200, 500),
      text,
    })),
  };
}
