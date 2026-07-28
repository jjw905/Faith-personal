/**
 * 한글 발음 비교.
 *
 * STT 오인식은 대부분 소리는 같고 글자만 다르다 (803 국립공원 = 팔공삼, 팔공산).
 * 그래서 숫자, 영문을 읽는 소리로 바꾼 뒤 자모 단위로 견준다.
 * 보정 추천이 원문과 다른 말을 지어내지 않도록 막는 데 쓴다.
 */

const CHO = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];
const JUNG = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
];
const JONG = [
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ",
  "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const DIGIT_SINO = ["공", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];

const ALPHA_KO: Record<string, string> = {
  a: "에이", b: "비", c: "씨", d: "디", e: "이", f: "에프", g: "지",
  h: "에이치", i: "아이", j: "제이", k: "케이", l: "엘", m: "엠", n: "엔",
  o: "오", p: "피", q: "큐", r: "알", s: "에스", t: "티", u: "유",
  v: "브이", w: "더블유", x: "엑스", y: "와이", z: "제트",
};

/** 숫자, 영문을 한글 소리로. 코드형 숫자는 한 자리씩 읽는다. */
export function toSpokenKorean(text: string): string {
  let out = "";
  for (const ch of text.toLowerCase()) {
    if (ch >= "0" && ch <= "9") {
      out += DIGIT_SINO[Number(ch)]!;
      continue;
    }
    const alpha = ALPHA_KO[ch];
    out += alpha ?? ch;
  }
  return out;
}

/** 소리가 거의 같은 자모끼리 묶어 하나로 본다. */
function foldJamo(j: string): string {
  if (j === "ㄲ") return "ㄱ";
  if (j === "ㄸ") return "ㄷ";
  if (j === "ㅃ") return "ㅂ";
  if (j === "ㅆ") return "ㅅ";
  if (j === "ㅉ") return "ㅈ";
  if (j === "ㅐ" || j === "ㅔ" || j === "ㅒ" || j === "ㅖ") return "ㅐ";
  if (j === "ㅚ" || j === "ㅙ" || j === "ㅞ") return "ㅚ";
  // 영/공은 받침 ㅇ 유무만 다르다. 종성 ㅇ, ㄴ, ㅁ 혼동도 흔하다.
  if (j === "ㄴ" || j === "ㅁ") return "ㄴ";
  return j;
}

/** 한글 문자열 → 자모열. 숫자, 영문은 읽는 소리로 먼저 바꾼다. */
export function toJamo(text: string): string {
  const spoken = toSpokenKorean(text).replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ]/g, "");
  let out = "";
  for (const ch of spoken) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const index = code - 0xac00;
      out += foldJamo(CHO[Math.floor(index / 588)]!);
      out += foldJamo(JUNG[Math.floor((index % 588) / 28)]!);
      const jong = JONG[index % 28]!;
      if (jong) out += foldJamo(jong);
    } else {
      out += foldJamo(ch);
    }
  }
  return out;
}

const SOUND_GROUPS = [
  new Set(["ㄱ", "ㄲ", "ㅋ"]),
  new Set(["ㄷ", "ㄸ", "ㅌ"]),
  new Set(["ㅂ", "ㅃ", "ㅍ"]),
  new Set(["ㅅ", "ㅆ", "ㅈ", "ㅉ", "ㅊ"]),
  new Set(["ㄴ", "ㅇ"]),
  new Set(["ㅏ", "ㅑ"]),
  new Set(["ㅓ", "ㅕ"]),
  new Set(["ㅗ", "ㅛ"]),
  new Set(["ㅜ", "ㅠ"]),
  new Set(["ㅡ", "ㅣ", "ㅢ"]),
] as const;

/**
 * 한국어 STT에서 자주 생기는 가까운 소리는 한 글자 전체 오류보다 싸게 센다.
 * 특히 초성 ㄴ 탈락은 뉴시스 → 유시스 같은 고유명사 오류를 잡는 데 필요하다.
 */
function substitutionCost(a: string, b: string): number {
  if (a === b) return 0;
  if (
    (a === "ㄴ" && b === "ㅇ") ||
    (a === "ㅇ" && b === "ㄴ")
  ) {
    return 0.35;
  }
  if (SOUND_GROUPS.some((group) => group.has(a) && group.has(b))) {
    return 0.55;
  }
  return 1;
}

function weightedLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j]! + 1,
        cur[j - 1]! + 1,
        prev[j - 1]! + substitutionCost(a[i - 1]!, b[j - 1]!),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

/** 두 말의 소리가 얼마나 같은지 0~1. */
export function pronunciationSimilarity(a: string, b: string): number {
  const ja = toJamo(a);
  const jb = toJamo(b);
  if (!ja || !jb) return 0;
  const distance = weightedLevenshtein(ja, jb);
  return 1 - distance / Math.max(ja.length, jb.length);
}
