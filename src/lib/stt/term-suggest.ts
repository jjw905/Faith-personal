/**
 * 오인식 낱말 보정 추천.
 *
 * 본문은 바꾸지 않는다. 신뢰된 회의 용어와 우리말샘 등록어 중 발음이 매우
 * 가까운 후보만 말풍선에 붙인다. 정답 후보 생성에 별도 언어 모델을 쓰지 않는다.
 */
import {
  findDictionaryPronunciationCandidates,
  getKoreanDictionaryStats,
  sourceInKoreanDictionary,
} from "@/lib/stt/korean-dictionary";
import { pronunciationSimilarity, toJamo } from "@/lib/stt/pronunciation";
import type { TranscriptCorrection, TranscriptLine } from "@/types/transcript";

const MIN_GLOSSARY_SIMILARITY = 0.8;
const MIN_GLOSSARY_MARGIN = 0.04;
const MIN_DICTIONARY_SIMILARITY = 0.93;
const MIN_DICTIONARY_MARGIN = 0.025;
const MIN_JAMO = 6;
const MAX_SUGGESTIONS = 24;
const MAX_GENERIC_WORDS = 8;
const GENERIC_SOURCE_CHECK_BUDGET = 96;
const GENERIC_QUERY_BUDGET = 96;
const WORD_CONCURRENCY = 2;

const STOP = new Set([
  "그리고",
  "그러나",
  "그래서",
  "하지만",
  "때문에",
  "위해서",
  "대해서",
  "관련해서",
  "있습니다",
  "했습니다",
  "합니다",
  "됩니다",
  "드립니다",
  "말씀",
  "생각",
  "경우",
  "내용",
  "부분",
  "정도",
  "우리",
  "저희",
  "여러분",
  "지금",
  "오늘",
  "이번",
  "다음",
  "먼저",
  "또한",
  "특히",
  "모두",
  "많이",
  "조금",
]);

