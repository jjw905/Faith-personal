import { buildSemanticStructure } from "@/lib/stt/semantic-structure";
import { buildMeetingFromStt } from "@/lib/stt/to-meeting";
import { realtimeTranscribeFile } from "@/lib/stt/realtime/transcribe-session";
import type { RealtimeTranscribeProgress } from "@/lib/stt/realtime/types";
import { estimateStructureUsd, STRUCTURE_MODEL } from "@/lib/stt/pricing";
import { appendAiUsage } from "@/lib/stt/usage-store";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";
import type { SemanticStructure } from "@/lib/stt/semantic-structure";

export type RealtimePipelineResult = {
  meetingId: string;
  stt: Awaited<ReturnType<typeof realtimeTranscribeFile>>;
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
}): Promise<RealtimePipelineResult> {
  const stt = await realtimeTranscribeFile(params.audioPath, {
    language: params.language ?? "ko",
    maxAudioSec: params.maxAudioSec,
    onProgress: params.onProgress,
  });

  if (!stt.text.trim()) {
    throw new Error("실시간 전사가 비어 있습니다.");
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

  const { structure, usage } = await buildSemanticStructure(
    stt.text,
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
    capture: "live",
  });

  return {
    meetingId: params.meetingId,
    stt,
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
