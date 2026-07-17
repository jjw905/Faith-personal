/**
 * 발음(STT) 버전 무작위 대입 테스트.
 *
 * - PII를 아라비아보다 한글발음/구어(에·다시·골뱅이·점/쩜…)로 생성
 * - 회의 어휘 + 군말 조합
 * - 문맥에만 자모 혼동 노이즈 0~30% 주입
 * - spoken.ts 매핑 사용
 *
 * 실행:
 *   npx tsx scripts/test-stt-noise.ts
 *   HYBRID=1 N=80 npx tsx scripts/test-stt-noise.ts
 */

import { maskPii } from "../src/lib/masking/mask";
import {
  AT_SPOKEN,
  CUE_VARIANTS,
  DIGIT_SPOKEN,
  DOT_SPOKEN,
  JAMO_CONFUSION,
  PASSPORT_PREFIX_SPOKEN,
  SEP_SPOKEN,
} from "../src/lib/masking/spoken";
import type { PiiType } from "../src/lib/masking/types";

const MEETING_WORDS = [
  "안건", "일정", "마감", "기한", "데드라인", "진행", "공유", "검토", "논의",
  "보고", "정리", "결정", "승인", "결재", "예산", "계약", "견적", "납품",
  "담당", "책임", "확인", "부탁", "요청", "전달", "회신", "첨부", "참고",
  "관련", "반영", "수정", "확정", "취소", "연기", "우선", "일단", "추가로",
  "참석", "불참", "회의록", "액션아이템", "팔로업", "피드백", "이슈", "리스크",
  "스케줄", "미팅", "컨펌", "리뷰", "본론", "다음", "이번", "저번", "부서",
  "팀장", "과장", "대리", "고객", "거래처", "입금", "송금", "세금계산서",
  "그러면", "그리고", "그래서", "일리가", "동의합니다", "정리하면", "요약하면",
  "다음주", "오늘", "내일", "이번주", "확인해주세요", "부탁드립니다", "공유드립니다",
];
const FILLERS = ["어", "그", "저기", "음", "네", "자", "이제", "그게", "뭐", "다시"];

const rint = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

/** 자리별 발음 (공/영/제로, 육/륙 등) — 전화·계좌·주민용 */
function digitSpoken(d: string, loose = false): string {
  const alts = DIGIT_SPOKEN[d] ?? [d];
  // 전화에서는 하나/둘 등 고유어 비중을 낮춤
  if (!loose && (d === "1" || d === "2" || d === "3" || d === "4")) {
    return pick(alts.slice(0, 1)); // 일/이/삼/사
  }
  if (d === "0") return pick(["공", "영", "제로"]);
  if (d === "6") return pick(["육", "륙"]);
  return pick(alts.slice(0, Math.min(2, alts.length)));
}

function toHangulDigits(num: string, loose = false): string {
  return [...num].map((d) => (/\d/.test(d) ? digitSpoken(d, loose) : d)).join("");
}

function spokenNumber(num: string): string {
  const r = Math.random();
  if (r < 0.15) return num;
  if (r < 0.3) return num.split("").join(" ");
  if (r < 0.5) {
    const chunks: string[] = [];
    for (let i = 0; i < num.length; ) {
      const step = pick([3, 4]);
      chunks.push(num.slice(i, i + step));
      i += step;
    }
    return chunks.join(" ");
  }
  if (r < 0.75) return toHangulDigits(num);
  // 구분자 발음
  const sep = pick([...SEP_SPOKEN]);
  const mid = Math.floor(num.length / 2);
  return `${toHangulDigits(num.slice(0, mid))}${sep}${toHangulDigits(num.slice(mid))}`;
}

const LETTER_SPELL: Record<string, string> = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지", h: "에이치",
  i: "아이", j: "제이", k: "케이", l: "엘", m: "엠", n: "엔", o: "오", p: "피",
  q: "큐", r: "알", s: "에스", t: "티", u: "유", v: "브이", w: "더블유", x: "엑스",
  y: "와이", z: "제트",
};

