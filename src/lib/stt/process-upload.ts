import { rmSync } from "node:fs";
import { join } from "node:path";

import {
  chunkedTranscribe,
  probeDurationSec,
  writeSourceAudio,
} from "@/lib/stt/chunked-transcribe";
import {
  diarizationAvailability,
  diarizeAudio,
  type DiarizationResult,
} from "@/lib/stt/diarization";
import { buildGlossary } from "@/lib/stt/glossary";
import { hasAudioTools } from "@/lib/stt/local-tools";
import {
  attachSpeakersToText,
  formatSpeakerBlocks,
} from "@/lib/stt/speaker-attach";
import { buildSemanticStructure } from "@/lib/stt/semantic-structure";
import {
  applySpeakerNames,
  identifySpeakerNames,
} from "@/lib/stt/speaker-names";
import {
  attachCorrections,
  suggestTermCorrections,
} from "@/lib/stt/term-suggest";
import { buildMeetingFromStt } from "@/lib/stt/to-meeting";
import { alignDialogueToTimedSegments } from "@/lib/stt/timed-segments";
import type { SttModel } from "@/lib/stt/models";
import { assertUploadAudioDuration } from "@/lib/stt/upload-limits";
import { appendAiUsage } from "@/lib/stt/usage-store";
import { readUserFileBytes } from "@/lib/storage/vault-service";
import {
  getUserMeeting,
  setMeetingProgress,
  updateUserMeeting,
  workDirForMeeting,
} from "@/lib/user-meetings-store";
import { createNotification } from "@/lib/notifications-store";
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

function analysisGroupKey(meetingId: string) {
  return `analysis:${meetingId}`;
}

async function notifyAnalysisResult(params: {
  userId: string;
  meetingId: string;
  title: string;
  kind: "analysis_done" | "analysis_failed";
  errorMessage?: string;
}) {
  const groupKey = analysisGroupKey(params.meetingId);
  try {
    await prisma.notification.updateMany({
      where: {
        userId: params.userId,
        groupKey,
        dismissedAt: null,
      },
      data: { dismissedAt: new Date() },
    });
    await createNotification({
      userId: params.userId,
      type: "storage",
      kind: params.kind,
      title:
        params.kind === "analysis_done"
          ? "회의 분석이 완료되었습니다"
          : "회의 분석에 실패했습니다",
      body: params.title,
      meetingId: params.meetingId,
      data: {
        meetingId: params.meetingId,
        ...(params.errorMessage
          ? { errorMessage: params.errorMessage }
          : {}),
      },
      groupKey,
    });
  } catch (err) {
    console.warn("[stt] 분석 알림 생성 실패", err);
  }
}

function mapSttFraction(fraction: number): number {
  const f = Math.max(0, Math.min(1, fraction));
  return PROGRESS.sttStart + f * (PROGRESS.sttEnd - PROGRESS.sttStart);
}

/**
 * 화자분리는 있으면 쓰고 없으면 넘어간다. 회의를 실패시키지 않는다.
 *
 * 배포 서버에는 파이썬도 모델도 없으니 부르기 전에 확인해서 건너뛴다. 화자
 * 자리는 구조화 모델이 정한 이름이나 "발화" 라벨로 남는다.
 */
