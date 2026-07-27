/**
 * E4: 처음 보는 브리핑 2건으로 guarded를 재검증하고, 사전 관문을 좁게 붙인다.
 *
 * 1) 홀드아웃(mohw, moe)에서 E3 guarded를 손대지 않고 성적
 * 2) 우리말샘 존재 여부 관문 후 6개 전체 재측정
 * 3) 문턱표·실시간 적합성
 *
 * OpenAI 호출 없음(hypothesis 캐시). 사전 API만 선택적으로 사용.
 * npx --yes tsx --tsconfig tsconfig.json scripts/eval-term-correction-v2.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { pronunciationSimilarity, toJamo } from "../src/lib/stt/pronunciation";
import { alignedCer, normalize } from "./lib/cer";
import { judgeChange, type Verdict } from "./lib/change-verdict";
import {
  isJoinBlocker,
  isProtectedForm,
} from "./lib/protected-forms";
import {
  clearDictCache,
  getDictStats,
  resetDictStats,
  sourceInDictionary,
} from "./lib/dict-exists";

const DIR = ".data/stt-bench/fixtures";
const OUT_DIR = "Faith-office/stt-term-runs";
const ROLE_TAG = /^\[[^\]]{1,6}\]\s*/;
const INAUDIBLE = /\*{2,}/;

const OLD_FIXTURES = [
  "brief-envwork",
  "brief-rda",
  "brief-mnd",
  "brief-mofa",
] as const;

const NEW_FIXTURES = ["brief-mohw", "brief-moe"] as const;

const ALL_FIXTURES = [...OLD_FIXTURES, ...NEW_FIXTURES] as const;

const MIN_SIMILARITY = 0.78;
const EXACT = 1;
const MIN_JAMO = 7;

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

function bestMatch(
  phrase: string,
  terms: Term[],
): { term: string; score: number } | null {
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
  tokenCount: number;
};

type JoinMode = "v1" | "single" | "guarded";

/** 다행절 접합은 점수를 더 높게 요구한다. 낮은 점수의 가짜 덩어리를 끊는다. */
const MIN_JOIN_SIMILARITY = 0.88;

function looksLikeInflected(term: string): boolean {
  if (isProtectedForm(term)) return true;
  return /(습니다|습니까|입니다|입니까|했습니다|하겠습니다|하셨는데|하시는데|하여서|하면서|했다는|하도록|되기|되어|되는|드리고|드린|하는|한데|하면|했고|였다|았다|하신|셔서)$/.test(
    term,
  );
}

function isPrefixParticleJoin(tokens: string[], hitTerm: string): boolean {
  if (tokens.length < 2) return false;
  const head = stripParticle(clean(tokens[0]!));
  if (head.length < 4) return false;
  if (!hitTerm.startsWith(head)) return false;
  const rest = hitTerm.slice(head.length);
  return rest.length > 0 && rest.length <= 2;
}

function allowJoin(
  mode: JoinMode,
  spanTokens: string[],
  hitTerm: string,
  score: number,
): boolean {
  if (mode === "v1") return true;
  if (mode === "single") return spanTokens.length === 1;
  if (spanTokens.length === 1) return true;
  const cleaned = spanTokens.map((t) => clean(t)).filter(Boolean);
  if (cleaned.length < 2 || cleaned.length > 3) return false;
  if (cleaned.some((t) => isJoinBlocker(t))) return false;
  if (looksLikeInflected(hitTerm)) return false;
  if (isPrefixParticleJoin(spanTokens, hitTerm)) return false;
  if (cleaned.some((t) => t.startsWith("말씀")) && hitTerm.startsWith("말씀")) {
    return false;
  }
  if (score < MIN_JOIN_SIMILARITY) return false;
  return true;
}

type CorrectOpts = {
  mode: JoinMode;
  /** 원본이 사전에 있으면 덮어쓰지 않는다. */
  dictGate: boolean;
};