function spellLocal(local: string): string {
  return [...local]
    .map((ch) => LETTER_SPELL[ch.toLowerCase()] ?? (/\d/.test(ch) ? digitSpoken(ch) : ch))
    .join(" ");
}

interface Pii {
  type: PiiType;
  value: string;
}

const BANK_ACCT: { bank: string; make: () => string }[] = [
  { bank: "신한", make: () => `${rint(100, 999)}-${rint(100, 999)}-${rint(100000, 999999)}` },
  { bank: "국민", make: () => `${rint(100000, 999999)}-${rint(10, 99)}-${rint(100000, 999999)}` },
  { bank: "우리", make: () => `1002-${rint(100, 999)}-${rint(100000, 999999)}` },
  { bank: "농협", make: () => `301-${rint(1000, 9999)}-${rint(1000, 9999)}-${rint(10, 99)}` },
  { bank: "카카오뱅크", make: () => `3333-${rint(10, 99)}-${rint(1000000, 9999999)}` },
];

function buildPhone(): Pii {
  const head = pick(["010", "010", "011", "016", "017", "018"]);
  const mid = `${rint(1000, 9999)}`;
  const last = `${rint(1000, 9999)}`;
  const body = head + mid + last;
  const r = Math.random();
  let v: string;
  if (r < 0.12) v = `${head}-${mid}-${last}`;
  else if (r < 0.22) v = `${head} ${mid} ${last}`;
  else if (r < 0.32) v = body;
  else if (r < 0.55) {
    const sep = pick(["에", "에", "다시", "하이픈"]);
    v = `${toHangulDigits(head)}${sep} ${mid}${sep} ${last}`;
  } else if (r < 0.8) v = toHangulDigits(body);
  else v = spokenNumber(body);
  return { type: "phone", value: v };
}

function buildRrn(): Pii {
  const b = `${rint(60, 99)}${`${rint(1, 12)}`.padStart(2, "0")}${`${rint(1, 28)}`.padStart(2, "0")}`;
  const t = `${pick([1, 2, 3, 4])}${rint(100000, 999999)}`;
  const r = Math.random();
  let v: string;
  if (r < 0.35) v = `${b}-${t}`;
  else if (r < 0.55) v = `${b}${t}`;
  else if (r < 0.7) v = `${b} ${t}`;
  else if (r < 0.85) {
    const sep = pick(["에", "다시", " "]);
    v = `${b}${sep}${t}`;
  } else v = toHangulDigits(b + t);
  return { type: "rrn", value: v };
}

function buildCard(): Pii {
  const g = Array.from({ length: 4 }, () => `${rint(1000, 9999)}`);
  const r = Math.random();
  let v: string;
  if (r < 0.3) v = g.join("-");
  else if (r < 0.5) v = g.join(" ");
  else if (r < 0.7) v = g.join(pick(["에", "다시"]));
  else v = toHangulDigits(g.join(""));
  return { type: "card", value: v };
}

function buildAccount(): Pii {
  const spec = pick(BANK_ACCT);
  let num = spec.make();
  const r = Math.random();
  if (r < 0.25) num = num.replace(/-/g, " ");
  else if (r < 0.4) num = num.replace(/-/g, "");
  else if (r < 0.6) num = num.replace(/-/g, pick(["에", "다시"]));
  else if (r < 0.8) num = toHangulDigits(num.replace(/-/g, ""));
  const v = Math.random() < 0.5 ? `${spec.bank} ${num}` : `${num} ${spec.bank}`;
  return { type: "account", value: v };
}

