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
import { alignDialogueToTimedSegments } from "@/lib/stt/timed-segments";
import { estimateStructureUsd, STRUCTURE_MODEL } from "@/lib/stt/pricing";
import { appendAiUsage } from "@/lib/stt/usage-store";
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
 * 오디오 스트림 STT(모델) → 구조화(고정 gpt-4o-mini) → 회의 산출.
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
  diarization?: "none" | "pyannote";
  minSpeakers?: number;
  maxSpeakers?: number;
}): Promise<RealtimePipelineResult> {
  // 화자분리는 있으면 쓰고 없으면 넘어간다. 실시간 경로도 업로드와 같다.
  const wantDiarization = params.diarization === "pyannote";
  const diarizationReady = wantDiarization
    ? diarizationAvailability()
    : ({ ok: false as const, reason: "요청하지 않음" });
  if (wantDiarization && !diarizationReady.ok) {
    console.warn(`[realtime] 화자분리 없이 진행: ${diarizationReady.reason}`);
  }

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
    throw new Error("실시간 전사가 비어 있습니다.");
  }
  if (!stt.utterances.length) {
    throw new Error(
      "실시간 STT 발화 시각이 비어 있습니다. 싱크를 맞출 수 없어 중단합니다.",
    );
  }

  if (params.logUsage !== false) {
    appendAiUsage({
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

  const timedSegments = speakerUtterances.map((utterance, index) => ({
    startSec: utterance.startSec,
    endSec:
      utterance.endSec ??
      speakerUtterances[index + 1]?.startSec ??
      stt.durationSec,
    text: utterance.text,
  }));

  structure.dialogue = alignDialogueToTimedSegments(
    structure.dialogue,
    timedSegments,
    stt.durationSec,
  );

  if (structure.dialogue.length === 0) {
    throw new Error("구조화 대화기록이 비어 있습니다.");
  }

  // 화자 실명 추정. 화자 분리가 없으면 라벨이 하나뿐이라 건너뛴다.
  let speakerNameUsd = 0;
  const confirmedNames: string[] = [];
  try {
    const named = await identifySpeakerNames({ dialogue: structure.dialogue });
    applySpeakerNames(structure, named.guesses);
    confirmedNames.push(...named.guesses.map((g) => g.name));
    speakerNameUsd = named.usage.estimatedUsd;
    if (params.logUsage !== false && named.usage.inputTokens > 0) {
      appendAiUsage({
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
    appendAiUsage({
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
    capture: "live",
  });

  // 오인식 보정 추천. 표시만 하고 본문은 그대로 둔다.
  let suggestUsd = 0;
  try {
    const glossary = buildGlossary({
      userId: params.userId,
      title: params.title,
      participantNames: confirmedNames,
    });
    const suggested = await suggestTermCorrections(
      built.transcript.lines.map((line) => line.text ?? ""),
      { glossary, keepTerms: confirmedNames },
    );
    built.transcript.lines = attachCorrections(
      built.transcript.lines,
      suggested.suggestions,
    );
    suggestUsd = suggested.usage.estimatedUsd;
    if (params.logUsage !== false && suggested.usage.inputTokens > 0) {
      appendAiUsage({
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
      stt.estimatedUsd + usage.estimatedUsd + suggestUsd + speakerNameUsd,
  };
}
