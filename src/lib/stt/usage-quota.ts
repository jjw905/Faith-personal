import { DEMAND_SURVEY_ACTIVE } from "@/lib/feature-flags";
import { PLAN_CATALOG } from "@/lib/plans";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  chargedUsageSec,
  DEFAULT_ANALYSIS_MODE,
  type AnalysisMode,
} from "@/lib/stt/analysis-mode";
import {
  listPipelineAttempts,
  sumUserDurationSecInRange,
} from "@/lib/stt/pipeline-stats-store";
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
 * FREE는 설문 전/후 한도. ADMIN과 PRO는 카탈로그 Pro 포함 분을 쓴다.
 *
 * 초기화 주기: 달력 1일이 아니라 가입일(Asia/Seoul) 기념일. 짧은 달은
 * Stripe 등처럼 해당 월 말일로 clamp.
 */
export { FREE_MONTHLY_MINUTES, SURVEY_UNLOCKED_MONTHLY_MINUTES };

export const FREE_MONTHLY_SEC = FREE_MONTHLY_MINUTES * 60;
export const SURVEY_UNLOCKED_MONTHLY_SEC = SURVEY_UNLOCKED_MONTHLY_MINUTES * 60;
export const PRO_MONTHLY_MINUTES = PLAN_CATALOG.PRO.includedMinutes;
export const PRO_MONTHLY_SEC = PRO_MONTHLY_MINUTES * 60;

const SEOUL = "Asia/Seoul";

export type UploadQuotaStatus = {
  /** 주기 시작일 YYYY-MM-DD (서울) */
  periodKey: string;
  /** @deprecated periodKey와 동일. 구 클라이언트 호환 */
  monthKey: string;
  usedSec: number;
  limitSec: number;
  remainingSec: number;
  monthlyLimitSec: number;
  monthlyRemainingSec: number;
  creditRemainingSec: number;
  graceRemainingSec: number;
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

/** 60분 정밀 파일도 처리 중 만료되지 않도록 충분히 길게 유지한다. */
const RESERVATION_TTL_MS = 4 * 60 * 60 * 1000;
export const ANALYSIS_GRACE_SEC = 5 * 60;

type QuotaContext = {
  surveyCompleted: boolean;
  periodStart: Date;
  resetsAt: Date;
  periodKey: string;
  resetsAtLabel: string;
  monthlyLimitSec: number;
};

type QuotaDb = Prisma.TransactionClient | typeof prisma;

async function quotaContext(userId: string): Promise<QuotaContext> {
  const [surveyCompleted, user] = await Promise.all([
    hasCompletedSurvey(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, role: true, plan: true },
    }),
  ]);
  const period = getSignupQuotaPeriod(user?.createdAt ?? new Date());
  const proTier = user?.role === "ADMIN" || user?.plan === "PRO";
  return {
    surveyCompleted,
    ...period,
    monthlyLimitSec: proTier
      ? PRO_MONTHLY_SEC
      : surveyCompleted
        ? SURVEY_UNLOCKED_MONTHLY_SEC
        : FREE_MONTHLY_SEC,
  };
}

async function releaseExpiredReservations(db: QuotaDb, now: Date) {
  await db.analysisUsage.updateMany({
    where: { status: "RESERVED", expiresAt: { lte: now } },
    data: { status: "RELEASED" },
  });
}

