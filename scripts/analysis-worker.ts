import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import type { AnalysisJob } from "@prisma/client";

config({ path: ".env.local" });
config();

const { prisma } = await import("../src/lib/prisma");
const {
  claimNextAnalysisJob,
  completeAnalysisJob,
  failAnalysisJob,
  recoverStaleAnalysisJobs,
} = await import("../src/lib/stt/analysis-job-queue");
const { processUploadedMeeting } = await import("../src/lib/stt/process-upload");
const { getUserMeeting } = await import("../src/lib/user-meetings-store");

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
    await failAnalysisJob({
      id: job.id,
      workerId,
      attempts: job.attempts,
      error,
    });
    console.error(`[analysis-worker:${workerId}] 예외 meeting=${job.meetingId}`, error);
  }
}

async function main() {
  const recovered = await recoverStaleAnalysisJobs();
  if (recovered.retryable || recovered.exhausted) {
    console.log(
      `[analysis-worker:${workerId}] stale 복구 queued=${recovered.retryable} failed=${recovered.exhausted}`,
    );
  }

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
    await prisma.$disconnect();
  });