function buildEmail(): Pii {
  const user = Array.from({ length: rint(3, 7) }, () =>
    pick("abcdefghijklmnopqrstuvwxyz0123456789".split("")),
  ).join("");
  const short = Array.from({ length: rint(2, 4) }, () =>
    pick("abcdefghijklmnopqrstuvwxyz".split("")),
  ).join("");
  const prov = pick([
    ["지메일", "컴", "gmail.com"],
    ["쥐메일", "컴", "gmail.com"],
    ["네이버", "컴", "naver.com"],
    ["다음", "넷", "daum.net"],
    ["야후", "컴", "yahoo.com"],
    ["핫메일", "컴", "hotmail.com"],
    ["아웃룩", "컴", "outlook.com"],
    ["프로톤", "미", "proton.me"],
    ["네이트", "컴", "nate.com"],
  ] as const);
  const at = pick([...AT_SPOKEN]);
  const dot = pick([...DOT_SPOKEN]);
  const r = Math.random();
  let v: string;
  if (r < 0.15) v = `${user}@${prov[2]}`;
  else if (r < 0.35) v = `${user}@${prov[0]}${dot}${prov[1]}`;
  else if (r < 0.6) v = `${spellLocal(short)} ${at} ${prov[0]} ${dot} ${prov[1]}`;
  else if (r < 0.8) v = `${toHangulDigits(`${rint(1000, 9999)}`)} ${at} ${prov[0]} ${dot} ${prov[1]}`;
  else v = `${user} ${at} ${prov[0]} ${dot} ${prov[1]}`;
  return { type: "email", value: v };
}

function buildName(): Pii {
  const s = pick("김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하".split(""));
  const g = pick(["민수", "서연", "지훈", "수빈", "하은", "도윤", "예진", "준호", "채원", "건우"]);
  return { type: "name", value: s + g };
}

function buildAddress(): Pii {
  const sido = pick(["서울특별시", "부산광역시", "대전광역시", "경기도", "인천광역시"]);
  const gu = pick(["강남구", "유성구", "해운대구", "분당구", "연수구"]);
  const road = pick(["테헤란로", "대학로", "센텀중앙로", "판교역로", "월드컵북로"]);
  const num = rint(1, 400);
  const tail = Math.random() < 0.55 ? ` ${rint(1, 25)}층 ${rint(100, 2500)}호` : "";
  return { type: "address", value: `${sido} ${gu} ${road} ${num}${tail}` };
}

function buildHealth(): Pii {
  if (Math.random() < 0.55) {
    const joiner = pick(["하고", " 하고 ", "하고요"]);
    return { type: "health_id", value: `${rint(10000, 99999999)}${joiner}${rint(1000, 99999999)}` };
  }
  return { type: "health_id", value: spokenNumber(`${rint(10 ** 9, 10 ** 12 - 1)}`) };
}

function buildPassport(): Pii {
  const prefix = pick(["M", "S", "R", "G"] as const);
  const num = `${rint(10000000, 99999999)}`;
  if (Math.random() < 0.55) {
    return { type: "passport", value: `${pick(PASSPORT_PREFIX_SPOKEN[prefix]!)} ${num}` };
  }
  return { type: "passport", value: `${prefix}${num}` };
}

function buildDriverLicense(): Pii {
  const a = `${rint(11, 28)}`;
  const y = `${rint(10, 25)}`.padStart(2, "0");
  const s = `${rint(100000, 999999)}`;
  const c = `${rint(10, 99)}`;
  const sep = pick(["-", " ", "에", "다시", "하이픈"]);
  return { type: "driver_license", value: `${a}${sep}${y}${sep}${s}${sep}${c}` };
}

function buildBizNo(): Pii {
  const sep = pick(["-", " ", "에", "다시"]);
  return {
    type: "biz_no",
    value: `${rint(100, 999)}${sep}${rint(10, 99)}${sep}${rint(10000, 99999)}`,
  };
}

function buildVehicle(): Pii {
  const h = pick("가나다라마거너더러모보소조하허호바사".split(""));
  if (Math.random() < 0.45) {
    return { type: "vehicle", value: `${pick(["서울", "경기", "부산"])} ${rint(10, 99)}${h}${rint(1000, 9999)}` };
  }
  return { type: "vehicle", value: `${rint(10, 999)}${h}${rint(1000, 9999)}` };
}