async function quotaSnapshot(
  db: QuotaDb,
  userId: string,
  context: QuotaContext,
  now: Date,
  excludeUsageId?: string,
): Promise<UploadQuotaStatus> {
  await releaseExpiredReservations(db, now);
  const currentUsage = await db.analysisUsage.findMany({
    where: {
      userId,
      periodKey: context.periodKey,
      ...(excludeUsageId ? { id: { not: excludeUsageId } } : {}),
      OR: [
        { status: "CHARGED" },
        { status: "RESERVED", expiresAt: { gt: now } },
      ],
    },
    select: {
      meetingId: true,
      chargedSec: true,
      monthlySec: true,
      graceSec: true,
    },
  });
  const allCreditUsage = await db.analysisUsage.aggregate({
    where: {
      userId,
      ...(excludeUsageId ? { id: { not: excludeUsageId } } : {}),
      creditSec: { gt: 0 },
      OR: [
        { status: "CHARGED" },
        { status: "RESERVED", expiresAt: { gt: now } },
      ],
    },
    _sum: { creditSec: true },
  });
  const creditLedger = await db.minuteCreditLedger.aggregate({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    _sum: { deltaSec: true },
  });
  const excludedMeetings = new Set(currentUsage.map((row) => row.meetingId));
  const legacyUsedSec = sumUserDurationSecInRange(
    userId,
    context.periodStart,
    context.resetsAt,
    listPipelineAttempts(),
    excludedMeetings,
  );
  const monthlyUsedSec =
    legacyUsedSec +
    currentUsage.reduce((sum, row) => sum + row.monthlySec, 0);
  const dbUsedSec = currentUsage.reduce(
    (sum, row) => sum + row.chargedSec,
    0,
  );
  const graceUsedSec = currentUsage.reduce(
    (sum, row) => sum + row.graceSec,
    0,
  );
  const creditRemainingSec = Math.max(
    0,
    (creditLedger._sum.deltaSec ?? 0) -
      (allCreditUsage._sum.creditSec ?? 0),
  );
  const monthlyRemainingSec = Math.max(
    0,
    context.monthlyLimitSec - monthlyUsedSec,
  );
  const graceRemainingSec = Math.max(
    0,
    ANALYSIS_GRACE_SEC - graceUsedSec,
  );
  const usedSec = legacyUsedSec + dbUsedSec;
  const remainingSec =
    monthlyRemainingSec + creditRemainingSec + graceRemainingSec;
  const enforced = DEMAND_SURVEY_ACTIVE;
  return {
    periodKey: context.periodKey,
    monthKey: context.periodKey,
    usedSec,
    limitSec: enforced ? usedSec + remainingSec : context.monthlyLimitSec,
    remainingSec: enforced ? remainingSec : context.monthlyLimitSec,
    monthlyLimitSec: context.monthlyLimitSec,
    monthlyRemainingSec,
    creditRemainingSec,
    graceRemainingSec,
    surveyCompleted: context.surveyCompleted,
    resetsAt: context.resetsAt.toISOString(),
    resetsAtLabel: context.resetsAtLabel,
    enforced,
  };
}

export async function getUploadQuotaStatus(
  userId: string,
): Promise<UploadQuotaStatus> {
  const context = await quotaContext(userId);
  return quotaSnapshot(prisma, userId, context, new Date());
}

export class UploadQuotaExceededError extends Error {
  readonly status: UploadQuotaStatus;
  constructor(status: UploadQuotaStatus) {
    const remainingMin = Math.floor(status.remainingSec / 60);
    const limitMin = Math.round(status.monthlyLimitSec / 60);
    const message =
      status.monthlyLimitSec >= PRO_MONTHLY_SEC
        ? `이번 주기 분석 가능 시간(월 ${PRO_MONTHLY_MINUTES}차감분)과 5분 유예를 모두 사용했습니다. 남은 차감분 ${remainingMin}분입니다. 분 팩을 구매하면 계속할 수 있습니다.`
        : status.surveyCompleted
          ? `이번 주기 분석 가능 시간(${limitMin}차감분)과 5분 유예를 모두 사용했습니다. 남은 차감분 ${remainingMin}분, ${status.resetsAtLabel}에 초기화됩니다.`
          : `무료 분석 시간(월 ${FREE_MONTHLY_MINUTES}분)을 모두 사용했습니다. 짧은 설문에 참여하면 이번 주기 최대 ${SURVEY_UNLOCKED_MONTHLY_MINUTES}분까지 늘어납니다.`;
    super(message);
    this.name = "UploadQuotaExceededError";
    this.status = status;
  }
}

export type QuotaReservation = {
  chargedSec: number;
  finalize: () => Promise<void>;
  release: () => Promise<void>;
};

const NOOP_RESERVATION: QuotaReservation = {
  chargedSec: 0,
  finalize: async () => {},
  release: async () => {},
};

function reservationHandle(
  meetingId: string,
  chargedSec: number,
): QuotaReservation {
  return {
    chargedSec,
    finalize: async () => {
      await prisma.analysisUsage.updateMany({
        where: { meetingId, status: "RESERVED" },
        data: { status: "CHARGED", finalizedAt: new Date() },
      });
    },
    release: async () => {
      await prisma.analysisUsage.updateMany({
        where: { meetingId, status: "RESERVED" },
        data: { status: "RELEASED" },
      });
    },
  };
}

