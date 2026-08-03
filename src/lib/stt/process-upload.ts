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
  isMediaOutletTerm,
  MEDIA_OUTLET_TERMS,
} from "@/lib/stt/media-outlets";
import {
  attachSpeakersToText,
  attachSpeakersToWordTimings,
  formatSpeakerBlocks,
} from "@/lib/stt/speaker-attach";
import { reconcileSpeakerTurns } from "@/lib/stt/speaker-turns";
import { buildSemanticStructure } from "@/lib/stt/semantic-structure";
import type { TopicBucket } from "@/lib/stt/semantic-structure";
import {
  applySpeakerNames,
  identifySpeakerNames,
} from "@/lib/stt/speaker-names";
import {
  applyFixedSpellings,
  attachCorrections,
  suggestTermCorrections,
} from "@/lib/stt/term-suggest";
import {
  checkTranscriptModeration,
  logModerationFlag,
} from "@/lib/stt/content-moderation";
import { buildMeetingFromStt } from "@/lib/stt/to-meeting";
import { formatDurationLabel } from "@/lib/diarize-meeting";
import {
  alignDialogueToTimedSegments,
  alignDialogueToWordTimings,
} from "@/lib/stt/timed-segments";
import { runSelectiveSecondPass } from "@/lib/stt/second-pass-review";
import { reconcileTranscriptVariants } from "@/lib/stt/transcript-reconcile";
import { activeLineIndexAt, lineStartSec } from "@/lib/transcript-time";
import {
  ANALYSIS_MODE_POLICY,
  DEFAULT_ANALYSIS_MODE,
  type AnalysisMode,
} from "@/lib/stt/analysis-mode";
import { assertUploadAudioDuration } from "@/lib/stt/upload-limits";
import {
  assertUploadQuota,
  UploadQuotaExceededError,
  type QuotaReservation,
} from "@/lib/stt/usage-quota";
import { estimateSttUsdFromMinutes } from "@/lib/stt/pricing";
import { appendAiUsage } from "@/lib/stt/usage-store";
import { readUserFileBytes } from "@/lib/storage/vault-service";
import {
  getUserMeeting,
  setMeetingProgress,
  updateUserMeeting,
  workDirForMeeting,
} from "@/lib/user-meetings-store";
import { createNotification } from "@/lib/notifications-store";
import { structureProgressPercent, softElapsedProgress } from "@/lib/meeting-process-progress";
import { prisma } from "@/lib/prisma";
import {
  appendPipelineAttempt,
  type PipelineFailedStage,
} from "@/lib/stt/pipeline-stats-store";
import { AnalysisJobCanceledError } from "@/lib/stt/analysis-job-queue";
import { buildEvidenceDialogue } from "@/lib/stt/transcript-evidence";
import { userFacingAnalysisError } from "@/lib/meeting-process";

/**
 * 전체 파이프라인 진행률 구간 (실제 작업량 비중).
 * STT(청크 API)가 대부분, 구조화·정렬·조립이 후반.
 */
const PROGRESS = {
  /** 화면에서 분석이 시작되었음을 바로 보여 주되, 0%에 멈추지 않는다. */
  start: 1,
  fileLoaded: 2,
  /** STT fraction 0→1 을 이 구간에 매핑 */
  sttStart: 1,
  sttEnd: 72,
  structureStart: 72,
  /** 전사 대조가 끝나는 지점. 이어서 화자묶음이 쓴다. */
  postSttMid: 78,
  /** STT 직후 전사 대조·화자묶음이 쓰는 소프트 상한 (구조화 전에 72 고정 방지) */
  postSttSoftEnd: 82,
  structureDone: 90,
  aligned: 95,
  built: 98,
  done: 100,
} as const;

/**
 * 단계에 걸리는 시간 어림. 오디오가 길수록 오래 걸리므로 길이에 비례해 잡는다.
 *
 * 고정값을 쓰면 짧은 회의에서는 막대가 먼저 도착해 멈춰 있고, 긴 회의에서는
 * 한참 전에 상한에 붙어 버린다. 이용자가 본 "70%대에서 정체"가 이 경우다.
 */
