/**
 * E2: brief-envwork에 용어 전부 넣었을 때 나빠진 자리를 전수 판정한다.
 *
 * eval-term-correction.ts 보정기를 그대로 복제해 쓴다. 로직은 바꾸지 않는다.
 * OpenAI 호출 없음. hypothesis 캐시만 사용.
 *
 * npx tsx --tsconfig tsconfig.json scripts/diagnose-term-worsening.ts brief-envwork
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { pronunciationSimilarity, toJamo } from "../src/lib/stt/pronunciation";
import { alignedCer, normalize } from "./lib/cer";
import { judgeChange, type Verdict } from "./lib/change-verdict";

const DIR = ".data/stt-bench/fixtures";
const OUT_DIR = "Faith-office/stt-term-runs";
const ROLE_TAG = /^\[[^\]]{1,6}\]\s*/;
const INAUDIBLE = /\*{2,}/;

const MIN_SIMILARITY = 0.78;
const EXACT = 1;
const MIN_JAMO = 7;
const MAX_WORDS = 3;

const PARTICLES = [
  "으로써", "에서는", "에게서", "으로는", "이라는", "라는",
  "에서", "에게", "으로", "부터", "까지", "보다", "처럼", "마다",
  "이나", "이란", "라고", "고요",
  "은", "는", "이", "가", "을", "를", "에", "의", "와", "과", "도", "만", "로",
];

const STOP = new Set([
  "그리고", "그래서", "하지만", "그러나", "때문에", "위해", "대해", "관련",
  "있습니다", "합니다", "했습니다", "됩니다", "드립니다", "말씀", "생각",
  "경우", "내용", "부분", "정도", "우리", "저희", "여러분", "지금", "오늘",
  "이번", "다음", "먼저", "또한", "특히", "모두", "많이", "조금",
]);

function stripParticle(word: string): string {
  for (const p of PARTICLES) {
    if (word.length > p.length + 1 && word.endsWith(p)) {
      return word.slice(0, -p.length);
    }
  }
  return word;
}

function clean(word: string): string {
  return word.replace(/[^0-9A-Za-z가-힣]/g, "");
}

function buildTerms(reference: string): string[] {
  const terms = new Set<string>();
  for (const rawWord of reference.split(/\s+/)) {
    const word = clean(rawWord);
    if (!word) continue;
    for (const form of [word, stripParticle(word)]) {
      if (form.length < 2 || form.length > 10) continue;
      if (STOP.has(form)) continue;
      if (!/[가-힣]/.test(form)) continue;
      terms.add(form);
    }
  }
  return [...terms];
}

type Term = { text: string; jamo: string };

function bestMatch(phrase: string, terms: Term[]): { term: string; score: number } | null {
  const jamo = toJamo(phrase);
  if (jamo.length < MIN_JAMO) return null;

  let best: { term: string; score: number } | null = null;
  for (const t of terms) {
    if (Math.abs(t.jamo.length - jamo.length) > 3) continue;
    if (t.text === phrase) return null;
    const score = pronunciationSimilarity(phrase, t.text);
    if (score >= MIN_SIMILARITY && (!best || score > best.score)) {
      best = { term: t.text, score };
    }
  }
  return best && best.score < EXACT ? best : null;
}

type Change = {
  from: string;
  to: string;
  score: number;
  start: number;
  end: number;
  originalSpan: string;
};

/** eval-term-correction.ts의 correct와 동일. 자리만 추가로 남긴다. */
function correct(hypothesis: string, termList: string[]) {
  const terms: Term[] = termList.map((t) => ({ text: t, jamo: toJamo(t) }));
  const exact = new Set(termList);
  const tokens = [...hypothesis.matchAll(/\S+/g)];
  const changes: Change[] = [];

  const edits: Array<{ start: number; end: number; text: string }> = [];
  let i = 0;
  while (i < tokens.length) {
    let applied = false;
    for (let n = Math.min(MAX_WORDS, tokens.length - i); n >= 1; n--) {
      const span = tokens.slice(i, i + n);
      if (span.slice(0, -1).some((t) => /[.!?]$/.test(t[0]))) continue;

      const phrase = clean(span.map((t) => t[0]).join(""));
      if (phrase.length < 2) continue;
      if (exact.has(phrase) || exact.has(stripParticle(phrase))) break;

      const hit = bestMatch(phrase, terms);
      if (!hit) continue;
      if (phrase.includes(hit.term) || hit.term.includes(phrase)) continue;

      const start = span[0]!.index;
      const last = span[n - 1]!;
      const end = last.index + last[0].length;
      edits.push({ start, end, text: hit.term });
      changes.push({
        from: phrase,
        to: hit.term,
        score: hit.score,
        start,
        end,
        originalSpan: hypothesis.slice(start, end),
      });
      i += n;
      applied = true;
      break;
    }
    if (!applied) i += 1;
  }

  let text = hypothesis;
  for (const e of [...edits].reverse()) {
    text = text.slice(0, e.start) + e.text + text.slice(e.end);
  }
  return { text, changes };
}

