import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import type { AnalysisJob } from "@prisma/client";

config({ path: ".env.local" });
config();

type PrismaModule = typeof import("../src/lib/prisma");
type QueueModule = typeof import("../src/lib/stt/analysis-job-queue");
type ProcessModule = typeof import("../src/lib/stt/process-upload");
type MeetingStoreModule = typeof import("../src/lib/user-meetings-store");

let prisma: PrismaModule["prisma"];
let ANALYSIS_JOB_HEARTBEAT_MS: QueueModule["ANALYSIS_JOB_HEARTBEAT_MS"];
let AnalysisJobCanceledError: QueueModule["AnalysisJobCanceledError"];
let cancelAnalysisJob: QueueModule["cancelAnalysisJob"];
let claimNextAnalysisJob: QueueModule["claimNextAnalysisJob"];
let completeAnalysisJob: QueueModule["completeAnalysisJob"];
let failAnalysisJob: QueueModule["failAnalysisJob"];
let heartbeatAnalysisJob: QueueModule["heartbeatAnalysisJob"];
let isAnalysisCancellationRequested: QueueModule["isAnalysisCancellationRequested"];
let recoverStaleAnalysisJobs: QueueModule["recoverStaleAnalysisJobs"];
let processUploadedMeeting: ProcessModule["processUploadedMeeting"];
let getUserMeeting: MeetingStoreModule["getUserMeeting"];

/** dotenv 적용 후 서버 전용 모듈을 읽되, CommonJS에서도 최상위 await를 만들지 않는다. */
async function loadDependencies() {
  const [prismaModule, queueModule, processModule, meetingStoreModule] =
    await Promise.all([
      import("../src/lib/prisma"),
      import("../src/lib/stt/analysis-job-queue"),
      import("../src/lib/stt/process-upload"),
      import("../src/lib/user-meetings-store"),
    ]);
  prisma = prismaModule.prisma;
  ANALYSIS_JOB_HEARTBEAT_MS = queueModule.ANALYSIS_JOB_HEARTBEAT_MS;
  AnalysisJobCanceledError = queueModule.AnalysisJobCanceledError;
  cancelAnalysisJob = queueModule.cancelAnalysisJob;
  claimNextAnalysisJob = queueModule.claimNextAnalysisJob;
  completeAnalysisJob = queueModule.completeAnalysisJob;
  failAnalysisJob = queueModule.failAnalysisJob;
  heartbeatAnalysisJob = queueModule.heartbeatAnalysisJob;
  isAnalysisCancellationRequested = queueModule.isAnalysisCancellationRequested;
  recoverStaleAnalysisJobs = queueModule.recoverStaleAnalysisJobs;
  processUploadedMeeting = processModule.processUploadedMeeting;
  getUserMeeting = meetingStoreModule.getUserMeeting;
}

const workerPrefix =
  process.env.ANALYSIS_WORKER_ID?.trim() || "analysis-worker";
// A pool revision can briefly overlap with its predecessor. The lock owner
// must therefore be unique per process, not just per configured worker slot.
const workerId = `${workerPrefix}-${process.pid}-${randomUUID().slice(0, 8)}`;
const pollMs = Math.max(
  250,
  Number(process.env.ANALYSIS_WORKER_POLL_MS ?? 1_000),
);

let stopping = false;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPermanentUserError(message: string) {
  return /분석 가능 시간|무료 분석 시간|검열|차단/.test(message);
}

