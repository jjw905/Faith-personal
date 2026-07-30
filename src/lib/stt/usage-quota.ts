import { DEMAND_SURVEY_ACTIVE } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { sumUserDurationSecInRange } from "@/lib/stt/pipeline-stats-store";
import {
  FREE_MONTHLY_MINUTES,
  SURVEY_UNLOCKED_MONTHLY_MINUTES,
} from "@/lib/stt/survey";

/**
 * 오픈 준비 기간 한정 월간 업로드 분석 쿼터.
 * 실시간 회화, 팀 회의는 대상이 아니다(업로드 분석만). 팀 기능은 이 기간에
 * 제공하지 않으므로 애초에 대상 밖이다.
 * 분(分) 상수 자체는 survey.ts에 있다. 이 파일은 prisma를 의존해 서버 전용이라,
 * 클라이언트 컴포넌트는 상수만 필요해도 이 파일을 직접 import하면 안 된다.
 *
 * 초기화 주기: 달력 1일이 아니라 가입일(Asia/Seoul) 기념일. 짧은 달은
 * Stripe 등처럼 해당 월 말일로 clamp.
 */
export { FREE_MONTHLY_MINUTES, SURVEY_UNLOCKED_MONTHLY_MINUTES };

export const FREE_MONTHLY_SEC = FREE_MONTHLY_MINUTES * 60;
export const SURVEY_UNLOCKED_MONTHLY_SEC = SURVEY_UNLOCKED_MONTHLY_MINUTES * 60;

const SEOUL = "Asia/Seoul";

export type UploadQuotaStatus = {
  /** 주기 시작일 YYYY-MM-DD (서울) */
  periodKey: string;
  /** @deprecated periodKey와 동일. 구 클라이언트 호환 */
  monthKey: string;
  usedSec: number;
  limitSec: number;
  remainingSec: number;
  surveyCompleted: boolean;
  /** 다음 초기화 시각(ISO). 가입일 기념일 00:00 KST */
  resetsAt: string;
  /** 표시용. 예: 8월 15일 */
  resetsAtLabel: string;
  /** DEMAND_SURVEY_ACTIVE가 꺼지면 서버도 클라이언트도 한도를 적용하지 않는다. */
  enforced: boolean;
};

function seoulYmd(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return {
    y: Number(parts.find((p) => p.type === "year")?.value),
    m: Number(parts.find((p) => p.type === "month")?.value),
    d: Number(parts.find((p) => p.type === "day")?.value),
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD(서울) → 그날 00:00 KST */
function seoulDayStart(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 9 * 60 * 60 * 1000);
}

function daysInSeoulMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function clampedAnniversary(y: number, m: number, anchorDay: number): Date {
  const day = Math.min(anchorDay, daysInSeoulMonth(y, m));
  return seoulDayStart(y, m, day);
}

function addSeoulMonth(y: number, m: number): { y: number; m: number } {
  if (m === 12) return { y: y + 1, m: 1 };
  return { y, m: m + 1 };
}

function subSeoulMonth(y: number, m: number): { y: number; m: number } {
  if (m === 1) return { y: y - 1, m: 12 };
  return { y, m: m - 1 };
}

/**
 * 가입일 기준 현재 쿼터 구간 [periodStart, resetsAt).
 * resetsAt = 다음 가입 기념일 00:00 KST.
 */
export function getSignupQuotaPeriod(
  signupAt: Date,
  now = new Date(),
): {
  periodStart: Date;
  resetsAt: Date;
  periodKey: string;
  resetsAtLabel: string;
} {
  const anchor = seoulYmd(signupAt).d;
  const nowParts = seoulYmd(now);
  let start = clampedAnniversary(nowParts.y, nowParts.m, anchor);
  if (start.getTime() > now.getTime()) {
    const prev = subSeoulMonth(nowParts.y, nowParts.m);
    start = clampedAnniversary(prev.y, prev.m, anchor);
  }
  const startParts = seoulYmd(start);
  const next = addSeoulMonth(startParts.y, startParts.m);
  const resetsAt = clampedAnniversary(next.y, next.m, anchor);
  const resetParts = seoulYmd(resetsAt);
  return {
    periodStart: start,
    resetsAt,
    periodKey: `${startParts.y}-${pad2(startParts.m)}-${pad2(startParts.d)}`,
    resetsAtLabel: `${resetParts.m}월 ${resetParts.d}일`,
  };
}

export async function hasCompletedSurvey(userId: string): Promise<boolean> {
  const row = await prisma.surveyResponse.findUnique({
    where: { userId },
    select: { id: true },
  });
  return row !== null;
}

/**
 * 처리 중(=아직 완료 기록이 안 남은) 업로드를 잠깐 붙잡아 두는 자리.
 *
 * `sumUserDurationSecInRange`는 끝난 시도만 센다. 그래서 같은 사용자가 확인
 * 요청을 동시에 여러 번 보내면(병렬 탭, 스크립트) 각 요청이 서로의 진행
 * 중인 사용량을 못 보고 전부 쿼터를 통과해 버린다 — 통과된 개수만큼 한도를
 * 넘겨 유료 STT 호출이 나간다. 여기 이 프로세스 메모리에 임시로 더해서 막는다.
 * 전제: DigitalOcean 단일 앱 인스턴스. 멀티 인스턴스면 인스턴스마다 예약이
 * 갈라져 레이스가 난다. 공유 durable 예약은 과대 스코프라 두지 않는다.
 * 같은 브라우저 세션의 동시 업로드는 이 메모리 예약으로 막는다. 완료되면
 * 즉시 release, 못 불려도 15분 뒤 스스로 사라진다.
 */
const RESERVATION_TTL_MS = 15 * 60 * 1000;
type Reservation = {
  userId: string;
  periodKey: string;
  sec: number;
  expiresAt: number;
};
const reservations: Reservation[] = [];

function pruneReservations(now: number): void {
  for (let i = reservations.length - 1; i >= 0; i--) {
    if (reservations[i]!.expiresAt <= now) reservations.splice(i, 1);
  }
}

function reservedSecFor(userId: string, periodKey: string): number {
  pruneReservations(Date.now());
  return reservations
    .filter((r) => r.userId === userId && r.periodKey === periodKey)
    .reduce((sum, r) => sum + r.sec, 0);
}

export type QuotaReservation = { release: () => void };

const NOOP_RESERVATION: QuotaReservation = { release: () => {} };

function reserveQuota(
  userId: string,
  periodKey: string,
  sec: number,
): QuotaReservation {
  const entry: Reservation = {
    userId,
    periodKey,
    sec,
    expiresAt: Date.now() + RESERVATION_TTL_MS,
  };
  reservations.push(entry);
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      const idx = reservations.indexOf(entry);
      if (idx >= 0) reservations.splice(idx, 1);
    },
  };
}

