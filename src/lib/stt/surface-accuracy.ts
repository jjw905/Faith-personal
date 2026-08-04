import type { WordTiming } from "@/lib/stt/timed-segments";
import { pronunciationSimilarity } from "@/lib/stt/pronunciation";

type SurfaceToken = {
  text: string;
  normalized: string;
  startOffset: number;
  endOffset: number;
  partIndex: number;
};

export type ChunkBoundarySurfaceRepair = {
  boundarySec: number;
  removedPrevious: string;
  removedCurrent: string;
  evidenceWords: string[];
};

export type ConsensusSurfaceCorrection = {
  lineIndex: number;
  startOffset: number;
  endOffset: number;
  wrong: string;
  suggestion: string;
  similarity: number;
  primarySupport: number;
  timingSupport: number;
};

const SURFACE_STOP = new Set([
  "그리고",
  "그러나",
  "그래서",
  "마지막으로",
  "다음으로",
  "있습니다",
  "했습니다",
  "하겠습니다",
  "말씀드립니다",
]);

const FUNCTIONAL_ENDING =
  /(습니다|습니까|합니다|했습니다|됩니다|드립니다|한다|된다|했다|하다|되다|는데|지만|고요)$/u;
const ENTITY_SUFFIX =
  /(부|청|원|위|국|실|처|과|팀|센터|협회|공단|공사|은행|대학교|연구소)$/u;
const SURFACE_PARTICLES = [
  "에서는",
  "으로는",
  "이라는",
  "에서",
  "으로",
  "에게",
  "부터",
  "까지",
  "보다",
  "처럼",
  "라고",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "의",
  "와",
  "과",
  "도",
  "만",
  "로",
] as const;

function normalizeToken(value: string): string {
  return value.replace(/[^0-9A-Za-z가-힣]/g, "").toLowerCase();
}

function tokensOf(text: string, partIndex: number): SurfaceToken[] {
  return [...text.matchAll(/[0-9A-Za-z가-힣]+/g)].map((match) => ({
    text: match[0],
    normalized: normalizeToken(match[0]),
    startOffset: match.index ?? 0,
    endOffset: (match.index ?? 0) + match[0].length,
    partIndex,
  }));
}

function surfaceBase(value: string): string {
  for (const particle of SURFACE_PARTICLES) {
    if (value.length >= particle.length + 4 && value.endsWith(particle)) {
      return value.slice(0, -particle.length);
    }
  }
  return value;
}

function surfaceNgrams(text: string, partIndex: number) {
  const tokens = tokensOf(text, partIndex);
  const out: SurfaceToken[] = tokens.map((token) => ({
    ...token,
    normalized: surfaceBase(token.normalized),
  }));
  for (let index = 0; index < tokens.length - 1; index++) {
    const left = tokens[index]!;
    const right = tokens[index + 1]!;
    out.push({
      text: text.slice(left.startOffset, right.endOffset),
      normalized: surfaceBase(`${left.normalized}${right.normalized}`),
      startOffset: left.startOffset,
      endOffset: right.endOffset,
      partIndex,
    });
  }
  return out;
}

function usableConsensusTerm(value: string): boolean {
  return (
    value.length >= 4 &&
    value.length <= 16 &&
    !SURFACE_STOP.has(value) &&
    !FUNCTIONAL_ENDING.test(value) &&
    /^[0-9a-z가-힣]+$/iu.test(value)
  );
}

function countNgrams(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [index, text] of texts.entries()) {
    for (const token of surfaceNgrams(text, index)) {
      if (!usableConsensusTerm(token.normalized)) continue;
      counts.set(token.normalized, (counts.get(token.normalized) ?? 0) + 1);
    }
  }
  return counts;
}

