import { getUsdKrwRates, type UsdKrwQuote } from "@/lib/fx/usd-krw";
import { seoulDateKey } from "@/lib/meeting-date";
import {
  summarizeAiUsage,
  type AiUsageEvent,
  type AiUsageFxInfo,
  type AiUsageSummary,
} from "@/lib/stt/usage-store";

function dayKey(iso: string) {
  return seoulDateKey(iso);
}

function rateMap(quotes: Map<string, UsdKrwQuote>) {
  const out = new Map<string, number>();
  for (const [date, q] of quotes) out.set(date, q.rate);
  return out;
}

function fxFromQuotes(quotes: Map<string, UsdKrwQuote>): AiUsageFxInfo | null {
  if (quotes.size === 0) return null;
  const latestDate = [...quotes.keys()].sort().at(-1)!;
  const q = quotes.get(latestDate);
  if (!q || !(q.rate > 0)) return null;
  return {
    latestRate: q.rate,
    latestAsOf: q.asOf,
    source: q.source,
  };
}

/** 일별 USD→KRW 환율을 적용해 요약. */
export async function summarizeAiUsageWithFx(
  events: AiUsageEvent[],
): Promise<AiUsageSummary> {
  const dates =
    events.length > 0
      ? [...new Set(events.map((e) => dayKey(e.at)))]
      : [seoulDateKey()];

  const quotes = await getUsdKrwRates(dates);
  const summary = summarizeAiUsage(events, rateMap(quotes));
  return {
    ...summary,
    fx: fxFromQuotes(quotes) ?? summary.fx,
  };
}
