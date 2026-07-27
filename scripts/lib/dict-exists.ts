/**
 * 우리말샘 열린 API로 "원본이 사전에 있는가"만 본다.
 * 뜻풀이·용례는 받지 않고, 캐시에도 참거짓만 담는다.
 *
 * 키가 없거나 조회가 실패하면 보호(바꾸지 않음) 쪽으로 기울인다.
 */

const API = "https://opendict.korean.go.kr/api/search";
const TIMEOUT_MS = 1500;

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
];

/** 활용·어미만 짧게 떼어 기본형 후보를 만든다. 과하게 자르지 않는다. */
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
];

export type DictStats = {
  apiCalls: number;
  cacheHits: number;
  failures: number;
  skippedNoKey: number;
  latenciesMs: number[];
};

const cache = new Map<string, boolean>();
const stats: DictStats = {
  apiCalls: 0,
  cacheHits: 0,
  failures: 0,
  skippedNoKey: 0,
  latenciesMs: [],
};

export function getDictStats(): DictStats {
  return {
    ...stats,
    latenciesMs: [...stats.latenciesMs],
  };
}

export function resetDictStats(): void {
  stats.apiCalls = 0;
  stats.cacheHits = 0;
  stats.failures = 0;
  stats.skippedNoKey = 0;
  stats.latenciesMs = [];
}

export function clearDictCache(): void {
  cache.clear();
}

function stripParticle(word: string): string {
  for (const p of PARTICLES) {
    if (word.length > p.length + 1 && word.endsWith(p)) {
      return word.slice(0, -p.length);
    }
  }
  return word;
}

/** 조회에 쓸 기본형 후보. 원형 → 조사 제거 → 짧은 어미 제거. */
export function lemmaCandidates(word: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (w: string) => {
    if (!w || w.length < 2) return;
    if (!/[가-힣]/.test(w)) return;
    if (seen.has(w)) return;
    seen.add(w);
    out.push(w);
  };

  push(word);
  const base = stripParticle(word);
  push(base);

  for (const e of ENDINGS) {
    if (base.length <= e.length) continue;
    if (!base.endsWith(e)) continue;
    // 어간이 한 글자여도 됐→되다 변환은 시도한다.
    const stem = base.slice(0, -e.length);
    if (stem === "됐" || stem.endsWith("되었") || stem.endsWith("됐")) {
      push("되다");
    } else if (stem === "했" || stem.endsWith("하였") || stem.endsWith("했")) {
      push("하다");
    } else if (stem.length >= 2 && (stem.endsWith("었") || stem.endsWith("았"))) {
      push(`${stem.slice(0, -1)}다`);
    }
    if (stem.length >= 2) push(stem);
  }

  // 관형사형 '인' (모델인 → 모델). 남은 어간이 2글자 이상일 때만.
  if (base.length >= 3 && base.endsWith("인")) {
    push(base.slice(0, -1));
  }

  for (const c of [...out]) {
    if (c.endsWith("되었") || c.endsWith("됐")) {
      push(c.replace(/되었$|됐$/, "되다"));
    } else if (c.endsWith("하였") || c.endsWith("했")) {
      push(c.replace(/하였$|했$/, "하다"));
    } else if (c.length >= 3 && (c.endsWith("었") || c.endsWith("았"))) {
      push(`${c.slice(0, -1)}다`);
    }
  }

  return out;
}

async function queryExact(key: string, q: string): Promise<boolean | null> {
  const url = new URL(API);
  url.searchParams.set("key", key);
  url.searchParams.set("q", q);
  url.searchParams.set("req_type", "json");
  url.searchParams.set("advanced", "y");
  url.searchParams.set("target", "1");
  url.searchParams.set("method", "exact");
  // 뜻풀이 필드를 쓰지 않는다. total만 본다.

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    stats.latenciesMs.push(Date.now() - t0);
    stats.apiCalls += 1;
    if (!res.ok) {
      stats.failures += 1;
      return null;
    }
    const body = (await res.json()) as {
      channel?: { total?: number | string };
      error?: unknown;
    };
    if (body.error) {
      stats.failures += 1;
      return null;
    }
    const total = Number(body.channel?.total ?? 0);
    return total > 0;
  } catch {
    stats.latenciesMs.push(Date.now() - t0);
    stats.apiCalls += 1;
    stats.failures += 1;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 원본이 사전에 있으면 true (덮어쓰지 말 것).
 * 키 없음 → null (관문 건너뜀).
 * API 실패 → true (보호 쪽으로).
 */
export async function sourceInDictionary(
  word: string,
  opts?: { cacheOnly?: boolean },
): Promise<boolean | null> {
  const key = process.env.KOREAN_DICT_API_KEY?.trim();
  if (!key) {
    stats.skippedNoKey += 1;
    return null;
  }

  const cleaned = word.replace(/[^0-9A-Za-z가-힣]/g, "");
  if (cleaned.length < 2) return false;

  if (cache.has(cleaned)) {
    stats.cacheHits += 1;
    return cache.get(cleaned)!;
  }

  // 후보 단위 캐시도 먼저 본다. 이미 아는 기본형이면 API를 안 부른다.
  const cands = lemmaCandidates(cleaned);
  for (const c of cands) {
    if (cache.has(`lemma:${c}`)) {
      if (cache.get(`lemma:${c}`)) {
        cache.set(cleaned, true);
        stats.cacheHits += 1;
        return true;
      }
    }
  }

  if (opts?.cacheOnly) {
    // 실시간: 캐시에 없으면 관문을 건너뛴다(바꾸기 허용).
    return null;
  }

  for (const c of cands) {
    const hit = await queryExact(key, c);
    if (hit === null) {
      // 실패 시 보호
      cache.set(cleaned, true);
      return true;
    }
    cache.set(`lemma:${c}`, hit);
    if (hit) {
      cache.set(cleaned, true);
      return true;
    }
  }

  cache.set(cleaned, false);
  return false;
}