function refParagraphs(reference: string): string[] {
  return reference
    .split("\n")
    .map((line) => line.replace(ROLE_TAG, ""))
    .filter((line) => !INAUDIBLE.test(line))
    .map(normalize)
    .filter((p) => p.length >= 25);
}

/** 5층용. 없으면 null. Person CSV는 넣지 않는다. */
function loadLexicon(): Set<string> | null {
  const root = ".data/stt-bench/lexicon";
  if (!existsSync(root)) return null;
  const set = new Set<string>();
  for (const name of readdirSync(root)) {
    if (/person/i.test(name)) continue;
    const path = join(root, name);
    if (name.endsWith(".txt")) {
      for (const line of readFileSync(path, "utf8").split("\n")) {
        const w = line.trim();
        if (w && !w.startsWith("#")) set.add(w);
      }
      continue;
    }
    if (!name.endsWith(".csv")) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const surface = line.split(",")[0]?.trim();
      if (surface) set.add(surface);
    }
  }
  const verbExtra = join(root, "..", "lexicon-verb.txt");
  if (existsSync(verbExtra)) {
    for (const line of readFileSync(verbExtra, "utf8").split("\n")) {
      const w = line.trim();
      if (w) set.add(w);
    }
  }
  return set.size > 0 ? set : null;
}

type GateLayer =
  | "1-4_hole"
  | "5_offline_lexicon"
  | "6_opendict"
  | "7_model"
  | "unstoppable"
  | "5_unconfirmed";

type WorsenedRow = {
  from: string;
  to: string;
  score: number;
  originalSpan: string;
  tokenCount: number;
  category: string;
  gate: GateLayer;
  gateNote: string;
  beforeWindow?: string;
  afterWindow?: string;
  refSpan?: string;
};

function classifyWorsened(
  from: string,
  to: string,
  originalSpan: string,
  lexicon: Set<string> | null,
): { category: string; gate: GateLayer; gateNote: string; tokenCount: number } {
  const fromClean = clean(from);
  const toClean = clean(to);
  const tokens = originalSpan.trim().split(/\s+/).filter(Boolean);
  const tokenCount = tokens.length;
  const askForms = [fromClean, ...tokens.map((t) => clean(t))].filter(Boolean);

  if (
    (fromClean.includes(toClean) || toClean.includes(fromClean)) &&
    fromClean !== toClean
  ) {
    return {
      category: "포함관계_미차단",
      gate: "1-4_hole",
      gateNote: "2층 포함 검사가 있어야 막히는데 통과함",
      tokenCount,
    };
  }
  if (toJamo(fromClean).length < MIN_JAMO) {
    return {
      category: "짧은자모_미차단",
      gate: "1-4_hole",
      gateNote: "3층 MIN_JAMO 미만인데 통과함",
      tokenCount,
    };
  }

  // MAX_WORDS로 붙인 구간: 관문이 묶음 전체만 물으면 비실재라 교체를 허용한다.
  if (tokenCount >= 2) {
    return {
      category: "다행절묶음_오매칭",
      gate: "unstoppable",
      gateNote:
        "붙인 구간은 사전에 없어 5~7층이 교체를 허용한다. 토큰별 실재 보호(G3) 없이 못 막음",
      tokenCount,
    };
  }

  if (fromClean === "있습니다" && toClean === "있습니까") {
    return {
      category: "평서의문_어미혼동",
      gate: "6_opendict",
      gateNote:
        "있습니다는 활용형이라 명사 목록(5)에 없고, 우리말샘/모델(6~7)이 필요. STOP은 용어집만 걸러 가설은 안 막음",
      tokenCount,
    };
  }

  if (
    fromClean.startsWith(toClean) ||
    toClean.startsWith(fromClean) ||
    stripParticle(fromClean) === toClean ||
    stripParticle(toClean) === fromClean
  ) {
    return {
      category: "조사_활용_근접치환",
      gate: "7_model",
      gateNote: "조사, 활용만 다른 근접형. 모델 실재어 판정 필요",
      tokenCount,
    };
  }

  if (lexicon) {
    const hit = askForms.some((f) => lexicon.has(f) || lexicon.has(stripParticle(f)));
    if (hit) {
      return {
        category: "실재어_단일어절_오치환",
        gate: "5_offline_lexicon",
        gateNote: "전사 형태가 오프라인 목록에 있음. 5층이면 보호",
        tokenCount,
      };
    }
    return {
      category: "실재어_단일어절_목록미수록",
      gate: "6_opendict",
      gateNote: "오프라인 목록에 없음. 우리말샘(6) 또는 모델(7) 후보",
      tokenCount,
    };
  }

  return {
    category: "실재어_단일어절_미확인",
    gate: "5_unconfirmed",
    gateNote: "단일어절. 목록 미확인으로 5~7층 후보",
    tokenCount,
  };
}

