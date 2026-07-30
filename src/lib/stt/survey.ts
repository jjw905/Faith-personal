/**
 * 결제 의향·성능 만족도 수요조사 문항. 문구는 응답 부담을 줄이기 위해
 * 일반 설문 사이트(구글 폼 등)에서 쓰는 "가장 가까운 답을 골라주세요" 톤을 따른다.
 * 값은 전부 구조화된 선택형 + 척도라 별도 가공 없이 바로 집계할 수 있다.
 */

export const PAYMENT_INTENTS = ["willing", "free_only", "unsure"] as const;
export type PaymentIntent = (typeof PAYMENT_INTENTS)[number];

export const PAYMENT_INTENT_LABELS: Record<PaymentIntent, string> = {
  willing: "적정 금액이면 결제하고 계속 쓰겠다",
  free_only: "무료일 때만 쓰겠다",
  unsure: "아직 잘 모르겠다",
};

export const PRICE_PREFERENCES = [
  "under_5000",
  "5000_15000",
  "15000_30000",
  "over_30000",
] as const;
export type PricePreference = (typeof PRICE_PREFERENCES)[number];

export const PRICE_PREFERENCE_LABELS: Record<PricePreference, string> = {
  under_5000: "5,000원 미만",
  "5000_15000": "5,000원 ~ 15,000원",
  "15000_30000": "15,000원 ~ 30,000원",
  over_30000: "30,000원 이상",
};

export const FEATURE_KEYS = [
  "diarization",
  "summary_timeline",
  "correction_suggest",
  "memo",
  "playback_sync",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  diarization: "화자 구분(누가 말했는지 자동 표시)",
  summary_timeline: "자동 요약과 타임라인",
  correction_suggest: "잘못 알아들은 단어 보정 추천",
  memo: "대화기록에 메모 남기기",
  playback_sync: "재생 중 실시간 구간 하이라이트",
};

export const STT_SATISFACTION_MIN = 1;
export const STT_SATISFACTION_MAX = 5;
export const STT_SATISFACTION_LABELS: Record<number, string> = {
  1: "전혀 만족하지 않음",
  2: "만족하지 않음",
  3: "보통",
  4: "만족",
  5: "매우 만족",
};

export const IMPROVEMENT_NOTE_MAX = 500;

/**
 * 결제 수요조사 기간 한정 월간 업로드 분석 쿼터 분(分) 값. 클라이언트 컴포넌트에서도
 * 안전하게 쓸 수 있도록 서버 전용 모듈(usage-quota.ts, prisma 의존)과 분리해 여기 둔다.
 */
export const FREE_MONTHLY_MINUTES = 20;
export const SURVEY_UNLOCKED_MONTHLY_MINUTES = 60;

/** 설문 제출 완료. 사이드바 플랜 Gift 등 진입점을 즉시 갱신한다. */
export const SURVEY_COMPLETED_EVENT = "faith:survey-completed";

export function notifySurveyCompleted() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SURVEY_COMPLETED_EVENT));
}

export type SurveyResponseInput = {
  paymentIntent: PaymentIntent;
  pricePreference: PricePreference | null;
  sttSatisfaction: number;
  featurePriorities: FeatureKey[];
  improvementNote: string | null;
};

export function validateSurveyResponse(
  input: unknown,
): { ok: true; value: SurveyResponseInput } | { ok: false; message: string } {
  if (typeof input !== "object" || input === null) {
    return { ok: false, message: "잘못된 요청입니다." };
  }
  const body = input as Record<string, unknown>;

  const paymentIntent = body.paymentIntent;
  if (
    typeof paymentIntent !== "string" ||
    !PAYMENT_INTENTS.includes(paymentIntent as PaymentIntent)
  ) {
    return { ok: false, message: "결제 의향 답변을 선택해 주세요." };
  }

  let pricePreference: PricePreference | null = null;
  if (paymentIntent === "willing") {
    if (
      typeof body.pricePreference !== "string" ||
      !PRICE_PREFERENCES.includes(body.pricePreference as PricePreference)
    ) {
      return { ok: false, message: "적정 금액대를 선택해 주세요." };
    }
    pricePreference = body.pricePreference as PricePreference;
  }

  const sttSatisfaction = body.sttSatisfaction;
  if (
    typeof sttSatisfaction !== "number" ||
    !Number.isInteger(sttSatisfaction) ||
    sttSatisfaction < STT_SATISFACTION_MIN ||
    sttSatisfaction > STT_SATISFACTION_MAX
  ) {
    return { ok: false, message: "받아쓰기 만족도를 선택해 주세요." };
  }

  const featurePrioritiesRaw = body.featurePriorities;
  if (!Array.isArray(featurePrioritiesRaw) || featurePrioritiesRaw.length === 0) {
    return { ok: false, message: "가장 중요한 기능을 1개 이상 선택해 주세요." };
  }
  const featurePriorities = featurePrioritiesRaw.filter(
    (v): v is FeatureKey =>
      typeof v === "string" && FEATURE_KEYS.includes(v as FeatureKey),
  );
  if (featurePriorities.length === 0) {
    return { ok: false, message: "가장 중요한 기능을 1개 이상 선택해 주세요." };
  }

  let improvementNote: string | null = null;
  if (typeof body.improvementNote === "string") {
    const trimmed = body.improvementNote.trim();
    if (trimmed.length > 0) {
      improvementNote = trimmed.slice(0, IMPROVEMENT_NOTE_MAX);
    }
  }

  return {
    ok: true,
    value: {
      paymentIntent: paymentIntent as PaymentIntent,
      pricePreference,
      sttSatisfaction,
      featurePriorities,
      improvementNote,
    },
  };
}
