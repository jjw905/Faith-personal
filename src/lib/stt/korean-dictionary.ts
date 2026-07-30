import { prisma } from "@/lib/prisma";
import {
  pronunciationSimilarity,
  toJamo,
} from "@/lib/stt/pronunciation";

const API = "https://opendict.korean.go.kr/api/search";
const REQUEST_TIMEOUT_MS = 1800;
const DAILY_CALL_LIMIT = 48_000;
const LOOKUP_CONCURRENCY = 12;

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
  "고요",
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

const ENDINGS = [
  "습니다",
  "습니까",
  "습니다만",
  "었기",
  "았기",
  "되기",
  "되어",
  "되는",
  "되었",
  "하기",
  "하여",
  "하는",
  "했고",
  "했다",
  "하며",
  "하면",
  "하여서",
  "하면서",
  "었고",
  "았고",
  "는데",
  "은데",
  "지만",
  "으면",
  "고",
  "기",
] as const;

const CHO = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;

const JUNG = [
  "ㅏ",
  "ㅐ",
  "ㅑ",
  "ㅒ",
  "ㅓ",
  "ㅔ",
  "ㅕ",
  "ㅖ",
  "ㅗ",
  "ㅘ",
  "ㅙ",
  "ㅚ",
  "ㅛ",
  "ㅜ",
  "ㅝ",
  "ㅞ",
  "ㅟ",
  "ㅠ",
  "ㅡ",
  "ㅢ",
  "ㅣ",
] as const;

const JONG = [
  "",
  "ㄱ",
  "ㄲ",
  "ㄳ",
  "ㄴ",
  "ㄵ",
  "ㄶ",
  "ㄷ",
  "ㄹ",
  "ㄺ",
  "ㄻ",
  "ㄼ",
  "ㄽ",
  "ㄾ",
  "ㄿ",
  "ㅀ",
  "ㅁ",
  "ㅂ",
  "ㅄ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;

const CHO_INDEX = new Map<string, number>(CHO.map((value, index) => [value, index]));
const JUNG_INDEX = new Map<string, number>(
  JUNG.map((value, index) => [value, index]),
);
const JONG_INDEX = new Map<string, number>(
  JONG.map((value, index) => [value, index]),
);

const NEAR_CHO = [
  ["ㄱ", "ㄲ", "ㅋ"],
  ["ㄷ", "ㄸ", "ㅌ"],
  ["ㅂ", "ㅃ", "ㅍ"],
  ["ㅅ", "ㅆ", "ㅈ", "ㅉ", "ㅊ"],
  ["ㄴ", "ㅇ"],
  ["ㄹ", "ㄴ"],
  ["ㅁ", "ㅂ"],
] as const;

const NEAR_JUNG = [
  ["ㅐ", "ㅔ", "ㅒ", "ㅖ"],
  ["ㅚ", "ㅙ", "ㅞ"],
  ["ㅏ", "ㅑ"],
  ["ㅓ", "ㅕ"],
  ["ㅗ", "ㅛ"],
  ["ㅜ", "ㅠ"],
  ["ㅡ", "ㅣ", "ㅢ"],
] as const;

const NEAR_JONG = [
  ["", "ㄴ", "ㅇ", "ㅁ"],
  ["ㄱ", "ㄲ", "ㅋ"],
  ["ㄷ", "ㅅ", "ㅆ", "ㅈ", "ㅊ", "ㅌ"],
  ["ㅂ", "ㅍ"],
  ["ㄹ", "ㄴ"],
] as const;

export type KoreanDictionaryStats = {
  apiCalls: number;
  cacheHits: number;
  failures: number;
  dailyLimitSkips: number;
  missingKeySkips: number;
};

export type DictionaryPronunciationCandidate = {
  word: string;
  similarity: number;
};

const stats: KoreanDictionaryStats = {
  apiCalls: 0,
  cacheHits: 0,
  failures: 0,
  dailyLimitSkips: 0,
  missingKeySkips: 0,
};

export function getKoreanDictionaryStats(): KoreanDictionaryStats {
  return { ...stats };
}

function cleanWord(word: string): string {
  return word.replace(/[^0-9A-Za-z가-힣]/g, "");
}

function splitParticle(word: string): { base: string; suffix: string } {
  for (const particle of PARTICLES) {
    if (word.length > particle.length + 1 && word.endsWith(particle)) {
      return {
        base: word.slice(0, -particle.length),
        suffix: particle,
      };
    }
  }
  return { base: word, suffix: "" };
}

export function dictionaryLemmaCandidates(word: string): string[] {
  const cleaned = cleanWord(word);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    if (value.length < 2 || seen.has(value) || !/[가-힣]/.test(value)) return;
    seen.add(value);
    out.push(value);
  };

  push(cleaned);
  const { base } = splitParticle(cleaned);
  push(base);

  for (const ending of ENDINGS) {
    if (base.length <= ending.length || !base.endsWith(ending)) continue;
    const stem = base.slice(0, -ending.length);
    if (stem === "됐" || stem.endsWith("되었") || stem.endsWith("됐")) {
      push("되다");
    } else if (
      stem === "했" ||
      stem.endsWith("하였") ||
      stem.endsWith("했")
    ) {
      push("하다");
    } else if (
      stem.length >= 2 &&
      (stem.endsWith("었") || stem.endsWith("았"))
    ) {
      push(`${stem.slice(0, -1)}다`);
    }
    if (stem.length >= 2) push(stem);
  }

  if (base.length >= 3 && base.endsWith("인")) {
    push(base.slice(0, -1));
  }

  return out;
}

