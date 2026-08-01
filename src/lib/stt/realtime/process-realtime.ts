import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildSemanticStructure } from "@/lib/stt/semantic-structure";
import { buildGlossary } from "@/lib/stt/glossary";
import { buildMeetingFromStt } from "@/lib/stt/to-meeting";
import { realtimeTranscribeFile } from "@/lib/stt/realtime/transcribe-session";
import type {
  RealtimeSttModel,
  RealtimeTranscribeProgress,
} from "@/lib/stt/realtime/types";
import {
  alignRealtimeUtterancesToSpeakers,
  diarizationAvailability,
  diarizeAudio,
  formatSpeakerTranscript,
  type DiarizationResult,
  type SpeakerUtterance,
} from "@/lib/stt/diarization";
import {
  applySpeakerNames,
  identifySpeakerNames,
} from "@/lib/stt/speaker-names";
import {
  attachCorrections,
  suggestTermCorrections,
} from "@/lib/stt/term-suggest";
import {
  alignDialogueToTimedSegments,
  type TimedSegment,
  type WordTiming,
} from "@/lib/stt/timed-segments";
import { whisperWordTimingsForFile } from "@/lib/stt/chunked-transcribe";
import { runSelectiveSecondPass } from "@/lib/stt/second-pass-review";
import { hasAudioTools } from "@/lib/stt/local-tools";
import {
  estimateSttUsdFromMinutes,
  estimateStructureUsd,
  STRUCTURE_MODEL,
} from "@/lib/stt/pricing";
import { appendAiUsage } from "@/lib/stt/usage-store";
import { activeLineIndexAt, lineStartSec } from "@/lib/transcript-time";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";
import type { SemanticStructure } from "@/lib/stt/semantic-structure";

export type RealtimePipelineResult = {
  meetingId: string;
  stt: Awaited<ReturnType<typeof realtimeTranscribeFile>>;
  diarization: DiarizationResult | null;
  speakerUtterances: SpeakerUtterance[];
  structure: SemanticStructure;
  structureUsage: {
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedUsd: number;
  };
  meeting: Meeting;
  transcript: MeetingTranscript;
  timeline: MeetingTimeline;
  totalEstimatedUsd: number;
};

/**
 * 실시간 상품 파이프라인.
 * 업로드와 같이 화자분리, 단어 타임스탬프, 저신뢰 2차보정을 붙인다.
 * 에이전트/휴리스틱으로 대화·요약을 다시 쓰지 않는다.
 */