function countSingleTokens(texts: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const [index, text] of texts.entries()) {
    for (const token of tokensOf(text, index)) {
      const term = surfaceBase(token.normalized);
      if (!usableConsensusTerm(term)) continue;
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return counts;
}

function looksEntityLike(term: string): boolean {
  return ENTITY_SUFFIX.test(term);
}

/**
 * 같은 회의의 PRIMARY와 독립 타이밍 전사에 반복해서 나타난 표기를 정답 후보로
 * 삼는다. 한 번만 나온 비슷한 표기를 자동 보정하되, 두 독립 결과의 지지 합계가
 * 3회 이상이고 발음상 유일한 후보일 때만 제안한다.
 */
export function suggestConsensusSurfaceCorrections(params: {
  lines: string[];
  timingTexts: string[];
  trustedTerms?: string[];
  minSimilarity?: number;
  minMargin?: number;
}): ConsensusSurfaceCorrection[] {
  const primaryCounts = countNgrams(params.lines);
  const timingCounts = countNgrams(params.timingTexts);
  const primarySingles = countSingleTokens(params.lines);
  const timingSingles = countSingleTokens(params.timingTexts);
  const trusted = new Set(
    (params.trustedTerms ?? []).map(normalizeToken).filter(usableConsensusTerm),
  );
  const candidates = new Set<string>();
  for (const term of new Set([
    ...primaryCounts.keys(),
    ...timingCounts.keys(),
  ])) {
    const primarySupport = primaryCounts.get(term) ?? 0;
    const timingSupport = timingCounts.get(term) ?? 0;
    if (
      trusted.has(term) ||
      (looksEntityLike(term) &&
        (primarySingles.get(term) ?? 0) > 0 &&
        (timingSingles.get(term) ?? 0) > 0 &&
        primarySupport > 0 &&
        timingSupport > 0 &&
        primarySupport + timingSupport >= 3)
    ) {
      candidates.add(term);
    }
  }

  const minSimilarity = params.minSimilarity ?? 0.84;
  const minMargin = params.minMargin ?? 0.05;
  const corrections: ConsensusSurfaceCorrection[] = [];
  for (let lineIndex = 0; lineIndex < params.lines.length; lineIndex++) {
    const line = params.lines[lineIndex] ?? "";
    for (const occurrence of surfaceNgrams(line, lineIndex)) {
      const source = occurrence.normalized;
      if (!usableConsensusTerm(source) || candidates.has(source)) continue;
      if ((primaryCounts.get(source) ?? 0) > 1) continue;

      const ranked = [...candidates]
        .filter((candidate) => Math.abs(candidate.length - source.length) <= 2)
        .map((candidate) => ({
          candidate,
          similarity: pronunciationSimilarity(source, candidate),
        }))
        .filter((row) => row.similarity >= minSimilarity)
        .sort((a, b) => b.similarity - a.similarity);
      const best = ranked[0];
      if (!best) continue;
      if (ranked[1] && best.similarity - ranked[1].similarity < minMargin) {
        continue;
      }
      corrections.push({
        lineIndex,
        startOffset: occurrence.startOffset,
        endOffset: occurrence.endOffset,
        wrong: occurrence.text,
        suggestion: `${best.candidate}${normalizeToken(occurrence.text).slice(source.length)}`,
        similarity: best.similarity,
        primarySupport: primaryCounts.get(best.candidate) ?? 0,
        timingSupport: timingCounts.get(best.candidate) ?? 0,
      });
    }
  }

  const occupied = new Set<string>();
  return corrections
    .sort((a, b) => b.similarity - a.similarity)
    .filter((correction) => {
      const key = `${correction.lineIndex}:${correction.startOffset}:${correction.endOffset}`;
      if (occupied.has(key)) return false;
      occupied.add(key);
      return true;
    });
}

function anchorMatch(left: string, right: string): boolean {
  if (left === right) return true;
  if (Math.min(left.length, right.length) < 4) return false;
  return left.includes(right) || right.includes(left);
}

function boundaryEcho(extra: string, before: string, after: string): boolean {
  if (anchorMatch(extra, before) || anchorMatch(extra, after)) return true;
  if (extra.length < 3) return false;
  return before.startsWith(extra) || after.startsWith(extra);
}

function lcsPairs(primary: SurfaceToken[], evidence: string[]) {
  const rows = primary.length + 1;
  const cols = evidence.length + 1;
  const table = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0),
  );
  for (let i = primary.length - 1; i >= 0; i--) {
    for (let j = evidence.length - 1; j >= 0; j--) {
      table[i]![j] = anchorMatch(primary[i]!.normalized, evidence[j]!)
        ? 1 + table[i + 1]![j + 1]!
        : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  const pairs: Array<{ primaryIndex: number; evidenceIndex: number }> = [];
  let i = 0;
  let j = 0;
  while (i < primary.length && j < evidence.length) {
    if (anchorMatch(primary[i]!.normalized, evidence[j]!)) {
      pairs.push({ primaryIndex: i, evidenceIndex: j });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

function stripPreviousTail(text: string, tokens: SurfaceToken[]): string {
  if (tokens.length === 0) return text;
  return text.slice(0, tokens[0]!.startOffset).trimEnd();
}

function stripCurrentHead(text: string, tokens: SurfaceToken[]): string {
  if (tokens.length === 0) return text;
  const after = text.slice(tokens[tokens.length - 1]!.endOffset);
  return after.replace(/^[\s.,!?…:;·]+/u, "").trimStart();
}

/**
 * 청크 양쪽 overlap에서 생긴 짧은 되감기만 제거한다.
 *
 * PRIMARY 두 청크와 독립 Whisper 단어 시각이 모두 있는 경우에만 동작한다.
 * 경계 앞뒤의 두 앵커는 단어 시각과 일치하고, 그 사이 PRIMARY의 1~2개 단어가
 * 앵커를 되풀이한 형태일 때만 삭제한다. 일반 문장 교정이나 의미 추정은 하지 않는다.
 */
export function repairChunkBoundarySurface(params: {
  parts: string[];
  partRanges: Array<{ startSec: number; endSec: number }>;
  wordTimings: WordTiming[];
  windowSec?: number;
}): { parts: string[]; repairs: ChunkBoundarySurfaceRepair[] } {
  const parts = [...params.parts];
  const repairs: ChunkBoundarySurfaceRepair[] = [];
  const windowSec = Math.max(2, params.windowSec ?? 5);

  for (let partIndex = 1; partIndex < parts.length; partIndex++) {
    const boundarySec = params.partRanges[partIndex]?.startSec;
    if (!Number.isFinite(boundarySec)) continue;

    const previousTokens = tokensOf(
      parts[partIndex - 1] ?? "",
      partIndex - 1,
    ).slice(-12);
    const currentTokens = tokensOf(parts[partIndex] ?? "", partIndex).slice(
      0,
      12,
    );
    if (previousTokens.length < 2 || currentTokens.length < 2) continue;
    const primary = [...previousTokens, ...currentTokens];
    const evidenceWords = params.wordTimings
      .filter(
        (word) =>
          word.endSec >= boundarySec - windowSec &&
          word.startSec <= boundarySec + windowSec,
      )
      .flatMap((word) => tokensOf(word.text, -1))
      .map((token) => token.normalized)
      .filter(Boolean);
    if (evidenceWords.length < 4) continue;

    const pairs = lcsPairs(primary, evidenceWords);
    for (let pairIndex = 0; pairIndex < pairs.length - 1; pairIndex++) {
      const beforePair = pairs[pairIndex]!;
      const afterPair = pairs[pairIndex + 1]!;
      const primaryGap = primary.slice(
        beforePair.primaryIndex + 1,
        afterPair.primaryIndex,
      );
      const evidenceGap = evidenceWords.slice(
        beforePair.evidenceIndex + 1,
        afterPair.evidenceIndex,
      );
      if (
        primaryGap.length < 1 ||
        primaryGap.length > 2 ||
        evidenceGap.length !== 0
      ) {
        continue;
      }
      const previousGap = primaryGap.filter(
        (token) => token.partIndex === partIndex - 1,
      );
      const currentGap = primaryGap.filter(
        (token) => token.partIndex === partIndex,
      );
      if (previousGap.length === 0 || currentGap.length === 0) continue;

      const before = primary[beforePair.primaryIndex]!.normalized;
      const after = primary[afterPair.primaryIndex]!.normalized;
      if (
        !primaryGap.every((token) =>
          boundaryEcho(token.normalized, before, after),
        )
      ) {
        continue;
      }

      const previous = parts[partIndex - 1] ?? "";
      const current = parts[partIndex] ?? "";
      const nextPrevious = stripPreviousTail(previous, previousGap);
      const nextCurrent = stripCurrentHead(current, currentGap);
      if (nextPrevious === previous || nextCurrent === current) continue;
      parts[partIndex - 1] = nextPrevious;
      parts[partIndex] = nextCurrent;
      repairs.push({
        boundarySec,
        removedPrevious: previous.slice(nextPrevious.length).trim(),
        removedCurrent: current
          .slice(0, current.length - nextCurrent.length)
          .trim(),
        evidenceWords,
      });
      break;
    }
  }

  return { parts, repairs };
}
