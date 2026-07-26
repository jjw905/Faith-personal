import { rmSync } from "node:fs";

import { chunkedTranscribeBuffer } from "@/lib/stt/chunked-transcribe";
import { buildSemanticStructure } from "@/lib/stt/semantic-structure";
import { buildMeetingFromStt } from "@/lib/stt/to-meeting";
import { alignDialogueToTimedSegments } from "@/lib/stt/timed-segments";
import type { SttModel } from "@/lib/stt/models";
import { appendAiUsage } from "@/lib/stt/usage-store";
import { readUserFileBytes } from "@/lib/storage/vault-service";
import {
  getUserMeeting,
  setMeetingProgress,
  updateUserMeeting,
  workDirForMeeting,
} from "@/lib/user-meetings-store";
import { prisma } from "@/lib/prisma";

/**
 * 전체 파이프라인 진행률 구간 (실제 작업량 비중).
 * STT(청크 API)가 대부분, 구조화·정렬·조립이 후반.
 */
const PROGRESS = {
  start: 1,
  fileLoaded: 4,
  /** STT fraction 0→1 을 이 구간에 매핑 */
  sttStart: 4,
  sttEnd: 72,
  structureStart: 72,
  structureDone: 90,
  aligned: 95,
  built: 98,
  done: 100,
} as const;

function mapSttFraction(fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return PROGRESS.sttStart + f * (PROGRESS.sttEnd - PROGRESS.sttStart);
}

export async function processUploadedMeeting(params: {
  meetingId: string;
  userId: string;
  vaultFileId: string;
  model: SttModel;
  title: string;
}) {
  const workDir = workDirForMeeting(params.meetingId);
  const progress = (
    percent: number,
    patch?: Parameters<typeof setMeetingProgress>[2],
  ) => {
    setMeetingProgress(params.meetingId, percent, patch);
  };

  try {
    progress(PROGRESS.start, { phase: "transcribing" });

    const file = await readUserFileBytes(params.userId, params.vaultFileId);
    if (!file) {
      throw new Error("보관함 파일을 찾을 수 없습니다.");
    }
    progress(PROGRESS.fileLoaded);

    const stt = await chunkedTranscribeBuffer({
      audioBytes: file.body,
      filename: file.row.name,
      workDir,
      model: params.model,
      onProgress: (p) => {
        progress(mapSttFraction(p.fraction));
      },
    });

    if (!stt.text.trim()) {
      throw new Error("전사 결과가 비어 있습니다.");
    }

    appendAiUsage({
      meetingId: params.meetingId,
      userId: params.userId,
      title: params.title,
      stage: "stt",
      model: params.model,
      durationSec: stt.durationSec,
      chunkCount: stt.chunkCount,
      inputTokens: stt.usage.inputTokens,
      outputTokens: stt.usage.outputTokens,
      totalTokens: stt.usage.totalTokens,
      estimatedUsd: stt.usage.estimatedUsd,
      billSource: stt.usage.billSource,
    });

    progress(PROGRESS.structureStart, {
      phase: "structuring",
      rawText: stt.text,
    });

    const { structure, usage: structureUsage } = await buildSemanticStructure(
      stt.text,
      stt.durationSec,
    );
    progress(PROGRESS.structureDone);

    structure.dialogue = alignDialogueToTimedSegments(
      structure.dialogue,
      stt.timedSegments,
      stt.durationSec,
    );
    progress(PROGRESS.aligned);

    if (structure.dialogue.length === 0) {
      throw new Error("대화기록 생성에 실패했습니다.");
    }

    appendAiUsage({
      meetingId: params.meetingId,
      userId: params.userId,
      title: params.title,
      stage: "structure",
      model: structureUsage.model,
      durationSec: stt.durationSec,
      inputTokens: structureUsage.inputTokens,
      outputTokens: structureUsage.outputTokens,
      totalTokens: structureUsage.totalTokens,
      estimatedUsd: structureUsage.estimatedUsd,
      billSource: "tokens",
    });

    const existing = getUserMeeting(params.meetingId);
    const meetingDate =
      existing?.meeting.date?.trim() ||
      existing?.createdAt ||
      new Date().toISOString();

    const built = buildMeetingFromStt({
      meetingId: params.meetingId,
      title: params.title,
      durationSec: stt.durationSec,
      rawText: stt.text,
      semantic: structure,
      timedSegments: stt.timedSegments,
      date: meetingDate,
      workspace: existing?.workspace,
      capture: existing?.meeting.capture ?? "upload",
    });
    progress(PROGRESS.built);

    updateUserMeeting(params.meetingId, {
      phase: "done",
      progressPercent: PROGRESS.done,
      meeting: built.meeting,
      transcript: built.transcript,
      timeline: built.timeline,
      rawText: stt.text,
      semantic: structure,
      errorMessage: undefined,
    });
    await prisma.teamMeeting.updateMany({
      where: { legacyMeetingId: params.meetingId },
      data: { state: "READY" },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "회의 정리에 실패했습니다.";
    const cur = getUserMeeting(params.meetingId);
    updateUserMeeting(params.meetingId, {
      phase: "error",
      errorMessage: message,
      ...(cur
        ? {
            meeting: {
              ...cur.meeting,
              status: "completed" as const,
              tags: [],
              summaryTags: [],
            },
            timeline: {
              ...cur.timeline,
              overallSummary: message,
              segments: [],
            },
          }
        : {}),
    });
    await prisma.teamMeeting.updateMany({
      where: { legacyMeetingId: params.meetingId },
      data: { state: "FAILED" },
    });
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  }
}
