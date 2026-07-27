/**
 * E1: 정렬 스팬 유형 태깅 (수정판).
 * 캐시 전사만 사용. API 호출 없음.
 *
 * npx tsx --tsconfig tsconfig.json scripts/classify-briefing-errors.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { normalize } from "./lib/cer";

const DIR = ".data/stt-bench/fixtures";
const OUT = "Faith-office/stt-term-runs/_e1_classified.json";
const ROLE_TAG = /^\[[^\]]{1,6}\]\s*/;
const INAUDIBLE = /\*{2,}/;
const MISS_RATIO = 0.5;
const ALIASES = [
  "brief-envwork",
  "brief-rda",
  "brief-mnd",
  "brief-mofa",
] as const;

type TypeId =
  | "T1_domain"
  | "T2_homophone"
  | "T3_number"
  | "T4_loanword"
  | "T5_person"
  | "T6_general"
  | "N1_filler"
  | "N2_orthography"
  | "N3_particle"
  | "U_unjudgable";

type Tagged = {
  fixture: string;
  paraIndex: number;
  type: TypeId;
  modelFault: boolean;
  dist: number;
  ref: string;
  hyp: string;
  refCtx: string;
  hypCtx: string;
  note?: string;
  ambiguous?: boolean;
  dualTypeCases?: boolean;
};

const NON_MODEL: Set<TypeId> = new Set([
  "N1_filler",
  "N2_orthography",
  "N3_particle",
  "U_unjudgable",
]);

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(
        Math.min(
          cur[j - 1]! + 1,
          prev[j]! + 1,
          prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

function mismatchSpans(ref: string, hyp: string) {
  const n = ref.length;
  const m = hyp.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  for (let i = 0; i <= n; i++) dp[i]![0] = i;
  for (let j = 0; j <= m; j++) dp[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      );
    }
  }
  type Atom = {
    kind: "eq" | "sub" | "del" | "ins";
    r?: string;
    h?: string;
    ri: number;
    hj: number;
  };
  const atoms: Atom[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (
      i > 0 &&
      j > 0 &&
      dp[i]![j] === dp[i - 1]![j - 1]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1)
    ) {
      const eq = ref[i - 1] === hyp[j - 1];
      atoms.push({
        kind: eq ? "eq" : "sub",
        r: ref[i - 1],
        h: hyp[j - 1],
        ri: i - 1,
        hj: j - 1,
      });
      i--;
      j--;
    } else if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      atoms.push({ kind: "del", r: ref[i - 1], ri: i - 1, hj: j });
      i--;
    } else {
      atoms.push({ kind: "ins", h: hyp[j - 1], ri: i, hj: j - 1 });
      j--;
    }
  }
  atoms.reverse();

  const spans: Array<{
    ref: string;
    hyp: string;
    refStart: number;
    refEnd: number;
    hypStart: number;
    hypEnd: number;
    dist: number;
  }> = [];
  let cur: (typeof spans)[number] | null = null;
  const flush = () => {
    if (cur && cur.ref.length + cur.hyp.length > 0) spans.push(cur);
    cur = null;
  };
  for (const a of atoms) {
    if (a.kind === "eq") {
      flush();
      continue;
    }
    if (!cur) {
      cur = {
        ref: "",
        hyp: "",
        refStart: a.ri,
        refEnd: a.kind === "ins" ? a.ri : a.ri + 1,
        hypStart: a.hj,
        hypEnd: a.kind === "del" ? a.hj : a.hj + 1,
        dist: 0,
      };
    }
    if (a.kind === "sub") {
      cur.ref += a.r ?? "";
      cur.hyp += a.h ?? "";
      cur.refEnd = a.ri + 1;
      cur.hypEnd = a.hj + 1;
      cur.dist += 1;
    } else if (a.kind === "del") {
      cur.ref += a.r ?? "";
      cur.refEnd = a.ri + 1;
      cur.dist += 1;
    } else {
      cur.hyp += a.h ?? "";
      cur.hypEnd = a.hj + 1;
      cur.dist += 1;
    }
  }
  flush();
  return spans;
}

