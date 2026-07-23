import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { seoulDateKey } from "@/lib/meeting-date";

export type UsdKrwQuote = {
  /** 조회한 달력일 (YYYY-MM-DD) */
  date: string;
  /** 1 USD = N KRW */
  rate: number;
  /** 제공자가 준 기준일 */
  asOf: string;
  source: "frankfurter" | "open-er-api" | "cache" | "fallback";
};

const ROOT = join(process.cwd(), ".data", "fx", "usd-krw");
const FALLBACK_RATE = 1400;

type CacheRow = {
  date: string;
  rate: number;
  asOf: string;
  source: UsdKrwQuote["source"];
  fetchedAt: string;
};

function ensureDir() {
  if (!existsSync(ROOT)) mkdirSync(ROOT, { recursive: true });
}

function cachePath(date: string) {
  return join(ROOT, `${date}.json`);
}

function readCache(date: string): CacheRow | null {
  const p = cachePath(date);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as CacheRow;
  } catch {
    return null;
  }
}

function writeCache(row: CacheRow) {
  ensureDir();
  writeFileSync(cachePath(row.date), `${JSON.stringify(row)}\n`, "utf8");
}

function todayKey() {
  return seoulDateKey();
}

function readLatestCached(): CacheRow | null {
  ensureDir();
  try {
    const files = readdirSync(ROOT)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    const last = files[files.length - 1];
    if (!last) return null;
    return readCache(last.replace(/\.json$/, ""));
  } catch {
    return null;
  }
}

async function fetchFrankfurter(date: string): Promise<UsdKrwQuote | null> {
  const today = todayKey();
  const path = date >= today ? "latest" : date;
  const url = `https://api.frankfurter.app/${path}?from=USD&to=KRW`;
  const res = await fetch(url, {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    date?: string;
    rates?: { KRW?: number };
  };
  const rate = data.rates?.KRW;
  if (typeof rate !== "number" || !(rate > 0)) return null;
  return {
    date,
    rate,
    asOf: data.date || date,
    source: "frankfurter",
  };
}

async function fetchOpenErApi(date: string): Promise<UsdKrwQuote | null> {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", {
    next: { revalidate: 0 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    result?: string;
    rates?: { KRW?: number };
    time_last_update_utc?: string;
  };
  const rate = data.rates?.KRW;
  if (data.result !== "success" || typeof rate !== "number" || !(rate > 0)) {
    return null;
  }
  const asOf = data.time_last_update_utc
    ? seoulDateKey(data.time_last_update_utc)
    : todayKey();
  return {
    date,
    rate,
    asOf,
    source: "open-er-api",
  };
}

function toQuote(row: CacheRow, source: UsdKrwQuote["source"]): UsdKrwQuote {
  return {
    date: row.date,
    rate: row.rate,
    asOf: row.asOf,
    source,
  };
}

/** 해당일 1 USD = N KRW. 일별 파일 캐시, 실패 시 최근 캐시/고정값. */
export async function getUsdKrwRate(date: string): Promise<UsdKrwQuote> {
  const key = date.slice(0, 10);
  const cached = readCache(key);
  if (cached && cached.rate > 0) {
    return toQuote(cached, "cache");
  }

  let quote: UsdKrwQuote | null = null;
  try {
    quote = await fetchFrankfurter(key);
  } catch {
    quote = null;
  }
  if (!quote) {
    try {
      quote = await fetchOpenErApi(key);
    } catch {
      quote = null;
    }
  }

  if (quote) {
    writeCache({
      date: key,
      rate: quote.rate,
      asOf: quote.asOf,
      source: quote.source,
      fetchedAt: new Date().toISOString(),
    });
    return quote;
  }

  const fallback = readLatestCached();
  if (fallback && fallback.rate > 0) {
    return {
      date: key,
      rate: fallback.rate,
      asOf: fallback.asOf,
      source: "fallback",
    };
  }

  return {
    date: key,
    rate: FALLBACK_RATE,
    asOf: key,
    source: "fallback",
  };
}

/** 여러 날짜 환율. 동일 날짜는 한 번만 조회. */
export async function getUsdKrwRates(
  dates: string[],
): Promise<Map<string, UsdKrwQuote>> {
  const unique = [...new Set(dates.map((d) => d.slice(0, 10)).filter(Boolean))];
  const out = new Map<string, UsdKrwQuote>();
  await Promise.all(
    unique.map(async (d) => {
      out.set(d, await getUsdKrwRate(d));
    }),
  );
  return out;
}

export function usdToKrw(usd: number, rate: number) {
  return Math.max(0, usd) * Math.max(0, rate);
}