async function diarizeUpload(
  audioPath: string,
): Promise<DiarizationResult | null> {
  const available = diarizationAvailability();
  if (!available.ok) {
    console.warn(`[stt] 화자분리 없이 진행: ${available.reason}`);
    return null;
  }
  try {
    return await diarizeAudio({ audioPath });
  } catch (err) {
    console.warn("[stt] 화자분리 건너뜀", err);
    return null;
  }
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

    const audioPath = writeSourceAudio({
      audioBytes: file.body,
      filename: file.row.name,
      workDir,
    });

    // ffprobe로 길이를 알 수 있을 때만 1시간 한도. 없으면 파일 크기 한도만.
    if (hasAudioTools()) {
      assertUploadAudioDuration(probeDurationSec(audioPath));
    }

    // 고유명사는 소리만으로 못 가린다. 참석자와 지난 회의에서 모아 미리 알려 준다.
    const glossary = buildGlossary({
      userId: params.userId,
      title: params.title,
      participantNames: (
        getUserMeeting(params.meetingId)?.meeting.participants ?? []
      ).map((p) => p.name),
    });

    // 화자분리는 로컬 CPU라 API 전사와 같이 돌린다. 실패해도 전사는 살린다.
    const [stt, diarization] = await Promise.all([
      chunkedTranscribe({
        audioPath,
        workDir: join(workDir, "chunks"),
        model: params.model,
        glossary,
        onProgress: (p) => {
          progress(mapSttFraction(p.fraction));
        },
      }),
      diarizeUpload(audioPath),
    ]);

    if (!stt.text.trim()) {
      console.error("[stt] 전사 텍스트가 비어 있음", {
        meetingId: params.meetingId,
        model: params.model,
      });
      throw new Error("전사 결과가 비어 있습니다. 다른 파일로 다시 시도해 주세요.");
    }
    if (!stt.timedSegments.length) {
      console.error("[stt] 실측 시각(타이밍) 구간이 비어 있음", {
        meetingId: params.meetingId,
        model: params.model,
        textLength: stt.text.length,
      });
      throw new Error(
        "실측 시각(타이밍)이 비어 있습니다. 싱크를 맞출 수 없어 중단합니다.",
      );
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

    // 화자를 붙여서 넘긴다. 구조화 모델이 대화기록을 나눌 때 누가 말했는지
    // 같이 판단해야 타임라인 화자와 화자별 발언이 채워진다.
    const blocks = diarization
      ? attachSpeakersToText({
          text: stt.text,
          timedSegments: stt.timedSegments,
          diarization,
          durationSec: stt.durationSec,
        })
      : [];
    const structureInput =
      blocks.length > 0 ? formatSpeakerBlocks(blocks) : stt.text;

    const { structure, usage: structureUsage } = await buildSemanticStructure(
      structureInput,
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

    // 화자 실명 추정. 근거가 약하면 화자 A 라벨을 그대로 둔다.
    const confirmedNames: string[] = [];
    try {
      const named = await identifySpeakerNames({ dialogue: structure.dialogue });
      applySpeakerNames(structure, named.guesses);
      confirmedNames.push(...named.guesses.map((g) => g.name));
      if (named.usage.inputTokens > 0) {
        appendAiUsage({
          meetingId: params.meetingId,
          userId: params.userId,
          title: params.title,
          stage: "structure",
          model: named.usage.model,
          durationSec: stt.durationSec,
          inputTokens: named.usage.inputTokens,
          outputTokens: named.usage.outputTokens,
          totalTokens: named.usage.inputTokens + named.usage.outputTokens,
          estimatedUsd: named.usage.estimatedUsd,
          billSource: "tokens",
        });
      }
    } catch (err) {
      console.warn("[stt] 화자 실명 추정 실패", err);
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

    // 오인식 보정 추천. 표시만 하고 본문은 그대로 둔다. 실패해도 회의는 완료.
    try {
      const suggested = await suggestTermCorrections(
        built.transcript.lines.map((line) => line.text ?? ""),
        { keepTerms: confirmedNames },
      );
      built.transcript.lines = attachCorrections(
        built.transcript.lines,
        suggested.suggestions,
      );
      if (suggested.usage.inputTokens > 0) {
        appendAiUsage({
          meetingId: params.meetingId,
          userId: params.userId,
          title: params.title,
          stage: "structure",
          model: suggested.usage.model,
          durationSec: stt.durationSec,
          inputTokens: suggested.usage.inputTokens,
          outputTokens: suggested.usage.outputTokens,
          totalTokens:
            suggested.usage.inputTokens + suggested.usage.outputTokens,
          estimatedUsd: suggested.usage.estimatedUsd,
          billSource: "tokens",
        });
      }
    } catch (err) {
      console.warn("[stt] 보정 추천 실패", err);
    }

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
    await notifyAnalysisResult({
      userId: params.userId,
      meetingId: params.meetingId,
      title: params.title,
      kind: "analysis_done",
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
    await notifyAnalysisResult({
      userId: params.userId,
      meetingId: params.meetingId,
      title: params.title,
      kind: "analysis_failed",
      errorMessage: message,
    });
  } finally {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  }
}