async function runJob(job: AnalysisJob) {
  const analysisMode =
    job.analysisMode === "PRECISION" ? ("precision" as const) : ("standard" as const);

  // 처리 도중에도 살아 있다고 계속 알린다. 멈추면 다른 Worker가 이어받는다.
  const heartbeat = setInterval(() => {
    void heartbeatAnalysisJob({ id: job.id, workerId }).catch((error) => {
      console.warn(`[analysis-worker:${workerId}] 심장박동 실패`, error);
    });
  }, ANALYSIS_JOB_HEARTBEAT_MS);
  const controller = new AbortController();
  let checkingCancellation = false;
  const checkCancellation = async () => {
    if (checkingCancellation || controller.signal.aborted) return;
    checkingCancellation = true;
    try {
      if (await isAnalysisCancellationRequested({ id: job.id, workerId })) {
        controller.abort(new AnalysisJobCanceledError());
      }
    } finally {
      checkingCancellation = false;
    }
  };
  await checkCancellation();
  const cancellationPoll = setInterval(() => {
    void checkCancellation().catch((error) => {
      console.warn(`[analysis-worker:${workerId}] 취소 상태 확인 실패`, error);
    });
  }, 1_000);

  try {
    console.log(
      `[analysis-worker:${workerId}] 시작 meeting=${job.meetingId} attempt=${job.attempts}`,
    );
    await processUploadedMeeting({
      meetingId: job.meetingId,
      userId: job.userId,
      vaultFileId: job.vaultFileId,
      analysisMode,
      title: job.title,
      bypassModeration: job.bypassModeration,
      signal: controller.signal,
    });

    const record = await getUserMeeting(job.meetingId);
    if (record?.phase === "done") {
      await completeAnalysisJob({ id: job.id, workerId });
      console.log(`[analysis-worker:${workerId}] 완료 meeting=${job.meetingId}`);
      return;
    }

    const message =
      record?.errorMessage ?? "분석 결과가 완료 상태로 저장되지 않았습니다.";
    await failAnalysisJob({
      id: job.id,
      workerId,
      attempts: job.attempts,
      error: message,
      retryable: !isPermanentUserError(message),
    });
    console.error(`[analysis-worker:${workerId}] 실패 meeting=${job.meetingId}: ${message}`);
  } catch (error) {
    if (
      controller.signal.aborted ||
      error instanceof AnalysisJobCanceledError ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      await cancelAnalysisJob({ id: job.id, workerId, error });
      console.log(`[analysis-worker:${workerId}] 취소 meeting=${job.meetingId}`);
      return;
    }
    await failAnalysisJob({
      id: job.id,
      workerId,
      attempts: job.attempts,
      error,
    });
    console.error(`[analysis-worker:${workerId}] 예외 meeting=${job.meetingId}`, error);
  } finally {
    clearInterval(heartbeat);
    clearInterval(cancellationPoll);
  }
}

async function recover() {
  const recovered = await recoverStaleAnalysisJobs();
  if (recovered.canceled || recovered.retryable || recovered.exhausted) {
    console.log(
      `[analysis-worker:${workerId}] stale 복구 canceled=${recovered.canceled} queued=${recovered.retryable} failed=${recovered.exhausted}`,
    );
  }
}

async function main() {
  await loadDependencies();
  await recover();
  // 시작할 때 한 번만 보면, 이 Worker가 도는 동안 죽은 다른 Worker의 작업이
  // 영영 방치된다. 주기적으로 다시 확인한다.
  const sweeper = setInterval(() => {
    void recover().catch((error) => {
      console.warn(`[analysis-worker:${workerId}] stale 복구 실패`, error);
    });
  }, ANALYSIS_JOB_HEARTBEAT_MS * 2);
  sweeper.unref?.();

  while (!stopping) {
    try {
      const job = await claimNextAnalysisJob(workerId);
      if (job) {
        await runJob(job);
      } else {
        await sleep(pollMs);
      }
    } catch (error) {
      console.error(`[analysis-worker:${workerId}] polling 오류`, error);
      await sleep(Math.max(pollMs, 2_000));
    }
  }
  clearInterval(sweeper);
}

function requestStop(signal: string) {
  console.log(`[analysis-worker:${workerId}] ${signal} 수신, 현재 작업 후 종료`);
  stopping = true;
}

process.on("SIGINT", () => requestStop("SIGINT"));
process.on("SIGTERM", () => requestStop("SIGTERM"));

main()
  .catch((error) => {
    console.error(`[analysis-worker:${workerId}] 치명적 오류`, error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