export async function getUploadQuotaStatus(
  userId: string,
): Promise<UploadQuotaStatus> {
  const [surveyCompleted, user] = await Promise.all([
    hasCompletedSurvey(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    }),
  ]);
  const signupAt = user?.createdAt ?? new Date();
  const { periodStart, resetsAt, periodKey, resetsAtLabel } =
    getSignupQuotaPeriod(signupAt);
  const usedSec =
    sumUserDurationSecInRange(userId, periodStart, resetsAt) +
    reservedSecFor(userId, periodKey);
  const limitSec = surveyCompleted
    ? SURVEY_UNLOCKED_MONTHLY_SEC
    : FREE_MONTHLY_SEC;
  const enforced = DEMAND_SURVEY_ACTIVE;
  return {
    periodKey,
    monthKey: periodKey,
    usedSec,
    limitSec,
    remainingSec: enforced ? Math.max(0, limitSec - usedSec) : limitSec,
    surveyCompleted,
    resetsAt: resetsAt.toISOString(),
    resetsAtLabel,
    enforced,
  };
}

export class UploadQuotaExceededError extends Error {
  readonly status: UploadQuotaStatus;
  constructor(status: UploadQuotaStatus) {
    const remainingMin = Math.floor(status.remainingSec / 60);
    const message = status.surveyCompleted
      ? `이번 주기 분석 가능 시간(${SURVEY_UNLOCKED_MONTHLY_MINUTES}분)을 모두 사용했습니다. 남은 시간 ${remainingMin}분, ${status.resetsAtLabel}에 초기화됩니다.`
      : `무료 분석 시간(월 ${FREE_MONTHLY_MINUTES}분)을 모두 사용했습니다. 짧은 설문에 참여하면 이번 주기 최대 ${SURVEY_UNLOCKED_MONTHLY_MINUTES}분까지 늘어납니다.`;
    super(message);
    this.name = "UploadQuotaExceededError";
    this.status = status;
  }
}

/**
 * 업로드 파일의 길이를 확인한 뒤(비용이 드는 전사 호출 전에) 호출한다.
 * 초과 시 UploadQuotaExceededError를 던진다.
 *
 * 통과하면 이번 분량만큼 바로 자리를 예약한다(reservation). 호출자는 처리가
 * 끝나면(성공·실패 무관) 반드시 `release()`를 불러 자리를 돌려줘야 한다 —
 * 안 불러도 15분 뒤 자동 소멸하지만, 그동안은 다른 요청이 이 사용량을 못 본다.
 */
export async function assertUploadQuota(params: {
  userId: string;
  newDurationSec: number;
}): Promise<QuotaReservation> {
  if (!DEMAND_SURVEY_ACTIVE) return NOOP_RESERVATION;
  const status = await getUploadQuotaStatus(params.userId);
  if (status.usedSec + params.newDurationSec > status.limitSec) {
    throw new UploadQuotaExceededError(status);
  }
  return reserveQuota(params.userId, status.periodKey, params.newDurationSec);
}
