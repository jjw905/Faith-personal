import { prisma } from "@/lib/prisma";
import {
  FEATURE_KEYS,
  PAYMENT_INTENTS,
  PRICE_PREFERENCES,
  STT_SATISFACTION_MAX,
  STT_SATISFACTION_MIN,
  type FeatureKey,
  type PaymentIntent,
  type PricePreference,
} from "@/lib/stt/survey";

type CountMap<K extends string> = Partial<Record<K, number>>;

function bump<K extends string>(map: CountMap<K>, key: K) {
  map[key] = (map[key] ?? 0) + 1;
}

export type SurveyStatsSummary = {
  total: number;
  totalUsers: number;
  responseRate: number;
  willingRate: number;
  avgSatisfaction: number;
  byPaymentIntent: CountMap<PaymentIntent>;
  byPricePreference: CountMap<PricePreference>;
  byFeature: CountMap<FeatureKey>;
  satisfactionCounts: CountMap<string>;
};

/**
 * 수요조사 응답 집계. 개별 자유서술(improvementNote)이나 userId는 절대
 * 포함하지 않는다. 선택형·척도 값의 분포와 참여 건수만 반환한다.
 */
export async function summarizeSurveyStats(): Promise<SurveyStatsSummary> {
  const rows = await prisma.surveyResponse.findMany({
    select: {
      paymentIntent: true,
      pricePreference: true,
      sttSatisfaction: true,
      featurePriorities: true,
    },
  });

  const byPaymentIntent: CountMap<PaymentIntent> = {};
  const byPricePreference: CountMap<PricePreference> = {};
  const byFeature: CountMap<FeatureKey> = {};
  const satisfactionCounts: CountMap<string> = {};
  let satisfactionSum = 0;

  for (const r of rows) {
    if (PAYMENT_INTENTS.includes(r.paymentIntent as PaymentIntent)) {
      bump(byPaymentIntent, r.paymentIntent as PaymentIntent);
    }
    if (
      r.pricePreference &&
      PRICE_PREFERENCES.includes(r.pricePreference as PricePreference)
    ) {
      bump(byPricePreference, r.pricePreference as PricePreference);
    }
    for (const f of r.featurePriorities) {
      if (FEATURE_KEYS.includes(f as FeatureKey)) bump(byFeature, f as FeatureKey);
    }
    if (
      r.sttSatisfaction >= STT_SATISFACTION_MIN &&
      r.sttSatisfaction <= STT_SATISFACTION_MAX
    ) {
      bump(satisfactionCounts, String(r.sttSatisfaction));
      satisfactionSum += r.sttSatisfaction;
    }
  }

  const total = rows.length;
  const totalUsers = await prisma.user.count({ where: { role: "USER" } });

  return {
    total,
    totalUsers,
    responseRate: totalUsers > 0 ? total / totalUsers : 0,
    willingRate: total > 0 ? (byPaymentIntent.willing ?? 0) / total : 0,
    avgSatisfaction: total > 0 ? satisfactionSum / total : 0,
    byPaymentIntent,
    byPricePreference,
    byFeature,
    satisfactionCounts,
  };
}