function mergeSpans(
  spans: ReturnType<typeof mismatchSpans>,
  maxEqGap = 2,
): ReturnType<typeof mismatchSpans> {
  if (spans.length === 0) return spans;
  const out: ReturnType<typeof mismatchSpans> = [];
  let cur = { ...spans[0]! };
  for (let k = 1; k < spans.length; k++) {
    const s = spans[k]!;
    const gapR = s.refStart - cur.refEnd;
    const gapH = s.hypStart - cur.hypEnd;
    if (gapR <= maxEqGap && gapH <= maxEqGap) {
      cur.ref += s.ref;
      cur.hyp += s.hyp;
      cur.refEnd = s.refEnd;
      cur.hypEnd = s.hypEnd;
      cur.dist += s.dist;
    } else {
      out.push(cur);
      cur = { ...s };
    }
  }
  out.push(cur);
  return out;
}

function refParagraphs(alias: string): string[] {
  const raw = readFileSync(join(DIR, `${alias}.reference.txt`), "utf8");
  return raw
    .split("\n")
    .map((line) => line.replace(ROLE_TAG, ""))
    .filter((line) => !INAUDIBLE.test(line))
    .map((line) => normalize(line))
    .filter((p) => p.length >= 25);
}

function alignPara(para: string, hyp: string, cursor: number) {
  const lo = Math.max(0, cursor - 120);
  const hi = Math.min(hyp.length, cursor + 900);
  let best = { dist: Infinity, start: cursor, end: cursor };
  const tryAt = (start: number, len: number) => {
    const end = Math.min(hyp.length, start + len);
    const d = editDistance(para, hyp.slice(start, end));
    if (d < best.dist) best = { dist: d, start, end };
  };
  for (let start = lo; start <= hi; start += 12) {
    for (const scale of [0.9, 1.05, 1.2]) {
      tryAt(start, Math.round(para.length * scale));
    }
  }
  const from = Math.max(lo, best.start - 12);
  for (let start = from; start <= best.start + 12; start++) {
    const shortest = Math.round(para.length * 0.85);
    const longest = Math.round(para.length * 1.25);
    for (let len = shortest; len <= longest; len += 4) tryAt(start, len);
  }
  if (best.dist / para.length > MISS_RATIO) return null;
  return best;
}

function ctx(s: string, start: number, end: number, pad = 10): string {
  return s.slice(Math.max(0, start - pad), Math.min(s.length, end + pad));
}

/** 정답→전사, 문맥에서 양쪽이 보여야 인정 */
const T1_CTX: Array<[string, string]> = [
  ["씨마늘", "시방을"],
  ["난축맛돈", "난춘맛돈"],
  ["국립식량과학원", "작과학원"],
  ["오뚜기제유", "오뚜기제휴"],
  ["육가공", "육가구"],
  ["표준화", "표주화"],
  ["산학연", "산하연"],
  ["대장균", "대전균"],
  ["질소저감사료", "질소적응사료"],
  ["제로슈거", "재료수거"],
  ["안동시청", "안동지청"],
  ["감자품종", "감정품종"],
  ["찐감자", "짙은감자"],
  ["남서울대학교", "남서울대학"],
  ["공동연수", "공도연수"],
  ["저지종", "저지동"],
  ["다자간", "다작한"],
  ["기능성", "개선"],
  ["참기름", "참깨이런"],
  ["질병저항", "질병종합"],
  ["개발현황", "개발협력"],
  ["축산업", "축사육"],
  ["정례브리핑", "존내브리핑"],
  ["송이", "쓰기"],
  ["세븐일레븐", "세이브11"],
  ["지난한", "진화된"],
  ["묘수", "아니"],
  ["정기국회", "전기요금"],
  ["취해", "지내"],
  ["정보화", "정부와"],
  ["자격과", "자가가"],
  ["사항", "상황"],
  ["장해", "창의"],
];

const T2_CTX: Array<[string, string]> = [
  ["운용", "운영"],
  ["원안", "원한"],
];