function buildForeignId(): Pii {
  const b = `${rint(80, 99)}${`${rint(1, 12)}`.padStart(2, "0")}${`${rint(1, 28)}`.padStart(2, "0")}`;
  const t = `${pick([5, 6, 7, 8])}${rint(100000, 999999)}`;
  const sep = pick(["-", " ", "에"]);
  return { type: "foreign_id", value: `${b}${sep}${t}` };
}

function buildIp(): Pii {
  return {
    type: "ip",
    value: `${rint(1, 255)}.${rint(0, 255)}.${rint(0, 255)}.${rint(1, 255)}`,
  };
}

function buildEmpId(): Pii {
  const prefix = pick(["EMP", "F", "KR", "A"]);
  const num = rint(1000, 999999);
  return { type: "emp_id", value: Math.random() < 0.5 ? `${prefix}-${num}` : `${prefix}${num}` };
}

function buildSecret(): Pii {
  const styles = [
    () => "sk-" + Array.from({ length: 40 }, () => pick("abcdefghijklmnopqrstuvwxyz0123456789".split(""))).join(""),
    () => "AKIA" + Array.from({ length: 16 }, () => pick("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789".split(""))).join(""),
    () => "ghp_" + Array.from({ length: 36 }, () => pick("abcdefghijklmnopqrstuvwxyz0123456789".split(""))).join(""),
    () => "api_key=" + Array.from({ length: 24 }, () => pick("abcdefghijklmnopqrstuvwxyz0123456789".split(""))).join(""),
  ];
  return { type: "secret", value: pick(styles)() };
}

const BUILDERS: (() => Pii)[] = [
  buildPhone, buildRrn, buildCard, buildAccount, buildEmail,
  buildName, buildAddress, buildHealth, buildSecret,
  buildPassport, buildDriverLicense, buildBizNo, buildVehicle,
  buildForeignId, buildIp, buildEmpId,
];

function cueFor(type: PiiType): string {
  const list = CUE_VARIANTS[type];
  if (!list?.length) return "";
  const base = pick(list);
  // 조사는 는/가/: 만 (은 오용 방지)
  const particle = pick(["는", "는", "가", ":", ""]);
  if (!particle) return base;
  return particle === ":" ? `${base}:` : `${base}${particle}`;
}

interface Sample {
  text: string;
  piis: { value: string; type: PiiType; start: number; end: number }[];
}

function buildSample(): Sample {
  const count = rint(2, 4);
  const chosen = Array.from({ length: count }, () => pick(BUILDERS)());
  const parts: { txt: string; protect?: boolean }[] = [];

  const pushWords = (n: number) => {
    for (let i = 0; i < n; i++) {
      parts.push({ txt: pick(Math.random() < 0.25 ? FILLERS : MEETING_WORDS) });
    }
  };

  pushWords(rint(1, 3));
  for (const p of chosen) {
    if (Math.random() < 0.7) pushWords(rint(1, 2));
    // 발음 테스트: 라벨(문맥)을 거의 항상 붙임 — 여권/면허 등 규칙이 문맥 의존
    if (Math.random() < 0.85) {
      const cue = cueFor(p.type);
      if (cue) parts.push({ txt: cue });
    }
    parts.push({ txt: p.value, protect: true });
  }
  pushWords(rint(1, 3));

  let text = "";
  const piis: Sample["piis"] = [];
  let chosenIdx = 0;
  parts.forEach((part, i) => {
    if (i > 0) text += " ";
    const start = text.length;
    text += part.txt;
    if (part.protect) {
      const found = chosen[chosenIdx++];
      if (found) piis.push({ value: part.txt, type: found.type, start, end: start + part.txt.length });
    }
  });
  return { text, piis };
}

// ─────────────────────────── 노이즈 (spoken.ts 자모 혼동) ───────────────────────────
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split("");
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split("");

function jamoSwap(ch: string): string {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return ch;
  const cho = Math.floor(code / 588);
  const jung = Math.floor((code % 588) / 28);
  const jong = code % 28;
  let c = CHO[cho]!;
  let j = JUNG[jung]!;
  if (Math.random() < 0.6 && JAMO_CONFUSION[c]?.length) c = pick(JAMO_CONFUSION[c]!);
  else if (JAMO_CONFUSION[j]?.length) j = pick(JAMO_CONFUSION[j]!);
  const ci = CHO.indexOf(c);
  const ji = JUNG.indexOf(j);
  if (ci < 0 || ji < 0) return ch;
  return String.fromCharCode(0xac00 + (ci * 21 + ji) * 28 + jong);
}

