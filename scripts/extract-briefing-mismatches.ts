/**
 * 캐시 전사와 정답을 alignedCer와 같은 방식으로 짝 지은 뒤,
 * 문단마다 편집 거리 경로로 어긋난 자리(연속 스팬)를 뽑는다.
 *
 * OpenAI 호출 없음. hypothesis 재생성 없음.
 *
 * npx tsx --tsconfig tsconfig.json scripts/extract-briefing-mismatches.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { normalize } from "./lib/cer";

const DIR = ".data/stt-bench/fixtures";
const OUT = "Faith-office/stt-term-runs/_e1_raw_mismatches.json";
const ROLE_TAG = /^\[[^\]]{1,6}\]\s*/;
const INAUDIBLE = /\*{2,}/;
const MISS_RATIO = 0.5;
const ALIASES = [
  "brief-envwork",
  "brief-rda",
  "brief-mnd",
  "brief-mofa",
] as const;

type Span = {
  fixture: string;
  paraIndex: number;
  ref: string;
  hyp: string;
  dist: number;
  refStart: number;
  refEnd: number;
  hypStart: number;
  hypEnd: number;
  ops: string;
};

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

/** Levenshtein 경로를 되짚어 연속 불일치 스팬을 만든다. */
function mismatchSpans(
  ref: string,
  hyp: string,
): Array<{
  ref: string;
  hyp: string;
  refStart: number;
  refEnd: number;
  hypStart: number;
  hypEnd: number;
  dist: number;
  ops: string;
}> {
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
    ops: string;
  }> = [];

  let cur: {
    ref: string;
    hyp: string;
    refStart: number;
    refEnd: number;
    hypStart: number;
    hypEnd: number;
    dist: number;
    ops: string[];
  } | null = null;

  const flush = () => {
    if (!cur) return;
    // 빈 스팬(이론상 없음) 제외
    if (cur.ref.length + cur.hyp.length > 0) {
      spans.push({
        ref: cur.ref,
        hyp: cur.hyp,
        refStart: cur.refStart,
        refEnd: cur.refEnd,
        hypStart: cur.hypStart,
        hypEnd: cur.hypEnd,
        dist: cur.dist,
        ops: cur.ops.join(""),
      });
    }
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
        refStart: a.kind === "ins" ? a.ri : a.ri,
        refEnd: a.kind === "ins" ? a.ri : a.ri + 1,
        hypStart: a.kind === "del" ? a.hj : a.hj,
        hypEnd: a.kind === "del" ? a.hj : a.hj + 1,
        dist: 0,
        ops: [],
      };
    }
    if (a.kind === "sub") {
      cur.ref += a.r ?? "";
      cur.hyp += a.h ?? "";
      cur.refEnd = a.ri + 1;
      cur.hypEnd = a.hj + 1;
      cur.dist += 1;
      cur.ops.push("S");
    } else if (a.kind === "del") {
      cur.ref += a.r ?? "";
      cur.refEnd = a.ri + 1;
      cur.dist += 1;
      cur.ops.push("D");
    } else {
      cur.hyp += a.h ?? "";
      cur.hypEnd = a.hj + 1;
      cur.dist += 1;
      cur.ops.push("I");
    }
  }
  flush();
  return spans;
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

function alignPara(
  para: string,
  hyp: string,
  cursor: number,
): { dist: number; start: number; end: number } | null {
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

function extract(alias: string): {
  alias: string;
  refChars: number;
  totalDist: number;
  cer: number;
  matched: number;
  total: number;
  spans: Span[];
} {
  const hyp = normalize(
    readFileSync(join(DIR, `${alias}.hypothesis.txt`), "utf8"),
  );
  const paras = refParagraphs(alias);
  let cursor = 0;
  let totalDist = 0;
  let totalRef = 0;
  let matched = 0;
  const spans: Span[] = [];

  paras.forEach((para, paraIndex) => {
    const best = alignPara(para, hyp, cursor);
    if (!best) return;
    matched += 1;
    totalDist += best.dist;
    totalRef += para.length;
    const slice = hyp.slice(best.start, best.end);
    for (const s of mismatchSpans(para, slice)) {
      spans.push({
        fixture: alias,
        paraIndex,
        ...s,
      });
    }
    cursor = best.end;
  });

  return {
    alias,
    refChars: totalRef,
    totalDist,
    cer: totalDist / Math.max(1, totalRef),
    matched,
    total: paras.length,
    spans,
  };
}

function main() {
  const results = ALIASES.map(extract);
  const payload = {
    generatedAt: new Date().toISOString(),
    note: "alignedCer와 동일 짝짓기 후 문단별 Levenshtein 스팬",
    fixtures: results.map((r) => ({
      alias: r.alias,
      refChars: r.refChars,
      totalDist: r.totalDist,
      cer: r.cer,
      matched: r.matched,
      total: r.total,
      spanCount: r.spans.length,
      spanDistSum: r.spans.reduce((s, x) => s + x.dist, 0),
    })),
    spans: results.flatMap((r) => r.spans),
  };
  mkdirSync("Faith-office/stt-term-runs", { recursive: true });
  writeFileSync(OUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(
    results
      .map(
        (r) =>
          `${r.alias}\tCER=${(r.cer * 100).toFixed(1)}%\tref=${r.refChars}\tdist=${r.totalDist}\tspans=${r.spans.length}`,
      )
      .join("\n"),
  );
  console.log(`wrote ${OUT} (${payload.spans.length} spans)`);
}

main();