const T4_CTX: Array<[string, string]> = [
  ["프랙탈그리드", "팩트라그리드"],
  ["킥오프", "키크오프"],
];

const T5_CTX: Array<[string, string]> = [
  ["안호영", "환경노동위원회"],
];

const ORTHO_EXACT: Array<[string, string]> = [
  ["7", "일곱"],
  ["10", "열"],
  ["유엔", "un"],
  ["거", "것"],
  ["그런", "근"],
  ["러한", "런"],
  ["거는", "건"],
  ["럴", "런"],
];

const FILLER_TOKENS = [
  "이제",
  "인제",
  "그러니까",
  "그리고",
  "그런데",
  "이렇게",
  "그렇게",
  "고그리",
  "근데",
  "그런",
  "매우",
  "되게",
  "먼저",
  "따로",
  "이나",
  "하고",
  "되고",
  "네그",
  "에그",
  "또어떤",
  "어",
  "음",
  "아",
  "에",
  "그",
  "좀",
  "뭐",
  "또",
  "네",
];

const PARTICLE_ONLY = new Set([
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "와",
  "과",
  "도",
  "만",
  "로",
  "요",
  "다",
  "까",
  "서",
  "고",
  "게",
  "니",
  "나",
  "니다",
  "습니다",
  "했습니다",
  "을를",
  "의에",
  "에의",
]);

