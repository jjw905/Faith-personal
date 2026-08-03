import { AnalysisJobStatus, AnalysisMode, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type { AnalysisMode as ProductAnalysisMode } from "@/lib/stt/analysis-mode";

export const ANALYSIS_JOB_MAX_ATTEMPTS = 3;

export class AnalysisJobCanceledError extends Error {
  constructor(message = "사용자가 분석을 취소했습니다.") {
    super(message);
    this.name = "AnalysisJobCanceledError";
  }
}

/**
 * 심장박동이 이만큼 끊기면 Worker가 죽은 것으로 본다.
 *
 * 예전에는 6시간이었다. 배포 재시작으로 작업이 끊기면 이용자 화면은 여섯
 * 시간 동안 "처리 중"에 멈춰 있었다. 실행 중에는 30초마다 lockedAt을 새로
 * 찍으므로, 3분이면 살아 있는 긴 작업을 뺏지 않으면서 죽은 작업만 걷어낸다.
 */
const STALE_JOB_MS = 3 * 60 * 1000;
export const ANALYSIS_JOB_HEARTBEAT_MS = 30 * 1000;

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
        cancelRequestedAt: null,
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
 *
 * 한 사람의 작업은 한 번에 하나만 돌린다. 여러 개를 한꺼번에 올려도 올린
 * 순서대로 끝난다. 한 사람이 큐를 다 차지해 다른 사람이 밀리는 것도 막는다.
 */
export async function claimNextAnalysisJob(workerId: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const now = new Date();
    try {
      return await prisma.$transaction(
        async (tx) => {
          const busy = await tx.analysisJob.findMany({
            where: { status: AnalysisJobStatus.RUNNING },
            select: { userId: true },
            distinct: ["userId"],
          });
          const candidate = await tx.analysisJob.findFirst({
            where: {
              status: AnalysisJobStatus.QUEUED,
              availableAt: { lte: now },
              ...(busy.length > 0
                ? { userId: { notIn: busy.map((job) => job.userId) } }
                : {}),
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
              cancelRequestedAt: null,
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

/**
 * 아직 살아 있다고 알린다. 이걸 멈추면 STALE_JOB_MS 뒤에 다른 Worker가
 * 같은 작업을 다시 집는다.
 */
export async function heartbeatAnalysisJob(params: {
  id: string;
  workerId: string;
}) {
  return prisma.analysisJob.updateMany({
    where: {
      id: params.id,
      status: AnalysisJobStatus.RUNNING,
      lockedBy: params.workerId,
    },
    data: { lockedAt: new Date() },
  });
}

export async function analysisJobForMeeting(meetingId: string) {
  return prisma.analysisJob.findUnique({ where: { meetingId } });
}

export async function isAnalysisCancellationRequested(params: {
  id: string;
  workerId: string;
}) {
  const job = await prisma.analysisJob.findFirst({
    where: {
      id: params.id,
      status: AnalysisJobStatus.RUNNING,
      lockedBy: params.workerId,
    },
    select: { cancelRequestedAt: true },
  });
  return Boolean(job?.cancelRequestedAt);
}

/**
 * 대기 작업은 즉시 취소하고, 실행 작업은 Worker가 현재 네트워크 호출을
 * 중단하도록 표시한다. 다른 사용자의 회의는 갱신하지 않는다.
 */
export async function requestAnalysisCancellation(params: {
  meetingId: string;
  userId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const job = await tx.analysisJob.findFirst({
      where: { meetingId: params.meetingId, userId: params.userId },
    });
    if (!job) return null;
    if (
      job.status === AnalysisJobStatus.SUCCEEDED ||
      job.status === AnalysisJobStatus.FAILED ||
      job.status === AnalysisJobStatus.CANCELED
    ) {
      return job;
    }
    const now = new Date();
    return tx.analysisJob.update({
      where: { id: job.id },
      data:
        job.status === AnalysisJobStatus.QUEUED
          ? {
              status: AnalysisJobStatus.CANCELED,
              cancelRequestedAt: now,
              finishedAt: now,
              lockedAt: null,
              lockedBy: null,
              lastError: "사용자가 시작 전에 분석을 취소했습니다.",
            }
          : { cancelRequestedAt: now },
    });
  });
}

export async function cancelAnalysisJob(params: {
  id: string;
  workerId: string;
  error?: unknown;
}) {
  return prisma.analysisJob.updateMany({
    where: {
      id: params.id,
      status: AnalysisJobStatus.RUNNING,
      lockedBy: params.workerId,
    },
    data: {
      status: AnalysisJobStatus.CANCELED,
      cancelRequestedAt: new Date(),
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: errorText(
        params.error ?? new AnalysisJobCanceledError(),
      ),
    },
  });
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
  const canceled = await prisma.analysisJob.updateMany({
    where: {
      status: AnalysisJobStatus.RUNNING,
      lockedAt: { lte: cutoff },
      cancelRequestedAt: { not: null },
    },
    data: {
      status: AnalysisJobStatus.CANCELED,
      finishedAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: "사용자 취소 요청을 확인했습니다.",
    },
  });
  const retryable = await prisma.analysisJob.updateMany({
    where: {
      status: AnalysisJobStatus.RUNNING,
      lockedAt: { lte: cutoff },
      cancelRequestedAt: null,
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
      cancelRequestedAt: null,
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
  return {
    canceled: canceled.count,
    retryable: retryable.count,
    exhausted: exhausted.count,
  };
}