/** 보호 구간(PII) 밖만 손상 — 발음 PII 자체는 유지하고 문맥만 노이즈 */
function injectNoise(sample: Sample, p: number): string {
  if (p <= 0) return sample.text;
  const t = sample.text;
  const isProtected = (i: number) => sample.piis.some((x) => i >= x.start && i < x.end);
  let out = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (isProtected(i) || Math.random() > p) {
      out += ch;
      continue;
    }
    const op = Math.random();
    if (ch === " ") out += op < 0.5 ? "" : "  ";
    else if (op < 0.45) out += jamoSwap(ch);
    else if (op < 0.7) {
      /* delete */
    } else if (op < 0.85) out += ch + ch;
    else out += ch + " ";
  }
  return out;
}

const HYBRID = process.env.HYBRID === "1";
const API = process.env.API_URL ?? "http://localhost:3000/api/mask";

async function maskText(text: string): Promise<string> {
  if (!HYBRID) return maskPii(text).masked;
  const res = await fetch(API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const j = (await res.json()) as { masked: string };
  return j.masked;
}

function isLeaked(masked: string, value: string): boolean {
  return masked.includes(value);
}

async function main() {
  const N = Number(process.env.N ?? 200);
  const levels = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3];
  console.log(`모드: ${HYBRID ? "HYBRID(규칙+NER)" : "규칙 엔진"} · 발음버전 · 샘플/구간=${N}`);
  console.log("─".repeat(72));
  console.log("노이즈 |  PII수 | 마스킹 | 리콜   | 유형별 최저 리콜");
  console.log("─".repeat(72));

  const failures: { noise: number; type: string; value: string; masked: string }[] = [];

  // 발음 샘플 미리보기
  console.log("발음 샘플:");
  for (let i = 0; i < 5; i++) {
    const s = buildSample();
    console.log(`  · ${s.text}`);
  }
  console.log("─".repeat(72));

  for (const p of levels) {
    let total = 0;
    let masked = 0;
    const perType: Record<string, { t: number; m: number }> = {};
    for (let n = 0; n < N; n++) {
      const s = buildSample();
      const noisy = injectNoise(s, p);
      const out = await maskText(noisy);
      for (const pii of s.piis) {
        total++;
        perType[pii.type] ??= { t: 0, m: 0 };
        perType[pii.type]!.t++;
        if (!isLeaked(out, pii.value)) {
          masked++;
          perType[pii.type]!.m++;
        } else if (failures.length < 40 && p >= 0) {
          failures.push({ noise: p, type: pii.type, value: pii.value, masked: out });
        }
      }
    }
    const recall = ((masked / total) * 100).toFixed(1);
    const worst = Object.entries(perType)
      .map(([k, v]) => [k, v.m / v.t] as const)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 3)
      .map(([k, r]) => `${k} ${(r * 100).toFixed(0)}%`)
      .join(", ");
    console.log(
      `${(p * 100).toFixed(0).padStart(4)}%  | ${`${total}`.padStart(5)}  | ${`${masked}`.padStart(5)}  | ${recall.padStart(5)}% | ${worst}`,
    );
  }

  console.log("─".repeat(72));
  console.log("유형별 전체(0% 노이즈 기준은 위 표 첫 행) · 실패 샘플:");
  for (const f of failures.filter((x) => x.noise === 0).slice(0, 8)) {
    console.log(`  [0% ${f.type}] "${f.value}"`);
    console.log(`     → ${f.masked}`);
  }
  for (const f of failures.filter((x) => x.noise > 0).slice(0, 8)) {
    console.log(`  [${(f.noise * 100).toFixed(0)}% ${f.type}] "${f.value}"`);
    console.log(`     → ${f.masked}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