function stripDiscourse(s: string): string {
  let out = s;
  for (let n = 0; n < 10; n++) {
    let changed = false;
    for (const f of [...FILLER_TOKENS].sort((a, b) => b.length - a.length)) {
      if (!f) continue;
      const next = out.split(f).join("");
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
    // 조사 조각도 말버릇 스팬 판정용으로 잠깐 제거
    for (const p of ["을", "를", "이", "가", "은", "는", "의", "에", "도", "요", "다"]) {
      const next = out.split(p).join("");
      if (next !== out) {
        out = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

function pairInCtx(
  refCtx: string,
  hypCtx: string,
  a: string,
  b: string,
): boolean {
  return a.length >= 2 && b.length >= 1 && refCtx.includes(a) && hypCtx.includes(b);
}

function classifySpan(
  ref: string,
  hyp: string,
  dist: number,
  refCtx: string,
  hypCtx: string,
): Omit<Tagged, "fixture" | "paraIndex" | "modelFault" | "dist" | "ref" | "hyp" | "refCtx" | "hypCtx"> & {
  type: TypeId;
} {
  // 1) 인사/역할 대폭 치환 → 판정 불가
  if (
    (ref.includes("안녕") && hyp.includes("기자")) ||
    (ref.includes("장관님고생") && hyp.includes("김아영")) ||
    (ref.includes("말씀부탁") && hyp === "") ||
    (ref.includes("해소하지않") && hyp === "") ||
    (dist >= 5 &&
      ref.length >= 4 &&
      hyp.length >= 4 &&
      editDistance(ref, hyp) / Math.max(ref.length, hyp.length) >= 0.8)
  ) {
    return { type: "U_unjudgable", note: "문단 내 대폭 치환/역할표 붕괴" };
  }

  // 2) 표기 변이 (뜻 동일)
  for (const [a, b] of ORTHO_EXACT) {
    if ((ref === a && hyp === b) || (ref === b && hyp === a)) {
      return { type: "N2_orthography", note: `${a}↔${b}` };
    }
  }
  if (/^[0-9]+$/.test(ref) && /^(일곱|열|하나|둘|셋|넷|다섯|여섯|여덟|아홉)$/.test(hyp)) {
    return { type: "N2_orthography", note: "숫자↔한글수사" };
  }

  // 3) 알려진 유형 문맥 쌍
  for (const [a, b] of T5_CTX) {
    if (pairInCtx(refCtx, hypCtx, a, b)) {
      return { type: "T5_person", note: `${a}→${b}` };
    }
  }
  for (const [a, b] of T2_CTX) {
    if (pairInCtx(refCtx, hypCtx, a, b)) {
      return { type: "T2_homophone", note: `${a}→${b}` };
    }
  }
  for (const [a, b] of T4_CTX) {
    if (pairInCtx(refCtx, hypCtx, a, b) || (ref.includes(a.slice(0, 3)) && hyp.includes(b.slice(0, 3)))) {
      return { type: "T4_loanword", note: `${a}→${b}` };
    }
  }
  for (const [a, b] of T1_CTX) {
    if (pairInCtx(refCtx, hypCtx, a, b)) {
      return { type: "T1_domain", note: `${a}→${b}` };
    }
    // 짧은 스팬이지만 문맥에 쌍이 분명할 때
    if (
      a.length >= 2 &&
      refCtx.includes(a) &&
      hypCtx.includes(b) &&
      (a.includes(ref) || ref.includes(a.slice(0, Math.min(2, a.length))))
    ) {
      return { type: "T1_domain", note: `${a}→${b}` };
    }
  }

  // 상반기→3반기
  if ((ref === "상" && hyp === "3") || (refCtx.includes("상반기") && hypCtx.includes("3반기"))) {
    return { type: "T3_number", note: "상반기→3반기" };
  }
  // 5~7조 → 5조에서7조 (표기 확장, 뜻 같음에 가깝)
  if (ref === "" && hyp === "조에서" && refCtx.includes("57조")) {
    return { type: "N2_orthography", note: "57조↔5조에서7조" };
  }

  // 4) 말버릇/담화표지
  if (!ref && hyp) {
    const rest = stripDiscourse(hyp);
    if (rest === "") {
      return { type: "N1_filler", note: "담화표지/말버릇 삽입" };
    }
    // 이제가 주된 삽입이고 나머지가 짧으면 말버릇 우선
    if (hyp.includes("이제") && rest.length <= 4) {
      return {
        type: "N1_filler",
        note: "이제 위주 삽입, 잔여 있음",
        ambiguous: true,
        dualTypeCases: true,
      };
    }
  }
  if (ref && !hyp) {
    const rest = stripDiscourse(ref);
    if (rest === "" || (ref.length <= 5 && /이제|인제|그러니까|그런데|그리고|이렇게|그런/.test(ref))) {
      return { type: "N1_filler", note: "말버릇/연결어 편집 삭제" };
    }
  }
  // 혼합: 이렇게→게이제 등
  if (ref && hyp && (hyp.includes("이제") || ref.includes("이제"))) {
    const r = stripDiscourse(ref);
    const h = stripDiscourse(hyp);
    if (editDistance(r, h) <= 1 && dist >= 2) {
      return {
        type: "N1_filler",
        note: "이제 치환 위주",
        ambiguous: true,
        dualTypeCases: true,
      };
    }
  }

  // 5) 조사·어미
  if (PARTICLE_ONLY.has(ref) && PARTICLE_ONLY.has(hyp)) {
    return { type: "N3_particle" };
  }
  if (!ref && PARTICLE_ONLY.has(hyp)) {
    return { type: "N3_particle", note: "조사/어미 삽입" };
  }
  if (!hyp && PARTICLE_ONLY.has(ref)) {
    return { type: "N3_particle", note: "조사/어미 삭제" };
  }
  if (
    onlyParticlesLoose(ref) &&
    onlyParticlesLoose(hyp) &&
    Math.max(ref.length, hyp.length) <= 3
  ) {
    return { type: "N3_particle" };
  }
  // 어미 확장: 했→하겠, 하→해드리, 돼→됐고
  if (
    (ref === "했" && hyp.startsWith("하겠")) ||
    (ref === "하" && hyp.startsWith("해드리")) ||
    (ref === "돼" && (hyp.includes("됐") || hyp.includes("되어")))
  ) {
    return { type: "N3_particle", note: "어미 확장/변이" };
  }

  // 6) 대폭이면 판정 불가
  if (dist >= 6 && Math.max(ref.length, hyp.length) >= 6) {
    const ratio = dist / Math.max(ref.length, hyp.length, 1);
    if (ratio >= 0.7) {
      return { type: "U_unjudgable", note: "국소 정렬 붕괴" };
    }
  }

  // 7) 외래어 잔여
  if (/[a-z]/.test(ref + hyp) && !(ref === "유엔" || hyp === "un")) {
    return { type: "T4_loanword" };
  }

  return { type: "T6_general" };
}

function onlyParticlesLoose(s: string): boolean {
  if (!s) return true;
  return /^[은는이가을를의에와과도만로요다까서고게니나]+$/.test(s);
}

function extract(alias: string) {
  const hypAll = normalize(
    readFileSync(join(DIR, `${alias}.hypothesis.txt`), "utf8"),
  );
  const paras = refParagraphs(alias);
  let cursor = 0;
  let totalDist = 0;
  let totalRef = 0;
  let matched = 0;
  const tagged: Tagged[] = [];

  paras.forEach((para, paraIndex) => {
    const best = alignPara(para, hypAll, cursor);
    if (!best) return;
    matched += 1;
    totalDist += best.dist;
    totalRef += para.length;
    const slice = hypAll.slice(best.start, best.end);
    for (const s of mergeSpans(mismatchSpans(para, slice), 2)) {
      const refCtx = ctx(para, s.refStart, s.refEnd);
      const hypCtx = ctx(slice, s.hypStart, s.hypEnd);
      const c = classifySpan(s.ref, s.hyp, s.dist, refCtx, hypCtx);
      tagged.push({
        fixture: alias,
        paraIndex,
        type: c.type,
        modelFault: !NON_MODEL.has(c.type),
        dist: s.dist,
        ref: s.ref,
        hyp: s.hyp,
        refCtx,
        hypCtx,
        note: c.note,
        ambiguous: c.ambiguous,
        dualTypeCases: c.dualTypeCases,
      });
    }
    cursor = best.end;
  });

  return {
    meta: {
      alias,
      refChars: totalRef,
      totalDist,
      cer: totalDist / Math.max(1, totalRef),
      matched,
      total: paras.length,
    },
    tagged,
  };
}

function main() {
  const results = ALIASES.map(extract);
  const all = results.flatMap((r) => r.tagged);
  const byType: Record<string, { count: number; chars: number }> = {};
  for (const t of all) {
    const b = (byType[t.type] ??= { count: 0, chars: 0 });
    b.count += 1;
    b.chars += t.dist;
  }
  const totalChars = all.reduce((s, t) => s + t.dist, 0);
  console.log("type\tcount\tchars\tpct");
  for (const [k, v] of Object.entries(byType).sort(
    (a, b) => b[1].chars - a[1].chars,
  )) {
    console.log(
      `${k}\t${v.count}\t${v.chars}\t${((v.chars / totalChars) * 100).toFixed(1)}%`,
    );
  }
  console.log("total", totalChars, "items", all.length);
  console.log(
    "dualType",
    all.filter((t) => t.dualTypeCases).length,
    "ambiguous",
    all.filter((t) => t.ambiguous).length,
  );

  for (const r of results) {
    const m = r.meta as {
      alias: string;
      totalDist: number;
      refChars: number;
      cer: number;
    };
    const by: Record<string, number> = {};
    for (const t of r.tagged) by[t.type] = (by[t.type] ?? 0) + t.dist;
    console.log(
      `${m.alias} CER=${(m.cer * 100).toFixed(1)}%`,
      JSON.stringify(by),
    );
  }

  // T1/T4/T6 샘플
  for (const typ of ["T1_domain", "T4_loanword", "T6_general", "N1_filler", "U_unjudgable"]) {
    const xs = all.filter((t) => t.type === typ).sort((a, b) => b.dist - a.dist);
    console.log(`\n## ${typ} (${xs.length})`);
    for (const t of xs.slice(0, 15)) {
      console.log(
        `  ${t.fixture} d=${t.dist} ${t.ref}→${t.hyp} | ${t.note ?? ""} | ${t.refCtx.slice(0, 24)}`,
      );
    }
  }

  mkdirSync("Faith-office/stt-term-runs", { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        fixtures: results.map((r) => r.meta),
        byType,
        totalChars,
        tagged: all,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nwrote ${OUT}`);
}

main();