export async function processRealtimeMeeting(params: {
  meetingId: string;
  title: string;
  audioPath: string;
  userId?: string;
  language?: string;
  maxAudioSec?: number;
  onProgress?: (p: RealtimeTranscribeProgress) => void;
  logUsage?: boolean;
  model?: RealtimeSttModel;
  /** 기본은 업로드와 같이 화자분리를 켠다. "none"만 명시적으로 끈다. */
  diarization?: "none" | "pyannote";
  minSpeakers?: number;
  maxSpeakers?: number;
}): Promise<RealtimePipelineResult> {
  const wantDiarization = params.diarization !== "none";
  const diarizationReady = wantDiarization
    ? diarizationAvailability()
    : ({ ok: false as const, reason: "요청하지 않음" });
  if (wantDiarization && !diarizationReady.ok) {
    console.warn(`[realtime] 화자분리 없이 진행: ${diarizationReady.reason}`);
  }

  const glossary = await buildGlossary({
    userId: params.userId,
    title: params.title,
  });

  const [stt, diarization] = await Promise.all([
    realtimeTranscribeFile(params.audioPath, {
      language: params.language ?? "ko",
      model: params.model,
      maxAudioSec: params.maxAudioSec,
      onProgress: params.onProgress,
    }),
    wantDiarization && diarizationReady.ok
      ? diarizeAudio({
          audioPath: params.audioPath,
          maxAudioSec: params.maxAudioSec,
          minSpeakers: params.minSpeakers,
          maxSpeakers: params.maxSpeakers,
        }).catch((err) => {
          console.warn("[realtime] 화자분리 건너뜀", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  if (!stt.text.trim()) {
    throw new Error("실시간 받아쓰기가 비어 있습니다.");
  }
  if (!stt.utterances.length) {
    throw new Error(
      "실시간 받아쓰기 발화 시각이 비어 있습니다. 싱크를 맞출 수 없어 중단합니다.",
    );
  }

  if (params.logUsage !== false) {
    await appendAiUsage({
      meetingId: params.meetingId,
      userId: params.userId ?? "realtime",
      title: params.title,
      stage: "stt",
      model: stt.model,
      durationSec: stt.durationSec,
      chunkCount: stt.utterances.length,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedUsd: stt.estimatedUsd,
      billSource: "audio_minutes",
    });
  }

  let wordTimings: WordTiming[] = [];
  let timingUsd = 0;
  if (hasAudioTools()) {
    try {
      const timed = await whisperWordTimingsForFile(params.audioPath, glossary);
      wordTimings = timed.words;
      timingUsd = estimateSttUsdFromMinutes(
        "whisper-1",
        timed.durationBillSec || stt.durationSec,
      );
      if (params.logUsage !== false && timingUsd > 0) {
        await appendAiUsage({
          meetingId: params.meetingId,
          userId: params.userId ?? "realtime",
          title: params.title,
          stage: "stt",
          model: "whisper-1",
          durationSec: timed.durationBillSec || stt.durationSec,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          estimatedUsd: timingUsd,
          billSource: "audio_minutes",
        });
      }
    } catch (err) {
      console.warn("[realtime] 단어 타임스탬프 건너뜀", err);
    }
  }

  const speakerUtterances = diarization
    ? alignRealtimeUtterancesToSpeakers({
        utterances: stt.utterances,
        diarization,
        durationSec: stt.durationSec,
      })
    : stt.utterances.map((utterance) => ({
        ...utterance,
        speaker: "발화",
      }));
  const structureInput = diarization
    ? formatSpeakerTranscript(speakerUtterances)
    : stt.text;

  const { structure, usage } = await buildSemanticStructure(
    structureInput,
    stt.durationSec,
  );

  const timedSegments: TimedSegment[] = speakerUtterances.map(
    (utterance, index) => ({
      startSec: utterance.startSec,
      endSec:
        utterance.endSec ??
        speakerUtterances[index + 1]?.startSec ??
        stt.durationSec,
      text: utterance.text,
      confidence: utterance.confidence,
    }),
  );

  structure.dialogue = alignDialogueToTimedSegments(
    structure.dialogue,
    timedSegments,
    stt.durationSec,
  );

  if (structure.dialogue.length === 0) {
    throw new Error("구조화 대화기록이 비어 있습니다.");
  }

  let speakerNameUsd = 0;
  const confirmedNames: string[] = [];
  try {
    const named = await identifySpeakerNames({ dialogue: structure.dialogue });
    applySpeakerNames(structure, named.guesses);
    confirmedNames.push(...named.guesses.map((g) => g.name));
    speakerNameUsd = named.usage.estimatedUsd;
    if (params.logUsage !== false && named.usage.inputTokens > 0) {
      await appendAiUsage({
        meetingId: params.meetingId,
        userId: params.userId ?? "realtime",
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
    console.warn("[realtime] 화자 실명 추정 실패", err);
  }

  if (params.logUsage !== false) {
    await appendAiUsage({
      meetingId: params.meetingId,
      userId: params.userId ?? "realtime",
      title: params.title,
      stage: "structure",
      model: usage.model,
      durationSec: stt.durationSec,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedUsd: usage.estimatedUsd,
      billSource: "tokens",
    });
  }

  const built = buildMeetingFromStt({
    meetingId: params.meetingId,
    title: params.title,
    durationSec: stt.durationSec,
    rawText: stt.text,
    semantic: structure,
    timedSegments,
    wordTimings,
    capture: "live",
  });

  let suggestUsd = 0;
  try {
    const fullGlossary = await buildGlossary({
      userId: params.userId,
      title: params.title,
      participantNames: confirmedNames,
    });
    const suggested = await suggestTermCorrections(
      built.transcript.lines.map((line) => line.text ?? ""),
      {
        glossary: fullGlossary,
        keepTerms: confirmedNames,
        genericDictionary: true,
      },
    );
    built.transcript.lines = attachCorrections(
      built.transcript.lines,
      suggested.suggestions,
    );
    suggestUsd = suggested.usage.estimatedUsd;
    if (params.logUsage !== false && suggested.usage.inputTokens > 0) {
      await appendAiUsage({
        meetingId: params.meetingId,
        userId: params.userId ?? "realtime",
        title: params.title,
        stage: "structure",
        model: suggested.usage.model,
        durationSec: stt.durationSec,
        inputTokens: suggested.usage.inputTokens,
        outputTokens: suggested.usage.outputTokens,
        totalTokens: suggested.usage.inputTokens + suggested.usage.outputTokens,
        estimatedUsd: suggested.usage.estimatedUsd,
        billSource: "tokens",
      });
    }

    if (hasAudioTools()) {
      const workDir = join(
        tmpdir(),
        `faith-rt-second-${params.meetingId}-${Date.now().toString(36)}`,
      );
      try {
        mkdirSync(workDir, { recursive: true });
        const secondPass = await runSelectiveSecondPass({
          audioPath: params.audioPath,
          workDir,
          timedSegments,
          glossary: fullGlossary,
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
        if (params.logUsage !== false && secondPass.audioSec > 0) {
          await appendAiUsage({
            meetingId: params.meetingId,
            userId: params.userId ?? "realtime",
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
        console.warn("[realtime] 저신뢰 구간 재확인 실패", err);
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    }
  } catch (err) {
    console.warn("[realtime] 보정 추천 실패", err);
  }

  return {
    meetingId: params.meetingId,
    stt,
    diarization,
    speakerUtterances,
    structure,
    structureUsage: {
      model: STRUCTURE_MODEL,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimatedUsd:
        usage.estimatedUsd ||
        estimateStructureUsd(usage.inputTokens, usage.outputTokens),
    },
    meeting: built.meeting,
    transcript: built.transcript,
    timeline: built.timeline,
    totalEstimatedUsd:
      stt.estimatedUsd +
      timingUsd +
      usage.estimatedUsd +
      suggestUsd +
      speakerNameUsd,
  };
}