const PARTICLES = [
  "으로써",
  "에서는",
  "에게서",
  "으로는",
  "이라는",
  "라는",
  "에서",
  "에게",
  "으로",
  "부터",
  "까지",
  "보다",
  "처럼",
  "마다",
  "이나",
  "이란",
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

const INFLECTED_OR_FUNCTIONAL_ENDING =
  /(습니다|습니까|합니다|했습니다|됩니다|됐습니다|드립니다|한다|된다|했다|됐다|하다|되다|라고|고요|는데|은데|지만|으면|으며|면서|해서|하여|되고|하고)$/;

export type TermSuggestion = {
  lineIndex: number;
  wrong: string;
  suggestion: string;
  reason: string;
  similarity: number;
  source: "glossary" | "ourmalsam";
};

export type TermSuggestResult = {
  suggestions: TermSuggestion[];
  usage: {
    model: "ourmalsam";
    inputTokens: 0;
    outputTokens: 0;
    estimatedUsd: 0;
    apiCalls: number;
    cacheHits: number;
    failures: number;
  };
};

type WordOccurrence = {
  lineIndex: number;
  text: string;
};

function clean(value: string): string {
  return value.replace(/[^0-9A-Za-z가-힣]/g, "");
}

function bare(value: string): string {
  return clean(value).replace(/\s/g, "");
}

function isProtected(value: string, keepTerms: string[]): boolean {
  const word = bare(value);
  return keepTerms.some((term) => {
    const protectedWord = bare(term);
    return (
      protectedWord.length >= 2 &&
      (word.includes(protectedWord) || protectedWord.includes(word))
    );
  });
}

function addSourceParticle(source: string, candidate: string): string {
  for (const particle of PARTICLES) {
    if (
      source.length > particle.length + 1 &&
      source.endsWith(particle) &&
      !candidate.endsWith(particle)
    ) {
      return `${candidate}${particle}`;
    }
  }
  return candidate;
}

function bestGlossaryCandidate(
  source: string,
  glossary: string[],
): { word: string; similarity: number } | null {
  const matches: Array<{ word: string; similarity: number }> = [];
  for (const rawTerm of glossary) {
    const term = clean(rawTerm);
    if (term.length < 2) continue;
    const candidate = addSourceParticle(source, term);
    if (bare(source) === bare(candidate)) continue;
    if (bare(source).includes(bare(candidate)) || bare(candidate).includes(bare(source))) {
      continue;
    }
    const similarity = pronunciationSimilarity(source, candidate);
    if (similarity >= MIN_GLOSSARY_SIMILARITY) {
      matches.push({ word: candidate, similarity });
    }
  }
  matches.sort((a, b) => b.similarity - a.similarity);
  const best = matches[0];
  const second = matches[1];
  if (!best) return null;
  if (second && best.similarity - second.similarity < MIN_GLOSSARY_MARGIN) {
    return null;
  }
  return best;
}

async function glossarySuggestion(
  occurrence: WordOccurrence,
  glossary: string[],
  keepTerms: string[],
  cacheOnly: boolean,
): Promise<TermSuggestion | null> {
  if (isProtected(occurrence.text, keepTerms)) return null;
  const candidate = bestGlossaryCandidate(occurrence.text, glossary);
  if (!candidate) return null;

  const sourceExists = await sourceInKoreanDictionary(occurrence.text, {
    cacheOnly,
  });
  if (sourceExists !== false) return null;

  return {
    lineIndex: occurrence.lineIndex,
    wrong: occurrence.text,
    suggestion: candidate.word,
    reason: "회의 용어와 발음이 비슷함",
    similarity: candidate.similarity,
    source: "glossary",
  };
}

async function dictionarySuggestion(
  occurrence: WordOccurrence,
  keepTerms: string[],
  cacheOnly: boolean,
  sourceMissing = false,
): Promise<TermSuggestion | null> {
  const word = clean(occurrence.text);
  if (!isGenericCandidate(word, keepTerms)) return null;

  if (!sourceMissing) {
    const sourceExists = await sourceInKoreanDictionary(word, { cacheOnly });
    if (sourceExists !== false) return null;
  }

  const candidates = await findDictionaryPronunciationCandidates(word, {
    limit: 3,
    queryBudget: GENERIC_QUERY_BUDGET,
    cacheOnly,
  });
  const best = candidates[0];
  if (!best || best.similarity < MIN_DICTIONARY_SIMILARITY) return null;
  const second = candidates[1];
  if (
    second &&
    best.similarity - second.similarity < MIN_DICTIONARY_MARGIN
  ) {
    return null;
  }

  return {
    lineIndex: occurrence.lineIndex,
    wrong: occurrence.text,
    suggestion: best.word,
    reason: "발음이 가까운 우리말샘 등록어",
    similarity: best.similarity,
    source: "ourmalsam",
  };
}

function isGenericCandidate(word: string, keepTerms: string[]): boolean {
  return !(
    word.length < 3 ||
    word.length > 12 ||
    STOP.has(word) ||
    INFLECTED_OR_FUNCTIONAL_ENDING.test(word) ||
    !/^[가-힣]+$/.test(word) ||
    toJamo(word).length < MIN_JAMO ||
    isProtected(word, keepTerms)
  );
}

function wordOccurrences(lines: string[]): WordOccurrence[] {
  const out: WordOccurrence[] = [];
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? "";
    for (const match of line.matchAll(/[0-9A-Za-z가-힣]+/g)) {
      const text = match[0];
      if (text) out.push({ lineIndex, text });
    }
  }
  return out;
}

function uniqueGenericWords(occurrences: WordOccurrence[]): WordOccurrence[] {
  const counts = new Map<string, number>();
  const first = new Map<string, WordOccurrence>();
  for (const occurrence of occurrences) {
    const key = clean(occurrence.text);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!first.has(key)) first.set(key, occurrence);
  }
  return [...first.entries()]
    .sort((a, b) => {
      const countGap = (counts.get(a[0]) ?? 0) - (counts.get(b[0]) ?? 0);
      if (countGap !== 0) return countGap;
      return b[0].length - a[0].length;
    })
    .map(([, occurrence]) => occurrence);
}

