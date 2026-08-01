import {
  FREE_MONTHLY_MINUTES,
  SURVEY_UNLOCKED_MONTHLY_MINUTES,
} from "@/lib/stt/survey";

export const QUOTA_WARNING_RATIO = 0.1;

export function minutesFromSeconds(
  seconds: number,
  rounding: "floor" | "round" = "floor",
) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return rounding === "round"
    ? Math.round(seconds / 60)
    : Math.floor(seconds / 60);
}

export function monthlyMinutesFromSeconds(seconds: number) {
  return minutesFromSeconds(seconds, "round");
}

export function isQuotaLow(
  remainingSec: number,
  monthlyLimitSec: number,
) {
  if (
    !Number.isFinite(remainingSec) ||
    !Number.isFinite(monthlyLimitSec) ||
    monthlyLimitSec <= 0
  ) {
    return remainingSec <= 0;
  }
  const warningThresholdSec = Math.max(
    60,
    Math.round(monthlyLimitSec * QUOTA_WARNING_RATIO),
  );
  return remainingSec <= warningThresholdSec;
}

export function surveyAdditionalMinutes(
  currentMonthlyMinutes = FREE_MONTHLY_MINUTES,
) {
  return Math.max(
    0,
    SURVEY_UNLOCKED_MONTHLY_MINUTES - Math.max(0, Math.round(currentMonthlyMinutes)),
  );
}

export function formatSurveyCta(
  currentMonthlyMinutes = FREE_MONTHLY_MINUTES,
) {
  const additionalMinutes = surveyAdditionalMinutes(currentMonthlyMinutes);
  return additionalMinutes > 0
    ? `설문하고 ${additionalMinutes}분 받기`
    : "설문하고 시간 늘리기";
}

export function formatSurveyBenefit(
  currentMonthlyMinutes = FREE_MONTHLY_MINUTES,
) {
  const additionalMinutes = surveyAdditionalMinutes(currentMonthlyMinutes);
  return additionalMinutes > 0
    ? `설문에 참여하면 잔여 시간이 ${additionalMinutes}분 늘어납니다.`
    : "설문에 참여하면 잔여 시간을 늘릴 수 있습니다.";
}

export function formatQuotaRemainingLabel(
  remainingSec: number,
  monthlyLimitSec: number,
) {
  if (remainingSec <= 0) return "잔여 시간 없음";
  if (isQuotaLow(remainingSec, monthlyLimitSec)) {
    return "잔여 시간 얼마 없음";
  }
  return `잔여 ${minutesFromSeconds(remainingSec)}분`;
}

export function formatQuotaLimitLabel(monthlyLimitSec: number) {
  return `월 ${monthlyMinutesFromSeconds(monthlyLimitSec)}분`;
}