async function reserveWithRetry(params: {
  userId: string;
  meetingId: string;
  durationSec: number;
  analysisMode: AnalysisMode;
  context: QuotaContext;
}): Promise<QuotaReservation> {
  const chargedSec = chargedUsageSec(params.durationSec, params.analysisMode);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const existing = await tx.analysisUsage.findUnique({
            where: { meetingId: params.meetingId },
          });
          if (existing?.status === "CHARGED") return;
          if (
            existing?.status === "RESERVED" &&
            existing.chargedSec >= chargedSec
          ) {
            await tx.analysisUsage.update({
              where: { id: existing.id },
              data: {
                expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
              },
            });
            return;
          }

          const status = await quotaSnapshot(
            tx,
            params.userId,
            params.context,
            now,
            existing?.id,
          );
          if (chargedSec > status.remainingSec) {
            throw new UploadQuotaExceededError(status);
          }
          let remainder = chargedSec;
          const monthlySec = Math.min(
            remainder,
            status.monthlyRemainingSec,
          );
          remainder -= monthlySec;
          const creditSec = Math.min(remainder, status.creditRemainingSec);
          remainder -= creditSec;
          const data = {
            userId: params.userId,
            periodKey: params.context.periodKey,
            mode:
              params.analysisMode === "precision"
                ? ("PRECISION" as const)
                : ("STANDARD" as const),
            durationSec: Math.ceil(Math.max(0, params.durationSec)),
            chargedSec,
            monthlySec,
            creditSec,
            graceSec: remainder,
            status: "RESERVED" as const,
            expiresAt: new Date(now.getTime() + RESERVATION_TTL_MS),
            finalizedAt: null,
          };
          if (existing) {
            await tx.analysisUsage.update({
              where: { id: existing.id },
              data,
            });
          } else {
            await tx.analysisUsage.create({
              data: { meetingId: params.meetingId, ...data },
            });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return reservationHandle(params.meetingId, chargedSec);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("분 사용량을 예약하지 못했습니다.");
}

/**
 * 비용이 드는 모델 호출 전에 DB에 차감분을 예약한다. 같은 meetingId 재시도는
 * 같은 행을 연장하므로 이중 차감되지 않는다.
 */
export async function assertUploadQuota(params: {
  userId: string;
  meetingId: string;
  newDurationSec: number;
  analysisMode?: AnalysisMode;
}): Promise<QuotaReservation> {
  if (!DEMAND_SURVEY_ACTIVE) return NOOP_RESERVATION;
  const context = await quotaContext(params.userId);
  return reserveWithRetry({
    userId: params.userId,
    meetingId: params.meetingId,
    durationSec: params.newDurationSec,
    analysisMode: params.analysisMode ?? DEFAULT_ANALYSIS_MODE,
    context,
  });
}

/** 실시간 발화가 저장될 때 누적 길이만큼 같은 예약을 연장한다. */
export async function reserveRealtimeQuota(params: {
  userId: string;
  meetingId: string;
  elapsedSec: number;
}): Promise<QuotaReservation> {
  return assertUploadQuota({
    userId: params.userId,
    meetingId: params.meetingId,
    newDurationSec: params.elapsedSec,
    analysisMode: "standard",
  });
}

export async function finalizeAnalysisUsage(meetingId: string): Promise<void> {
  await prisma.analysisUsage.updateMany({
    where: { meetingId, status: "RESERVED" },
    data: { status: "CHARGED", finalizedAt: new Date() },
  });
}

/** 결제 웹훅이 붙을 때 같은 reference 재전송에도 한 번만 충전된다. */
export async function grantMinuteCredit(params: {
  userId: string;
  sec: number;
  reason: string;
  reference: string;
  expiresAt?: Date;
}): Promise<void> {
  const deltaSec = Math.floor(params.sec);
  if (deltaSec <= 0) throw new Error("충전할 차감분은 0보다 커야 합니다.");
  await prisma.minuteCreditLedger.upsert({
    where: { reference: params.reference },
    create: {
      userId: params.userId,
      deltaSec,
      reason: params.reason.slice(0, 80),
      reference: params.reference,
      expiresAt: params.expiresAt,
    },
    update: {},
  });
}