async function mapLimited<T, R>(
  values: T[],
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(WORD_CONCURRENCY, values.length) },
    async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        out[index] = await mapper(values[index]!);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

/** 추천을 대화기록 줄에 붙인다. 본문은 그대로 둔다. */
export function attachCorrections(
  lines: TranscriptLine[],
  suggestions: TermSuggestion[],
): TranscriptLine[] {
  if (suggestions.length === 0) return lines;
  const byLine = new Map<number, TranscriptCorrection[]>();
  for (const suggestion of suggestions) {
    const list = byLine.get(suggestion.lineIndex) ?? [];
    list.push({
      wrong: suggestion.wrong,
      suggestion: suggestion.suggestion,
      reason: suggestion.reason,
      similarity: suggestion.similarity,
      source: suggestion.source,
    });
    byLine.set(suggestion.lineIndex, list);
  }
  return lines.map((line, index) => {
    const corrections = byLine.get(index);
    return corrections ? { ...line, corrections } : line;
  });
}

/**
 * 전사에서 오인식 후보를 찾는다. 정답 전사나 생성형 후보는 받지 않는다.
 * API 오류, 일일 한도, 사전 판정 불명은 모두 추천하지 않는 쪽으로 처리한다.
 */
export async function suggestTermCorrections(
  lines: string[],
  options: {
    glossary?: string[];
    keepTerms?: string[];
    cacheOnly?: boolean;
    genericDictionary?: boolean;
  } = {},
): Promise<TermSuggestResult> {
  const before = getKoreanDictionaryStats();
  const usable = lines.map((line) => line ?? "");
  const glossary = [...new Set((options.glossary ?? []).map(clean).filter(Boolean))];
  const keepTerms = [
    ...new Set((options.keepTerms ?? []).map(clean).filter(Boolean)),
  ];
  const occurrences = wordOccurrences(usable);
  const suggestions: TermSuggestion[] = [];

  if (glossary.length > 0) {
    const glossaryResults = await mapLimited(occurrences, (occurrence) =>
      glossarySuggestion(
        occurrence,
        glossary,
        keepTerms,
        options.cacheOnly === true,
      ),
    );
    suggestions.push(
      ...glossaryResults.filter(
        (value): value is TermSuggestion => value !== null,
      ),
    );
  }

  if (options.genericDictionary !== false) {
    const sourcePool = uniqueGenericWords(occurrences)
      .filter((occurrence) =>
        isGenericCandidate(clean(occurrence.text), keepTerms),
      )
      .slice(0, GENERIC_SOURCE_CHECK_BUDGET);
    const sourceChecks = await mapLimited(sourcePool, async (occurrence) => ({
      occurrence,
      exists: await sourceInKoreanDictionary(clean(occurrence.text), {
        cacheOnly: options.cacheOnly === true,
      }),
    }));
    const missingWords = sourceChecks
      .filter((row) => row.exists === false)
      .map((row) => row.occurrence)
      .slice(0, MAX_GENERIC_WORDS);
    const genericResults = await mapLimited(
      missingWords,
      (occurrence) =>
        dictionarySuggestion(
          occurrence,
          keepTerms,
          options.cacheOnly === true,
          true,
        ),
    );
    suggestions.push(
      ...genericResults.filter(
        (value): value is TermSuggestion => value !== null,
      ),
    );
  }

  const seen = new Set<string>();
  const unique = suggestions
    .sort((a, b) => b.similarity - a.similarity)
    .filter((suggestion) => {
      const key = `${suggestion.lineIndex}:${suggestion.wrong}:${suggestion.suggestion}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS);

  const after = getKoreanDictionaryStats();
  return {
    suggestions: unique,
    usage: {
      model: "ourmalsam",
      inputTokens: 0,
      outputTokens: 0,
      estimatedUsd: 0,
      apiCalls: after.apiCalls - before.apiCalls,
      cacheHits: after.cacheHits - before.cacheHits,
      failures: after.failures - before.failures,
    },
  };
}
