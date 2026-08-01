import { AnalysisJobStatus, AnalysisMode, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AnalysisMode as ProductAnalysisMode } from "@/lib/stt/analysis-mode";

export const ANALYSIS_JOB_MAX_ATTEMPTS = 3;
const STALE_JOB_MS = 6 * 60 * 60 * 1000;

export type EnqueueAnalysisJobParams = {
  meetingId: string;
  userId: string;
  vaultFileId: string;
  title: string;
  analysisMode?: ProductAnalysisMode;
  bypassModeration?: boolean;
  force?: boolean;
};

function toDbMode(mode: ProductAnalysisMode | undefined): AnalysisMode {
  return mode === "precision" ? AnalysisMode.PRECISION : AnalysisMode.STANDARD;
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 2_000);
}

/**
 * meetingId가 유일키라 같은 업로드 요청이 재전송되어도 작업을 중복 생성하지 않는다.
 */
export async function enqueueAnalysisJob(
  params: EnqueueAnalysisJobParams,
) {
  const existing = await prisma.analysisJob.findUnique({
    where: { meetingId: params.meetingId },
  });
  if (existing) {
    if (!params.force || existing.status === AnalysisJobStatus.RUNNING) {
      return existing;
    }
    return prisma.analysisJob.update({
      where: { id: existing.id },
      data: {
        userId: params.userId,
        vaultFileId: params.vaultFileId,
        title: params.title,
        analysisMode: toDbMode(params.analysisMode),
        bypassModeration: params.bypassModeration ?? false,
        status: AnalysisJobStatus.QUEUED,
        attempts: 0,
        availableAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        startedAt: null,
        finishedAt: null,
        lastError: null,
      },
    });
  }

  try {
    return await prisma.analysisJob.create({
      data: {
        meetingId: params.meetingId,
        userId: params.userId,
        vaultFileId: params.vaultFileId,
        title: params.title,
        analysisMode: toDbMode(params.analysisMode),
        bypassModeration: params.bypassModeration ?? false,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const raced = await prisma.analysisJob.findUnique({
        where: { meetingId: params.meetingId },
      });
      if (raced) return raced;
    }
    throw error;
  }
}

/**
 * 여러 Worker가 동시에 실행되어도 한 작업만 RUNNING으로 선점한다.
 */
export async function claimNextAnalysisJob(workerId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();
    try {
      return await prisma.$transaction(
        async (tx) => {
          const candidate = await tx.analysisJob.findFirst({
            where: {
              status: AnalysisJobStatus.QUEUED,
              availableAt: { lte: now },
            },
            orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
          });
          if (!candidate) return null;

          const claimed = await tx.analysisJob.updateMany({
            where: {
              id: candidate.id,
              status: AnalysisJobStatus.QUEUED,
            },
            data: {
              status: AnalysisJobStatus.RUNNING,
              attempts: { increment: 1 },
              lockedAt: now,
              lockedBy: workerId,
              startedAt: candidate.startedAt ?? now,
              lastError: null,
            },
          });
          if (claimed.count !== 1) return null;
          return tx.analysisJob.findUnique({ where: { id: candidate.id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      const isSerializationConflict =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      if (!isSerializationConflict || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  return null;
}

export async function completeAnalysisJob(params: {
  id: string;
  workerId: string;
}) {
  return prisma.analysisJob.updateMany({
    where: {
      id: params.id,
      status: AnalysisJobStatus.RUNNING,
      lockedBy: params.workerId,
    },
    data: {
      status: AnalysisJobStatus.SUCCEEDED,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
    },
  });
}

export async function failAnalysisJob(params: {
  id: string;
  workerId: string;
  attempts: number;
  error: unknown;
  retryable?: boolean;
}) {
  const retryable =
    params.retryable !== false && params.attempts < ANALYSIS_JOB_MAX_ATTEMPTS;
  const retryDelayMs = Math.min(
    15 * 60 * 1000,
    30 * 1000 * 2 ** Math.max(0, params.attempts - 1),
  );
  return prisma.analysisJob.updateMany({
    where: {
      id: params.id,
      status: AnalysisJobStatus.RUNNING,
      lockedBy: params.workerId,
    },
    data: {
      status: retryable ? AnalysisJobStatus.QUEUED : AnalysisJobStatus.FAILED,
      availableAt: new Date(Date.now() + (retryable ? retryDelayMs : 0)),
      finishedAt: retryable ? null : new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: errorText(params.error),
    },
  });
}

/** 서버 재시작으로 잠긴 작업을 다시 대기열에 넣는다. */
export async function recoverStaleAnalysisJobs() {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  const retryable = await prisma.analysisJob.updateMany({
    where: {
      status: AnalysisJobStatus.RUNNING,
      lockedAt: { lte: cutoff },
      attempts: { lt: ANALYSIS_JOB_MAX_ATTEMPTS },
    },
    data: {
      status: AnalysisJobStatus.QUEUED,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: "Worker가 재시작되어 작업을 다시 대기열에 넣었습니다.",
    },
  });
  const exhausted = await prisma.analysisJob.updateMany({
    where: {
      status: AnalysisJobStatus.RUNNING,
      lockedAt: { lte: cutoff },
      attempts: { gte: ANALYSIS_JOB_MAX_ATTEMPTS },
    },
    data: {
      status: AnalysisJobStatus.FAILED,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: "최대 재시도 횟수 이후 Worker가 응답하지 않았습니다.",
    },
  });
  return { retryable: retryable.count, exhausted: exhausted.count };
}
