import { buildSemanticStructure } from "@/lib/stt/semantic-structure";
import { buildMeetingFromStt } from "@/lib/stt/to-meeting";
import { realtimeTranscribeFile } from "@/lib/stt/realtime/transcribe-session";
import type { RealtimeTranscribeProgress } from "@/lib/stt/realtime/types";
import {
  alignRealtimeUtterancesToSpeakers,
  assertDiarizationConfigured,
  diarizeAudio,
  formatSpeakerTranscript,
  type DiarizationResult,
  type SpeakerUtterance,
} from "@/lib/stt/diarization";
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
  diarization?: "none" | "pyannote";
  minSpeakers?: number;
  maxSpeakers?: number;
}): Promise<RealtimePipelineResult> {
  if (params.diarization === "pyannote") {
    assertDiarizationConfigured();
  }

  const [stt, diarization] = await Promise.all([
    realtimeTranscribeFile(params.audioPath, {
      language: params.language ?? "ko",
      maxAudioSec: params.maxAudioSec,
      onProgress: params.onProgress,
    }),
    params.diarization === "pyannote"
      ? diarizeAudio({
          audioPath: params.audioPath,
          maxAudioSec: params.maxAudioSec,
          minSpeakers: params.minSpeakers,
          maxSpeakers: params.maxSpeakers,
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
    endSec: speakerUtterances[index + 1]?.startSec ?? stt.durationSec,
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
    totalEstimatedUsd: stt.estimatedUsd + usage.estimatedUsd,
  };
}
