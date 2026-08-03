import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { prisma } = await import("../src/lib/prisma");
  const {
    cancelAnalysisJob,
    claimNextAnalysisJob,
    enqueueAnalysisJob,
    requestAnalysisCancellation,
  } = await import("../src/lib/stt/analysis-job-queue");
  const token = randomUUID().slice(0, 10);
  const user = await prisma.user.create({
    data: { email: `analysis-lifecycle-${token}@example.invalid` },
  });
  try {
    const queuedMeetingId = `analysis-queued-${token}`;
    await enqueueAnalysisJob({
      meetingId: queuedMeetingId,
      userId: user.id,
      vaultFileId: `vault-${token}`,
      title: "queued cancel test",
    });
    const queuedCanceled = await requestAnalysisCancellation({
      meetingId: queuedMeetingId,
      userId: user.id,
    });
    if (queuedCanceled?.status !== "CANCELED") {
      throw new Error("대기 작업이 즉시 CANCELED로 전환되지 않았습니다.");
    }

    const runningMeetingId = `analysis-running-${token}`;
    await enqueueAnalysisJob({
      meetingId: runningMeetingId,
      userId: user.id,
      vaultFileId: `vault-${token}`,
      title: "running cancel test",
    });
    const workerId = `test-worker-${token}`;
    const running = await claimNextAnalysisJob(workerId);
    if (!running || running.meetingId !== runningMeetingId) {
      throw new Error("실행 작업을 선점하지 못했습니다.");
    }
    const requested = await requestAnalysisCancellation({
      meetingId: runningMeetingId,
      userId: user.id,
    });
    if (requested?.status !== "RUNNING" || !requested.cancelRequestedAt) {
      throw new Error("실행 작업의 협력적 취소 표시가 저장되지 않았습니다.");
    }
    await cancelAnalysisJob({ id: running.id, workerId });
    const final = await prisma.analysisJob.findUnique({
      where: { id: running.id },
    });
    if (final?.status !== "CANCELED" || final.lockedBy !== null) {
      throw new Error("실행 취소 작업이 잠금을 해제하지 않았습니다.");
    }

    console.log(
      JSON.stringify({
        ok: true,
        queued: queuedCanceled.status,
        running: final.status,
      }),
    );
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