function expectedStageMs(
  durationSec: number,
  ratio: number,
  floorMs: number,
): number {
  const safe = Number.isFinite(durationSec) ? Math.max(0, durationSec) : 0;
  return Math.max(floorMs, safe * ratio * 1_000);
}

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
        href: `/meetings/${params.meetingId}`,
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

function mapSttFraction(
  fraction: number,
  step?: "probe" | "prepare" | "transcribe" | "timing" | "done",
): number {
  // chunkedTranscribe가 준비 단계에서 0.08을 보고하던 값을 그대로
  // 선형 변환하면 첫 화면이 9%로 점프한다. 준비 중에는 의도적으로 1%에
  // 머물고, 실제 전사/시간 측정이 끝난 뒤부터만 분석 구간을 채운다.
  if (step === "probe" || step === "prepare" || fraction <= 0.08) {
    return PROGRESS.start;
  }
  const f = Math.max(0, Math.min(1, (fraction - 0.08) / 0.92));
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
  enabled: boolean,
): Promise<DiarizationResult | null> {
  if (!enabled) return null;
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
  analysisMode?: AnalysisMode;
  title: string;
  /**
   * 개인정보보호법 제37조의2(자동화된 결정에 대한 정보주체의 권리) 대응.
   * 이용자가 검열 차단에 이의를 제기하면, 사람이 회의 본문을 읽지 않고도
   * "자동 차단을 적용하지 않는" 인적 개입 재처리를 할 수 있어야 한다.
   * 이 값은 반드시 이용자 본인의 이의제기를 받은 운영자 조치로만 true가
   * 되어야 하며, 회의 처리 자체는 여전히 자동(모델 파이프라인)으로 끝난다.
   */
  bypassModeration?: boolean;
  /** Worker 취소 요청. 이미 시작한 유료 호출에도 전달해 가능한 즉시 중단한다. */
  signal?: AbortSignal;
}) {
  const analysisMode = params.analysisMode ?? DEFAULT_ANALYSIS_MODE;
  const policy = ANALYSIS_MODE_POLICY[analysisMode];
  // 분석 모드가 모델·고비용 단계를 서버에서 고정한다. 저장된 model 값이나
  // 재처리 요청이 어긋나더라도 차감 정책과 실제 실행 경로가 달라지지 않는다.
  const model = policy.model;
  const speakerSplitEnabled = policy.speakerSplit;
  const workDir = workDirForMeeting(params.meetingId);
  let progressQueue: Promise<unknown> = Promise.resolve();
  const progress = (
    percent: number,
    patch?: Parameters<typeof setMeetingProgress>[2],
  ) => {
    progressQueue = progressQueue
      .then(() => setMeetingProgress(params.meetingId, percent, patch))
      .catch((error) => {
        console.warn("[stt] 진행 상태 저장 실패", error);
      });
    return progressQueue;
  };

  /**
   * fraction이 없는 긴 단계. 하트비트로 72에 멈춰 보이지 않게 한다.
   * 실제 작업이 더 짧으면 finally에서 to 직전으로 한 번 올린다.
   */
  async function withSoftProgress<T>(opts: {
    from: number;
    to: number;
    expectedMs: number;
    stageLabel: string;
    phase?: "transcribing" | "structuring";
    run: () => Promise<T>;
  }): Promise<T> {
    const startedAt = Date.now();
    const phase = opts.phase ?? "structuring";
    const tick = () => {
      const pct = softElapsedProgress({
        from: opts.from,
        to: opts.to,
        waitedMs: Date.now() - startedAt,
        expectedMs: opts.expectedMs,
      });
      progress(pct, { phase, stageLabel: opts.stageLabel });
    };
    tick();
    const heartbeat = setInterval(tick, 1_500);
    try {
      return await opts.run();
    } finally {
      clearInterval(heartbeat);
      progress(
        softElapsedProgress({
          from: opts.from,
          to: opts.to,
          waitedMs: Math.max(Date.now() - startedAt, opts.expectedMs * 0.35),
          expectedMs: opts.expectedMs,
        }),
        { phase, stageLabel: opts.stageLabel },
      );
    }
  }

  // 실패율 통계용. 내용은 담지 않고 어느 단계에서 멈췄는지만 남긴다.
  let currentStage: PipelineFailedStage = "stt";
  let moderationBlocked = false;
  let quotaBlocked = false;
  let statsDurationSec: number | undefined;
  let statsSpeakerCount: number | undefined;
  let statsTopicBucket: TopicBucket | undefined;
  let quotaReservation: QuotaReservation | null = null;

  const throwIfCanceled = () => {
    if (!params.signal?.aborted) return;
    const reason = params.signal.reason;
    throw reason instanceof AnalysisJobCanceledError
      ? reason
      : new AnalysisJobCanceledError();
  };

  try {
    throwIfCanceled();
    progress(PROGRESS.start, {
      phase: "transcribing",
      stageLabel: "파일을 살펴보는 중이에요",
    });

    const file = await readUserFileBytes(params.userId, params.vaultFileId);
    if (!file) {
      throw new Error("보관함 파일을 찾을 수 없습니다.");
    }
    throwIfCanceled();
    progress(PROGRESS.fileLoaded, { stageLabel: "소리를 불러오는 중이에요" });

    const audioPath = writeSourceAudio({
      audioBytes: file.body,
      filename: file.row.name,
      workDir,
    });

    // ffprobe로 길이를 알 수 있을 때만 1시간 한도. 없으면 파일 크기 한도만.
    if (hasAudioTools()) {
      const durationSec = probeDurationSec(audioPath);
      assertUploadAudioDuration(durationSec);
      // 전사(비용 발생) 전에 이번 주기 쿼터를 확인한다. 오픈 준비 기간
      // 한정: 기본 월 20분, 설문 응답 시 월 60분까지.
      currentStage = "quota";
      quotaReservation = await assertUploadQuota({
        userId: params.userId,
        meetingId: params.meetingId,
        newDurationSec: durationSec,
        analysisMode,
      });
      currentStage = "stt";
      // 분석이 끝나기 전에도 실제 길이를 바로 보여준다("-" 표기 없이).
      const durationLabel = formatDurationLabel(durationSec);
      const beforeAnalysis = await getUserMeeting(params.meetingId);
      if (beforeAnalysis) {
        await updateUserMeeting(params.meetingId, {
          meeting: { ...beforeAnalysis.meeting, duration: durationLabel },
          timeline: { ...beforeAnalysis.timeline, durationLabel },
        });
      }
    }

    // 고유명사는 소리만으로 못 가린다. 참석자와 지난 회의에서 모아 미리 알려 준다.
    const glossary = await buildGlossary({
      userId: params.userId,
      title: params.title,
      participantNames: (
        (await getUserMeeting(params.meetingId))?.meeting.participants ?? []
      ).map((p) => p.name),
    });

    // 화자분리는 로컬 CPU라 API 전사와 같이 돌린다. 실패해도 전사는 살린다.
    const [stt, diarization] = await Promise.all([
      chunkedTranscribe({
        audioPath,
        workDir: join(workDir, "chunks"),
        model,
        glossary,
        wordTimestamps: policy.wordTimestamps,
        signal: params.signal,
        onProgress: (p) => {
          progress(mapSttFraction(p.fraction, p.step), {
            stageLabel: "받아쓰는 중이에요",
          });
        },
      }),
      diarizeUpload(audioPath, speakerSplitEnabled),
    ]);
    throwIfCanceled();

    if (!stt.text.trim()) {
      console.error("[stt] 전사 텍스트가 비어 있음", {
        meetingId: params.meetingId,
        model,
      });
      throw new Error("받아쓰기 결과가 비어 있습니다. 다른 파일로 다시 시도해 주세요.");
    }
    if (!stt.timedSegments.length) {
      console.error("[stt] 실측 시각(타이밍) 구간이 비어 있음", {
        meetingId: params.meetingId,
        model,
        textLength: stt.text.length,
      });
      throw new Error(
        "실측 시각(타이밍)이 비어 있습니다. 싱크를 맞출 수 없어 중단합니다.",
      );
    }
    let transcriptText = stt.text;
    const wordTimings = stt.wordTimings;

    // 기존 mini 본문은 독립 타이밍 전사와 대조해 누락을 복원한다.
    // gpt-transcribe는 KTV 검증에서 짧은 호명과 기자 자기소개를 이미 보존했고,
    // 재작성 대조가 오히려 그 자기소개를 삭제했으므로 원문을 확정 본문으로 쓴다.
    if (model !== "gpt-transcribe") {
      try {
        const reconciled = await withSoftProgress({
          from: PROGRESS.structureStart,
          to: PROGRESS.postSttMid,
          expectedMs: expectedStageMs(stt.durationSec, 0.025, 12_000),
          stageLabel: "빠진 말을 다시 확인하는 중이에요",
          run: () =>
            reconcileTranscriptVariants({
              parts: stt.parts,
              partRanges: stt.partRanges,
              timedSegments: stt.timedSegments,
            }),
        });
        transcriptText = reconciled.text;
        if (reconciled.usage.inputTokens > 0) {
          await appendAiUsage({
            meetingId: params.meetingId,
            userId: params.userId,
            title: params.title,
            stage: "structure",
            model: reconciled.usage.model,
            durationSec: stt.durationSec,
            inputTokens: reconciled.usage.inputTokens,
            outputTokens: reconciled.usage.outputTokens,
            totalTokens: reconciled.usage.totalTokens,
            estimatedUsd: reconciled.usage.estimatedUsd,
            billSource: "tokens",
          });
        }
      } catch (err) {
        console.warn("[stt] 독립 전사 대조 실패, 본전사를 유지합니다", err);
      }
    }

    await appendAiUsage({
      meetingId: params.meetingId,
      userId: params.userId,
      title: params.title,
      stage: "stt",
      model,
      durationSec: stt.durationSec,
      chunkCount: stt.chunkCount,
      inputTokens: stt.usage.inputTokens,
      outputTokens: stt.usage.outputTokens,
      totalTokens: stt.usage.totalTokens,
      estimatedUsd: stt.usage.estimatedUsd,
      billSource: stt.usage.billSource,
    });
    statsDurationSec = stt.durationSec;
    statsSpeakerCount = diarization?.speakerCount;

    currentStage = "moderation";
    throwIfCanceled();
    // 운영진은 회의 본문에 접근하지 않는다. 사람이 읽고 판단하는 대신 자동
    // 검열로 명백한 위반(아동 성적 콘텐츠·불법행위 실행 안내 등)만 업로드
    // 단계에서 차단한다. 본문은 저장하지 않고 카테고리만 남긴다.
    try {
      const moderation = await checkTranscriptModeration(transcriptText);
      await logModerationFlag({
        userId: params.userId,
        meetingId: params.meetingId,
        check: moderation,
      });
      moderationBlocked = moderation.blocked && !params.bypassModeration;
    } catch (err) {
      console.warn("[moderation] 검열 확인 실패, 처리를 계속합니다", err);
    }
    if (moderationBlocked) {
      throw new Error(
        "이 파일은 서비스 정책에 위반되는 내용이 감지되어 처리할 수 없습니다.",
      );
    }

    currentStage = "structure";
    throwIfCanceled();
    progress(PROGRESS.postSttSoftEnd, {
      phase: "structuring",
      rawText: transcriptText,
      stageLabel: "이야기의 흐름을 잡는 중이에요",
    });

    // 화자를 붙여서 넘긴다. 구조화 모델이 대화기록을 나눌 때 누가 말했는지
    // 같이 판단해야 타임라인 화자와 화자별 발언이 채워진다.
    let blocks = diarization
      ? attachSpeakersToWordTimings({
          text: transcriptText,
          wordTimings,
          timedSegments: stt.timedSegments,
          diarization,
        })
      : [];
    if (diarization && blocks.length === 0) {
      blocks = attachSpeakersToText({
        text: transcriptText,
        timedSegments: stt.timedSegments,
        diarization,
        durationSec: stt.durationSec,
        mergeAdjacent: false,
      });
    }
    let speakerBlocks = blocks;
    // 목소리로만 나눈 블록은 짧은 맞장구가 옆 화자에 붙어 잘게 쪼개진다.
    // 대화 맥락으로 같은 사람의 발언을 다시 묶으면 KTV 기준 화자 묶음
    // 정확도가 0.54에서 0.93으로 올라간다(블록 80 → 16, 약 7원, 16초).
    if (blocks.length > 0 && process.env.STT_SPEAKER_TURN_RECONCILE !== "0") {
      try {
        const reconciled = await withSoftProgress({
          from: PROGRESS.postSttMid,
          to: PROGRESS.postSttSoftEnd,
          // KTV 실측 16초. 블록 수가 많아지면 함께 는다.
          expectedMs: expectedStageMs(stt.durationSec, 0.03, 12_000),
          stageLabel: "같은 목소리를 모으는 중이에요",
          run: () => reconcileSpeakerTurns(blocks),
        });
        speakerBlocks = reconciled.blocks;
        statsSpeakerCount = new Set(
          speakerBlocks.map((block) => block.speaker),
        ).size;
        if (reconciled.usage.inputTokens > 0) {
          await appendAiUsage({
            meetingId: params.meetingId,
            userId: params.userId,
            title: params.title,
            stage: "structure",
            model: reconciled.usage.model,
            durationSec: stt.durationSec,
            inputTokens: reconciled.usage.inputTokens,
            outputTokens: reconciled.usage.outputTokens,
            totalTokens: reconciled.usage.totalTokens,
            estimatedUsd: reconciled.usage.estimatedUsd,
            billSource: "tokens",
          });
        }
      } catch (err) {
        // 음성 화자 라벨은 남아 있으므로 회의 전체를 실패시키지는 않는다.
        console.warn("[stt] 화자 일관성 모델 검토 실패, 음성 라벨 유지", err);
      }
    }
    const structureInput =
      speakerBlocks.length > 0
        ? formatSpeakerBlocks(speakerBlocks)
        : transcriptText;

    const { structure, usage: structureUsage } = await buildSemanticStructure(
      structureInput,
      stt.durationSec,
      {
        signal: params.signal,
        onProgress: ({ partIndex, partCount, attempt, depth, waitedMs }) => {
          const pct = structureProgressPercent({
            partIndex,
            partCount,
            attempt,
            depth,
            waitedMs,
            // STT 직후 소프트 진행(강제정렬·화자묶음) 뒤에서 이어진다.
            structureStart: PROGRESS.postSttSoftEnd,
            structureDone: PROGRESS.structureDone,
          });
          let stageLabel = "이야기의 흐름을 잡는 중이에요";
          if (depth > 0) {
            stageLabel = "추가 보완 중이에요";
          } else if (partCount > 1) {
            stageLabel =
              partIndex === 0
                ? "긴 회의라 나눠서 정리 중이에요"
                : "이어서 정리 중이에요";
          } else if (attempt > 1) {
            stageLabel = "한 번 더 살펴보는 중이에요";
          }
          progress(pct, { phase: "structuring", stageLabel });
        },
      },
    );
    throwIfCanceled();
    progress(PROGRESS.structureDone, {
      stageLabel: "타임라인을 그리는 중이에요",
    });
    statsTopicBucket = structure.topicBucket;
    if (statsSpeakerCount === undefined && structure.speakers.length > 0) {
      statsSpeakerCount = structure.speakers.length;
    }

    // 요약 모델은 주제와 구간만 제안한다. 화면 대화 원문은 PRIMARY STT의
    // 불변 근거에서 다시 만들고, 음향 화자/시간만 붙인다. 모델이 대본을
    // 의역하거나 누락해도 원문·단어 시간·화자 근거가 갈라지지 않는다.
    structure.dialogue = buildEvidenceDialogue({
      text: transcriptText,
      timedSegments: stt.timedSegments,
      durationSec: stt.durationSec,
      speakerBlocks,
    });
    structure.dialogue =
      wordTimings.length > 0
        ? alignDialogueToWordTimings(
            structure.dialogue,
            wordTimings,
            stt.durationSec,
          )
        : alignDialogueToTimedSegments(
            structure.dialogue,
            stt.timedSegments,
            stt.durationSec,
          );
    progress(PROGRESS.aligned, {
      stageLabel: "누가 말했는지 맞추는 중이에요",
    });

    if (structure.dialogue.length === 0) {
      throw new Error("대화기록 생성에 실패했습니다.");
    }

    // 화자 실명 추정. 근거가 약하면 화자 A 라벨을 그대로 둔다.
    const confirmedNames: string[] = [];
    try {
      const named = await identifySpeakerNames({
        dialogue: structure.dialogue,
        candidates:
          (await getUserMeeting(params.meetingId))?.meeting.participants.map(
            (participant) => participant.name,
          ) ?? [],
      });
      applySpeakerNames(structure, named.guesses);
      confirmedNames.push(...named.guesses.map((g) => g.name));
      if (named.usage.inputTokens > 0) {
        await appendAiUsage({
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

    await appendAiUsage({
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

    const existing = await getUserMeeting(params.meetingId);
    const meetingDate =
      existing?.meeting.date?.trim() ||
      existing?.createdAt ||
      new Date().toISOString();

    const built = buildMeetingFromStt({
      meetingId: params.meetingId,
      title: params.title,
      durationSec: stt.durationSec,
      rawText: transcriptText,
      semantic: structure,
      timedSegments: stt.timedSegments,
      wordTimings,
      date: meetingDate,
      workspace: existing?.workspace,
      capture: existing?.meeting.capture ?? "upload",
    });
    progress(PROGRESS.built, { stageLabel: "표현을 다듬는 중이에요" });

    // 오인식 보정. 언론사처럼 표기가 정해진 이름만 본문을 고치고, 나머지는
    // 추천으로만 붙인다. 실패해도 회의는 완료.
    try {
      const suggested = await suggestTermCorrections(
        built.transcript.lines.map((line) => line.text ?? ""),
        {
          // 언론사 이름은 회의별 사전에 없다. 전사 프롬프트에 넣어도 소리가
          // 이미 뭉개진 자리는 안 고쳐져서(KTV 실측), 보정 대조에만 쓴다.
          glossary: [...glossary, ...MEDIA_OUTLET_TERMS],
          keepTerms: confirmedNames,
          // 사전 전체 후보 추천은 홀드아웃 정밀도가 낮고 정상 고유명사까지
          // 바꿨다. 회의에 실제로 주어진 용어와 고정 언론사만 대조한다.
          genericDictionary: false,
        },
      );
      built.transcript.lines = applyFixedSpellings(
        built.transcript.lines,
        suggested.suggestions,
        MEDIA_OUTLET_TERMS,
      );
      built.transcript.lines = attachCorrections(
        built.transcript.lines,
        suggested.suggestions
          .filter((suggestion) => !isMediaOutletTerm(suggestion.suggestion))
          .map((suggestion) => ({
            ...suggestion,
            sttLogprob: stt.meanLogprob,
          })),
      );
      if (suggested.usage.inputTokens > 0) {
        await appendAiUsage({
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

    // 신뢰도 하위 구간만 골라 mini로 한 번 더 확인. 60분을 다 다시 돌리지
    // 않고, 겹쳐 말하기·잡음으로 알아듣기 어려웠던 부분만 짧게 재확인한다.
    if (hasAudioTools()) {
      try {
        const secondPass = await runSelectiveSecondPass({
          audioPath,
          workDir: join(workDir, "second-pass"),
          timedSegments: stt.timedSegments,
          glossary,
        });
        if (secondPass.suggestions.length > 0) {
          const lineStarts = built.transcript.lines.map(lineStartSec);
          const withLineIndex = secondPass.suggestions.map((suggestion) => ({
            ...suggestion,
            lineIndex: activeLineIndexAt(lineStarts, suggestion.startSec),
          }));
          built.transcript.lines = attachCorrections(
            built.transcript.lines,
            withLineIndex,
          );
        }
        if (secondPass.audioSec > 0) {
          await appendAiUsage({
            meetingId: params.meetingId,
            userId: params.userId,
            title: params.title,
            stage: "stt",
            model: "gpt-4o-mini-transcribe",
            durationSec: secondPass.audioSec,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedUsd: estimateSttUsdFromMinutes(
              "gpt-4o-mini-transcribe",
              secondPass.audioSec,
            ),
            billSource: "audio_minutes",
          });
        }
      } catch (err) {
        console.warn("[stt] 저신뢰 구간 재확인 실패", err);
      }
    }

    const finalizedChargedSec = quotaReservation?.chargedSec;
    await quotaReservation?.finalize();
    quotaReservation = null;
    await progressQueue;

    await updateUserMeeting(params.meetingId, {
      phase: "done",
      progressPercent: PROGRESS.done,
      meeting: built.meeting,
      transcript: built.transcript,
      timeline: built.timeline,
      rawText: transcriptText,
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
    try {
      await appendPipelineAttempt({
        meetingId: params.meetingId,
        userId: params.userId,
        model,
        analysisMode,
        chargedSec: finalizedChargedSec,
        durationSec: statsDurationSec,
        speakerCount: statsSpeakerCount,
        outcome: "done",
        topicBucket: statsTopicBucket,
      });
    } catch (err) {
      console.warn("[stats] 파이프라인 통계 기록 실패", err);
    }
  } catch (err) {
    const canceled =
      err instanceof AnalysisJobCanceledError || params.signal?.aborted === true;
    quotaBlocked = err instanceof UploadQuotaExceededError;
    const message = canceled
      ? "분석을 취소했습니다. 이미 분석이 시작된 경우 사용한 시간은 차감됩니다."
      : userFacingAnalysisError(
          err instanceof Error ? err.message : "회의 정리에 실패했습니다.",
        );
    // 사용자가 실행 중 취소했거나 정책 위반으로 차단된 경우 이미 모델 비용이
    // 발생했다. 서버·모델·운영 오류만 finally에서 예약을 복구한다.
    if ((canceled || moderationBlocked) && quotaReservation) {
      await quotaReservation.finalize();
      quotaReservation = null;
    }
    await progressQueue;
    try {
      await appendPipelineAttempt({
        meetingId: params.meetingId,
        userId: params.userId,
        model,
        analysisMode,
        durationSec: statsDurationSec,
        speakerCount: statsSpeakerCount,
        outcome: canceled
          ? "canceled"
          : quotaBlocked
          ? "quota_blocked"
          : moderationBlocked
            ? "moderation_blocked"
            : "error",
        failedStage: currentStage,
        topicBucket: statsTopicBucket,
      });
    } catch (statsErr) {
      console.warn("[stats] 파이프라인 통계 기록 실패", statsErr);
    }
    const cur = await getUserMeeting(params.meetingId);
    await updateUserMeeting(params.meetingId, {
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
      data: { state: canceled ? "CANCELED" : "FAILED" },
    });
    await notifyAnalysisResult({
      userId: params.userId,
      meetingId: params.meetingId,
      title: params.title,
      kind: "analysis_failed",
      errorMessage: message,
    });
    if (canceled) {
      throw err instanceof AnalysisJobCanceledError
        ? err
        : new AnalysisJobCanceledError();
    }
  } finally {
    await quotaReservation?.release();
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup
    }
  }
}