function diagnose(alias: string) {
  const reference = readFileSync(join(DIR, `${alias}.reference.txt`), "utf8");
  const hypothesis = readFileSync(join(DIR, `${alias}.hypothesis.txt`), "utf8");
  const paras = refParagraphs(reference);
  const all = buildTerms(reference);
  const corrected = correct(hypothesis, all);

  const cerBefore = alignedCer(paras, normalize(hypothesis)).cer;
  const cerAfter = alignedCer(paras, normalize(corrected.text)).cer;

  const lexicon = loadLexicon();

  const counts: Record<Verdict, number> = {
    improved: 0,
    worsened: 0,
    tied: 0,
    unmatched: 0,
  };

  const changeSamples: Array<{
    from: string;
    to: string;
    score: number;
    verdict: Verdict;
  }> = [];

  const worsened: WorsenedRow[] = [];

  // 보정은 앞에서부터 적용되지만 edits는 원문 좌표. 판정은 원문 hypothesis 기준.
  for (const c of corrected.changes) {
    const judged = judgeChange({
      hypothesis,
      start: c.start,
      end: c.end,
      replacement: c.to,
      reference,
    });
    counts[judged.verdict] += 1;
    changeSamples.push({
      from: c.from,
      to: c.to,
      score: c.score,
      verdict: judged.verdict,
    });
    if (judged.verdict === "worsened") {
      const cls = classifyWorsened(c.from, c.to, c.originalSpan, lexicon);
      worsened.push({
        from: c.from,
        to: c.to,
        score: c.score,
        originalSpan: c.originalSpan,
        tokenCount: cls.tokenCount,
        category: cls.category,
        gate: cls.gate,
        gateNote: cls.gateNote,
        beforeWindow: judged.beforeWindow.slice(0, 80),
        afterWindow: judged.afterWindow.slice(0, 80),
        refSpan: judged.refSpan.slice(0, 80),
      });
    }
  }

  const matched = counts.improved + counts.worsened + counts.tied;
  const precision = counts.improved / Math.max(1, matched);

  // 유형별 묶음
  const byCategory: Record<
    string,
    { gate: GateLayer; count: number; examples: Array<{ from: string; to: string }> }
  > = {};
  for (const w of worsened) {
    const bucket = byCategory[w.category] ?? {
      gate: w.gate,
      count: 0,
      examples: [],
    };
    bucket.count += 1;
    if (bucket.examples.length < 8) {
      bucket.examples.push({ from: w.from, to: w.to });
    }
    byCategory[w.category] = bucket;
  }

  const result = {
    taskId: "E2",
    date: "2026-07-27",
    fixture: alias,
    hypothesisCached: true,
    termCount: all.length,
    cerBefore,
    cerAfter,
    changes: corrected.changes.length,
    improved: counts.improved,
    worsened: counts.worsened,
    tied: counts.tied,
    unmatched: counts.unmatched,
    precision,
    lexiconLoaded: lexicon ? lexicon.size : 0,
    notes: `${alias} 용어 전부 투입. worsened 전수 분류.`,
    categories: byCategory,
    worsenedAll: worsened,
    changeSamples: changeSamples.slice(0, 40),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `2026-07-27_E2_${alias}.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  console.log(`\n=== ${alias} ===`);
  console.log(`terms=${all.length} changes=${result.changes}`);
  console.log(
    `CER ${(cerBefore * 100).toFixed(1)}% → ${(cerAfter * 100).toFixed(1)}%`,
  );
  console.log(
    `improved=${counts.improved} worsened=${counts.worsened} tied=${counts.tied} unmatched=${counts.unmatched}`,
  );
  console.log(`precision=${(precision * 100).toFixed(1)}%`);
  console.log(`lexicon=${lexicon ? lexicon.size : "없음"}`);
  console.log(`wrote ${outPath}`);
  console.log("\n--- worsened categories ---");
  for (const [cat, info] of Object.entries(byCategory)) {
    console.log(
      `${cat} gate=${info.gate} n=${info.count} eg=${info.examples
        .slice(0, 2)
        .map((e) => `${e.from}→${e.to}`)
        .join(", ")}`,
    );
  }
  console.log("\n--- worsened full ---");
  for (const w of worsened) {
    console.log(
      `${w.from} → ${w.to}  [${w.category}/${w.gate}]  score=${w.score.toFixed(3)}`,
    );
  }

  return result;
}

const aliases = process.argv.slice(2).filter((a) => !a.startsWith("--"));
for (const alias of aliases.length ? aliases : ["brief-envwork"]) {
  diagnose(alias);
}