async function correct(
  hypothesis: string,
  termList: string[],
  opts: CorrectOpts,
): Promise<{ text: string; changes: Change[]; dictBlocked: number }> {
  const terms: Term[] = termList.map((t) => ({ text: t, jamo: toJamo(t) }));
  const exact = new Set(termList);
  const tokens = [...hypothesis.matchAll(/\S+/g)];
  const changes: Change[] = [];
  const edits: Array<{ start: number; end: number; text: string }> = [];
  const maxWords = opts.mode === "single" ? 1 : 3;
  let dictBlocked = 0;

  let i = 0;
  while (i < tokens.length) {
    let applied = false;
    for (let n = Math.min(maxWords, tokens.length - i); n >= 1; n--) {
      const span = tokens.slice(i, i + n);
      if (span.slice(0, -1).some((t) => /[.!?]$/.test(t[0]))) continue;

      const rawParts = span.map((t) => t[0]!);
      const phrase = clean(rawParts.join(""));
      if (phrase.length < 2) continue;

      // 원본 실재성 보호 (v2 전용). v1 재현 시에는 끈다.
      if (opts.mode !== "v1") {
        if (isProtectedForm(phrase)) continue;
        if (n === 1 && isProtectedForm(clean(rawParts[0]!))) continue;
      }

      if (exact.has(phrase) || exact.has(stripParticle(phrase))) break;

      const hit = bestMatch(phrase, terms);
      if (!hit) continue;
      if (phrase.includes(hit.term) || hit.term.includes(phrase)) continue;
      if (!allowJoin(opts.mode, rawParts, hit.term, hit.score)) continue;

      // 사전 관문: 지우려는 원본이 사전에 있으면 막는다.
      if (opts.dictGate && opts.mode !== "v1") {
        const inDict = await sourceInDictionary(phrase);
        if (inDict === true) {
          dictBlocked += 1;
          continue;
        }
      }

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
        tokenCount: n,
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
  return { text, changes, dictBlocked };
}

function refParagraphs(reference: string): string[] {
  return reference
    .split("\n")
    .map((line) => line.replace(ROLE_TAG, ""))
    .filter((line) => !INAUDIBLE.test(line))
    .map(normalize)
    .filter((p) => p.length >= 25);
}

type Counts = Record<Verdict, number>;

type JudgedChange = Change & {
  verdict: Verdict;
  beforeDist: number;
  afterDist: number;
  alignRatio: number;
  jamoLen: number;
};

function judgeAll(
  hypothesis: string,
  reference: string,
  changes: Change[],
): { counts: Counts; judged: JudgedChange[] } {
  const counts: Counts = { improved: 0, worsened: 0, tied: 0, unmatched: 0 };
  const judged: JudgedChange[] = [];
  for (const c of changes) {
    const j = judgeChange({
      hypothesis,
      start: c.start,
      end: c.end,
      replacement: c.to,
      reference,
    });
    counts[j.verdict] += 1;
    judged.push({
      ...c,
      verdict: j.verdict,
      beforeDist: j.beforeDist,
      afterDist: j.afterDist,
      alignRatio: j.alignRatio,
      jamoLen: toJamo(c.from).length,
    });
  }
  return { counts, judged };
}

function precisionOf(counts: Counts): number {
  const matched = counts.improved + counts.worsened + counts.tied;
  return counts.improved / Math.max(1, matched);
}

type RunSummary = {
  mode: JoinMode;
  dictGate: boolean;
  termCount: number;
  changes: number;
  improved: number;
  worsened: number;
  tied: number;
  unmatched: number;
  precision: number;
  cerBefore: number;
  cerAfter: number;
  multiTokenChanges: number;
  multiTokenImproved: number;
  multiTokenWorsened: number;
  dictBlocked: number;
};

async function runFixture(
  alias: string,
  mode: JoinMode,
  dictGate: boolean,
): Promise<{
  summary: RunSummary;
  judged: JudgedChange[];
  hypothesis: string;
  reference: string;
  cerBefore: number;
}> {
  const reference = readFileSync(join(DIR, `${alias}.reference.txt`), "utf8");
  const hypPath = join(DIR, `${alias}.hypothesis.txt`);
  if (!existsSync(hypPath)) {
    throw new Error(`missing hypothesis cache: ${alias}`);
  }
  const hypothesis = readFileSync(hypPath, "utf8");
  const paras = refParagraphs(reference);
  const terms = buildTerms(reference);
  const corrected = await correct(hypothesis, terms, { mode, dictGate });
  const cerBefore = alignedCer(paras, normalize(hypothesis)).cer;
  const cerAfter = alignedCer(paras, normalize(corrected.text)).cer;
  const { counts, judged } = judgeAll(hypothesis, reference, corrected.changes);

  const multi = judged.filter((c) => c.tokenCount >= 2);
  return {
    hypothesis,
    reference,
    cerBefore,
    judged,
    summary: {
      mode,
      dictGate,
      termCount: terms.length,
      changes: corrected.changes.length,
      improved: counts.improved,
      worsened: counts.worsened,
      tied: counts.tied,
      unmatched: counts.unmatched,
      precision: precisionOf(counts),
      cerBefore,
      cerAfter,
      multiTokenChanges: multi.length,
      multiTokenImproved: multi.filter((c) => c.verdict === "improved").length,
      multiTokenWorsened: multi.filter((c) => c.verdict === "worsened").length,
      dictBlocked: corrected.dictBlocked,
    },
  };
}

function confidenceTable(judged: JudgedChange[]) {
  const thresholds = [0.78, 0.82, 0.85, 0.88, 0.9, 0.92, 0.95];
  const jamoMins = [7, 9, 11];
  const rows: Array<{
    minScore: number;
    minJamo: number;
    kept: number;
    improved: number;
    worsened: number;
    tied: number;
    unmatched: number;
    precision: number;
  }> = [];

  for (const minScore of thresholds) {
    for (const minJamo of jamoMins) {
      const kept = judged.filter(
        (c) => c.score >= minScore && c.jamoLen >= minJamo,
      );
      const counts: Counts = {
        improved: 0,
        worsened: 0,
        tied: 0,
        unmatched: 0,
      };
      for (const c of kept) counts[c.verdict] += 1;
      const matched = counts.improved + counts.worsened + counts.tied;
      rows.push({
        minScore,
        minJamo,
        kept: kept.length,
        improved: counts.improved,
        worsened: counts.worsened,
        tied: counts.tied,
        unmatched: counts.unmatched,
        precision: matched ? counts.improved / matched : 0,
      });
    }
  }
  return rows;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function rowLine(alias: string, s: RunSummary): string {
  return (
    `${alias.replace("brief-", "").padEnd(10)}| ` +
    `${String(s.changes).padStart(3)} | ` +
    `${String(s.improved).padStart(3)} | ` +
    `${String(s.worsened).padStart(3)} | ` +
    `${String(s.tied).padStart(3)} | ` +
    `${String(s.unmatched).padStart(3)} | ` +
    `${pct(s.precision).padStart(6)} | ` +
    `${pct(s.cerBefore)} → ${pct(s.cerAfter)}`
  );
}

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true });

  // --- Phase A: E3 guarded 그대로, 홀드아웃 포함 6개 ---
  console.log("\n=== E4 Phase A: guarded (no dict), holdout ===\n");
  console.log(
    "fixture   | chg | imp | wor | tie | unm |  prec | CER before → after",
  );

  const holdout: Record<string, Awaited<ReturnType<typeof runFixture>>> = {};
  for (const alias of ALL_FIXTURES) {
    holdout[alias] = await runFixture(alias, "guarded", false);
    console.log(rowLine(alias, holdout[alias]!.summary));
  }

  const holdoutJudged: JudgedChange[] = [];
  for (const alias of ALL_FIXTURES) {
    holdoutJudged.push(...holdout[alias]!.judged);
  }

  const holdoutNewPrec =
    NEW_FIXTURES.reduce((a, f) => a + holdout[f]!.summary.precision, 0) /
    NEW_FIXTURES.length;
  const holdoutOldPrec =
    OLD_FIXTURES.reduce((a, f) => a + holdout[f]!.summary.precision, 0) /
    OLD_FIXTURES.length;

  // 홀드아웃에서 남은 악화 → 규칙 지목용
  const newWorsened = NEW_FIXTURES.flatMap((f) =>
    holdout[f]!.judged
      .filter((c) => c.verdict === "worsened")
      .map((c) => ({ fixture: f, from: c.from, to: c.to, score: c.score, tokenCount: c.tokenCount })),
  );

  const phaseA = {
    taskId: "E4",
    phase: "A_holdout_guarded",
    date: "2026-07-27",
    note: "E3 guarded를 손대지 않고 새 픽스처에 건 결과. 규칙 재조정 없음.",
    newFixtures: {
      "brief-mohw": {
        ministry: "보건복지부",
        topic: "보건복지부 업무계획",
        durationSec: 900,
        referenceNature: "축어 전사(발표+질의응답)",
      },
      "brief-moe": {
        ministry: "교육부",
        topic: "2025 교육부 주요 정책 추진 계획",
        durationSec: 900,
        referenceNature: "축어 전사(발표+질의응답)",
      },
    },
    averages: {
      precisionOld4: holdoutOldPrec,
      precisionNew2: holdoutNewPrec,
      precisionAll6:
        ALL_FIXTURES.reduce((a, f) => a + holdout[f]!.summary.precision, 0) /
        ALL_FIXTURES.length,
    },
    fixtures: Object.fromEntries(
      ALL_FIXTURES.map((f) => [
        f,
        {
          summary: holdout[f]!.summary,
          worsened: holdout[f]!.judged
            .filter((c) => c.verdict === "worsened")
            .map((c) => ({
              from: c.from,
              to: c.to,
              score: c.score,
              tokenCount: c.tokenCount,
            })),
          changeSamples: holdout[f]!.judged.map((c) => ({
            from: c.from,
            to: c.to,
            score: c.score,
            tokenCount: c.tokenCount,
            verdict: c.verdict,
          })),
        },
      ]),
    ),
    newWorsened,
    confidenceAll6: confidenceTable(holdoutJudged),
    confidenceNew2: confidenceTable(
      NEW_FIXTURES.flatMap((f) => holdout[f]!.judged),
    ),
    successHoldout: {
      precisionNew2AtLeast80: holdoutNewPrec >= 0.8,
      cerNotWorseNew2: NEW_FIXTURES.every((f) => {
        const s = holdout[f]!.summary;
        return s.cerAfter <= s.cerBefore + 1e-12;
      }),
    },
  };

  writeFileSync(
    join(OUT_DIR, "2026-07-27_E4_holdout.json"),
    JSON.stringify(phaseA, null, 2),
    "utf8",
  );
  console.log(`wrote ${OUT_DIR}/2026-07-27_E4_holdout.json`);

  // --- Phase B: 사전 관문 ---
  console.log("\n=== E4 Phase B: guarded + dict gate ===\n");
  clearDictCache();
  resetDictStats();

  const withDict: Record<string, Awaited<ReturnType<typeof runFixture>>> = {};
  for (const alias of ALL_FIXTURES) {
    withDict[alias] = await runFixture(alias, "guarded", true);
    console.log(
      rowLine(alias, withDict[alias]!.summary) +
        `  blocked=${withDict[alias]!.summary.dictBlocked}`,
    );
  }

  const dictStats = getDictStats();
  const lat = [...dictStats.latenciesMs].sort((a, b) => a - b);
  const latencySummary = {
    count: lat.length,
    minMs: lat[0] ?? null,
    maxMs: lat[lat.length - 1] ?? null,
    meanMs: lat.length
      ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length)
      : null,
    p50Ms: lat.length ? lat[Math.floor(lat.length * 0.5)]! : null,
    p95Ms: lat.length ? lat[Math.floor(lat.length * 0.95)]! : null,
  };

  // 막힌 악화 / 놓친 개선: 홀드아웃 대비
  const blockedWorsened: Array<{ fixture: string; from: string; to: string }> =
    [];
  const missedImproved: Array<{ fixture: string; from: string; to: string }> =
    [];

  for (const f of ALL_FIXTURES) {
    const before = holdout[f]!.judged;
    const afterKeys = new Set(
      withDict[f]!.judged.map((c) => `${c.start}|${c.end}|${c.from}|${c.to}`),
    );
    for (const c of before) {
      const key = `${c.start}|${c.end}|${c.from}|${c.to}`;
      if (afterKeys.has(key)) continue;
      if (c.verdict === "worsened") {
        blockedWorsened.push({ fixture: f, from: c.from, to: c.to });
      } else if (c.verdict === "improved") {
        missedImproved.push({ fixture: f, from: c.from, to: c.to });
      }
    }
  }

  const dictJudged: JudgedChange[] = [];
  for (const alias of ALL_FIXTURES) {
    dictJudged.push(...withDict[alias]!.judged);
  }

  const e3WorsenedTargets = [
    { from: "규정에", to: "과정에" },
    { from: "되었기", to: "되었고" },
    { from: "자제를", to: "자세를" },
  ];
  const e3Blocked = e3WorsenedTargets.map((t) => {
    const still = ALL_FIXTURES.some((f) =>
      withDict[f]!.judged.some(
        (c) =>
          c.verdict === "worsened" &&
          clean(c.from) === t.from &&
          clean(c.to) === t.to,
      ),
    );
    const wasPresent = ALL_FIXTURES.some((f) =>
      holdout[f]!.judged.some(
        (c) => clean(c.from) === t.from && clean(c.to) === t.to,
      ),
    );
    return { ...t, wasPresent, stillPresentAfterDict: still };
  });

  // 문턱 제안: jamo≥7, 표본·정밀도 균형
  const confRows = confidenceTable(dictJudged).filter((r) => r.minJamo === 7);
  const proposal = (() => {
    // 우선 0.90, 표본이 너무 작으면 0.88 검토. 단정 금지 문구는 보고에.
    const at90 = confRows.find((r) => r.minScore === 0.9)!;
    const at88 = confRows.find((r) => r.minScore === 0.88)!;
    const chosen =
      at90.kept >= 15 && at90.worsened === 0
        ? at90
        : at90.kept >= 10 && at90.precision >= 0.85 && at90.worsened <= 1
          ? at90
          : at88;
    const meetings = ALL_FIXTURES.length;
    const perMeeting = chosen.kept / meetings;
    return {
      minScore: chosen.minScore,
      minJamo: 7,
      kept: chosen.kept,
      improved: chosen.improved,
      worsened: chosen.worsened,
      precision: chosen.precision,
      sampleNote:
        chosen.kept < 20
          ? `표본 ${chosen.kept}건으로 작다. 100%여도 단정하지 말 것.`
          : `표본 ${chosen.kept}건.`,
      suggestionsPerMeetingApprox: Math.round(perMeeting * 10) / 10,
      rationale:
        chosen.minScore === 0.9
          ? "0.90에서 worsened가 적고 회의당 추천이 과하지 않다"
          : "0.90 표본이 너무 작거나 worsened가 남아 0.88을 본다",
    };
  })();

  const phaseB = {
    taskId: "E4",
    phase: "B_dict_gate",
    date: "2026-07-27",
    dictApi: {
      endpoint: "https://opendict.korean.go.kr/api/search",
      keyEnv: "KOREAN_DICT_API_KEY",
      stores: "boolean existence only",
      stats: dictStats,
      latencyMs: latencySummary,
      dailyLimit: 50000,
    },
    e3WorsenedBlocked: e3Blocked,
    blockedWorsened,
    missedImproved,
    tradeoff: {
      blockedWorsenedCount: blockedWorsened.length,
      missedImprovedCount: missedImproved.length,
    },
    fixtures: Object.fromEntries(
      ALL_FIXTURES.map((f) => [
        f,
        {
          before: holdout[f]!.summary,
          after: withDict[f]!.summary,
          worsenedAfter: withDict[f]!.judged
            .filter((c) => c.verdict === "worsened")
            .map((c) => ({ from: c.from, to: c.to, score: c.score })),
        },
      ]),
    ),
    averages: {
      precisionBefore:
        ALL_FIXTURES.reduce((a, f) => a + holdout[f]!.summary.precision, 0) /
        ALL_FIXTURES.length,
      precisionAfter:
        ALL_FIXTURES.reduce((a, f) => a + withDict[f]!.summary.precision, 0) /
        ALL_FIXTURES.length,
      cerBefore:
        ALL_FIXTURES.reduce((a, f) => a + withDict[f]!.summary.cerBefore, 0) /
        ALL_FIXTURES.length,
      cerAfter:
        ALL_FIXTURES.reduce((a, f) => a + withDict[f]!.summary.cerAfter, 0) /
        ALL_FIXTURES.length,
    },
    confidenceAll6: confRows,
    proposedThreshold: proposal,
    success: {
      cerNotWorseAll6: ALL_FIXTURES.every((f) => {
        const s = withDict[f]!.summary;
        return s.cerAfter <= s.cerBefore + 1e-12;
      }),
      e3ThreeBlocked: e3Blocked.every(
        (t) => !t.wasPresent || !t.stillPresentAfterDict,
      ),
    },
    realtime: {
      measuredLatencyMs: latencySummary,
      budgetMs: 3000,
      syncFit:
        (latencySummary.p95Ms ?? 9999) < 500
          ? "한두 건은 동기 조회 가능"
          : "후보가 여러 개면 3초 예산을 잠식할 수 있음",
      cacheOnlyFallback: true,
      deferredHintsPossible: true,
      deferredEvidence: [
        "src/lib/stt/realtime/process-realtime.ts: STT·구조화 뒤에 suggestTermCorrections → attachCorrections",
        "본문 text는 그대로 두고 corrections 필드만 붙임",
        "추천만 늦게 붙이는 UI(correction-hint)와 맞음",
      ],
    },
  };

  writeFileSync(
    join(OUT_DIR, "2026-07-27_E4_dict_gate.json"),
    JSON.stringify(phaseB, null, 2),
    "utf8",
  );
  console.log(`wrote ${OUT_DIR}/2026-07-27_E4_dict_gate.json`);

  const summary = {
    taskId: "E4",
    date: "2026-07-27",
    holdout: phaseA.averages,
    holdoutSuccess: phaseA.successHoldout,
    holdoutTable: Object.fromEntries(
      ALL_FIXTURES.map((f) => [f, holdout[f]!.summary]),
    ),
    newWorsened,
    overfitting: {
      holdoutPrecisionDrop: `${pct(holdoutOldPrec)} → ${pct(holdoutNewPrec)}`,
      rulesTunedToOld4: [
        {
          rule: "scripts/lib/protected-forms.ts 손목록/어미 보호",
          why: "E2가 옛 4건에서 본 있습니다·했습니다·기능어만 막음. 홀드아웃의 공공의료·개혁이·사례를·모델인 같은 일반 실재어는 못 막음",
        },
        {
          rule: "유사도 하한 0.78 (단일어절)",
          why: "발음이 가까운 실재어 쌍(공공의료↔공공의대, 개혁↔계획)을 통과시킴. 옛 4건에서는 이런 쌍이 적었음",
        },
        {
          rule: "guarded 접합 가드",
          why: "홀드아웃 악화 8건 중 다행절은 1건뿐. 접합 가드 자체보다 원본 실재어 관문이 약했던 것이 주원인",
        },
      ],
      note: "옛 4건 평균 90%는 envwork·rda·mnd 100%가 끌어올린 값. mofa는 이미 60%였고, 홀드아웃은 40%/71%로 떨어짐",
    },
    dictTradeoff: phaseB.tradeoff,
    e3WorsenedBlocked: e3Blocked,
    proposedThreshold: proposal,
    dictLatencyMs: latencySummary,
    dictApiCalls: dictStats.apiCalls,
    success: {
      ...phaseA.successHoldout,
      ...phaseB.success,
    },
    productReady: {
      autoApply: false,
      suggestOnly: true,
      recommendedMinScore: proposal.minScore,
      verdict:
        holdoutNewPrec < 0.8
          ? "홀드아웃 맞게바꾼비율이 80% 미만이라 E3 90%를 일반화할 수 없다. 추천-only + 유사도 0.90으로만 좁게 시험 공개. 자동 적용 금지."
          : "홀드아웃이 버팀. 추천-only로 켤 수 있다. 자동 적용은 금지.",
    },
    productReadyNote:
      holdoutNewPrec >= 0.8 && phaseB.success.cerNotWorseAll6
        ? "추천-only로 좁은 문턱에서 켤 수 있다. 자동 적용은 아직 금지."
        : "홀드아웃 성적이 약하다. 추천-only·고문턱 시험은 가능하나 E3 성적표로 홍보하면 안 된다.",
  };

  writeFileSync(
    join(OUT_DIR, "2026-07-27_E4_summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
  console.log(`wrote ${OUT_DIR}/2026-07-27_E4_summary.json`);

  console.log("\n=== confidence (all 6, dict gate, jamo≥7) ===");
  for (const row of confRows) {
    console.log(
      `score≥${row.minScore}: kept=${row.kept} imp=${row.improved} wor=${row.worsened} prec=${pct(row.precision)}`,
    );
  }
  console.log("\nproposed=", proposal);
  console.log("dict latency=", latencySummary);
  console.log("apiCalls=", dictStats.apiCalls, "cacheHits=", dictStats.cacheHits);
  console.log(
    "blockedWorsened=",
    blockedWorsened.length,
    "missedImproved=",
    missedImproved.length,
  );
  console.log("success=", summary.success);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