function seoulDay(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function reserveApiCall(): Promise<boolean> {
  const day = seoulDay();
  // upsert 동시 생성은 day unique로 P2002가 난다. 먼저 행만 확보한다.
  await prisma.koreanDictionaryUsage.createMany({
    data: [{ day, callCount: 0 }],
    skipDuplicates: true,
  });
  const reserved = await prisma.koreanDictionaryUsage.updateMany({
    where: {
      day,
      callCount: { lt: DAILY_CALL_LIMIT },
    },
    data: { callCount: { increment: 1 } },
  });
  if (reserved.count === 0) {
    stats.dailyLimitSkips += 1;
    return false;
  }
  return true;
}

async function queryExact(word: string): Promise<boolean | null> {
  const key = process.env.KOREAN_DICT_API_KEY?.trim();
  if (!key) {
    stats.missingKeySkips += 1;
    return null;
  }
  if (!(await reserveApiCall())) return null;

  const url = new URL(API);
  url.searchParams.set("key", key);
  url.searchParams.set("q", word);
  url.searchParams.set("req_type", "json");
  url.searchParams.set("advanced", "y");
  url.searchParams.set("target", "1");
  url.searchParams.set("method", "exact");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    stats.apiCalls += 1;
    if (!response.ok) {
      stats.failures += 1;
      return null;
    }
    const body = (await response.json()) as {
      channel?: { total?: number | string };
      error?: unknown;
    };
    if (body.error) {
      stats.failures += 1;
      return null;
    }
    const exists = Number(body.channel?.total ?? 0) > 0;
    await prisma.koreanDictionaryCache.upsert({
      where: { word },
      create: { word, exists },
      update: { exists, checkedAt: new Date() },
    });
    return exists;
  } catch {
    stats.apiCalls += 1;
    stats.failures += 1;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function exactDictionaryWordExists(
  word: string,
  options?: { cacheOnly?: boolean },
): Promise<boolean | null> {
  const cleaned = cleanWord(word);
  if (cleaned.length < 2 || !/[가-힣]/.test(cleaned)) return false;

  const cached = await prisma.koreanDictionaryCache.findUnique({
    where: { word: cleaned },
  });
  if (cached) {
    stats.cacheHits += 1;
    return cached.exists;
  }
  if (options?.cacheOnly) return null;
  return queryExact(cleaned);
}

/**
 * 원문 또는 보수적으로 만든 기본형 하나라도 사전에 있으면 보호한다.
 * API 실패와 한도 소진은 null로 돌려 추천 자체를 중단하게 한다.
 */
export async function sourceInKoreanDictionary(
  word: string,
  options?: { cacheOnly?: boolean },
): Promise<boolean | null> {
  const candidates = dictionaryLemmaCandidates(word);
  if (candidates.length === 0) return false;

  let hadUnknown = false;
  for (const candidate of candidates) {
    const hit = await exactDictionaryWordExists(candidate, options);
    if (hit === true) return true;
    if (hit === null) hadUnknown = true;
  }
  return hadUnknown ? null : false;
}

type Syllable = { cho: number; jung: number; jong: number };

function decomposeSyllable(char: string): Syllable | null {
  const code = char.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return null;
  const index = code - 0xac00;
  return {
    cho: Math.floor(index / 588),
    jung: Math.floor((index % 588) / 28),
    jong: index % 28,
  };
}

function composeSyllable(value: Syllable): string {
  return String.fromCharCode(
    0xac00 + value.cho * 588 + value.jung * 28 + value.jong,
  );
}

function nearIndexes(
  value: string,
  groups: readonly (readonly string[])[],
  index: Map<string, number>,
): number[] {
  const group = groups.find((items) => items.includes(value));
  if (!group) return [];
  return group
    .filter((item) => item !== value)
    .map((item) => index.get(item))
    .filter((item): item is number => item !== undefined);
}

function generatePronunciationNeighbors(
  word: string,
  budget: number,
): string[] {
  const syllables = [...word].map(decomposeSyllable);
  if (syllables.some((item) => !item)) return [];
  const source = syllables as Syllable[];
  const out = new Set<string>();

  const add = (position: number, patch: Partial<Syllable>) => {
    if (out.size >= budget) return;
    const next = source.map((item) => ({ ...item }));
    next[position] = { ...next[position]!, ...patch };
    out.add(next.map(composeSyllable).join(""));
  };

  for (let i = 0; i < source.length && out.size < budget; i++) {
    const syllable = source[i]!;
    for (const cho of nearIndexes(
      CHO[syllable.cho]!,
      NEAR_CHO,
      CHO_INDEX,
    )) {
      add(i, { cho });
    }
    for (const jung of nearIndexes(
      JUNG[syllable.jung]!,
      NEAR_JUNG,
      JUNG_INDEX,
    )) {
      add(i, { jung });
    }
    for (const jong of nearIndexes(
      JONG[syllable.jong]!,
      NEAR_JONG,
      JONG_INDEX,
    )) {
      add(i, { jong });
    }
  }

  for (let i = 0; i < source.length && out.size < budget; i++) {
    const syllable = source[i]!;
    for (let cho = 0; cho < CHO.length && out.size < budget; cho++) {
      if (cho !== syllable.cho) add(i, { cho });
    }
    for (let jung = 0; jung < JUNG.length && out.size < budget; jung++) {
      if (jung !== syllable.jung) add(i, { jung });
    }
    for (let jong = 0; jong < JONG.length && out.size < budget; jong++) {
      if (jong !== syllable.jong) add(i, { jong });
    }
  }

  out.delete(word);
  return [...out];
}

export async function findDictionaryPronunciationCandidates(
  sourceWord: string,
  options?: {
    limit?: number;
    queryBudget?: number;
    cacheOnly?: boolean;
  },
): Promise<DictionaryPronunciationCandidate[]> {
  const cleaned = cleanWord(sourceWord);
  const { base, suffix } = splitParticle(cleaned);
  if (
    base.length < 3 ||
    base.length > 8 ||
    toJamo(base).length < 6 ||
    !/^[가-힣]+$/.test(base)
  ) {
    return [];
  }

  const variants = generatePronunciationNeighbors(
    base,
    options?.queryBudget ?? 260,
  );
  const found: DictionaryPronunciationCandidate[] = [];
  for (let i = 0; i < variants.length; i += LOOKUP_CONCURRENCY) {
    const batch = variants.slice(i, i + LOOKUP_CONCURRENCY);
    const hits = await Promise.all(
      batch.map(async (candidate) => ({
        candidate,
        exists: await exactDictionaryWordExists(candidate, {
          cacheOnly: options?.cacheOnly,
        }),
      })),
    );
    for (const hit of hits) {
      if (!hit.exists) continue;
      found.push({
        word: `${hit.candidate}${suffix}`,
        similarity: pronunciationSimilarity(cleaned, `${hit.candidate}${suffix}`),
      });
    }
  }

  return found
    .filter((candidate) => candidate.similarity >= 0.9)
    .sort(
      (a, b) =>
        b.similarity - a.similarity ||
        a.word.length - b.word.length ||
        a.word.localeCompare(b.word, "ko"),
    )
    .slice(0, options?.limit ?? 3);
}
