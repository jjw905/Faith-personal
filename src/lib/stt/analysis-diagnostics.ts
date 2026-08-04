import type { AnalysisMode } from "@/lib/stt/analysis-mode";
import type { DiarizationResult } from "@/lib/stt/diarization";
import type { SttModel } from "@/lib/stt/models";
import type { SpeakerBlock } from "@/lib/stt/speaker-attach";
import type { SpeakerNameGuess } from "@/lib/stt/speaker-names";
import type { TermSuggestion } from "@/lib/stt/term-suggest";
import type { TranscriptLine } from "@/types/transcript";

type SpeakerStageSegment = {
  startSec: number;
  endSec: number;
  speaker: string;
};

type SpeakerStageTrace = {
  blockCount: number;
  speakerCount: number;
  segments: SpeakerStageSegment[];
};

/**
 * 분석 단계별 품질 회귀를 찾기 위한 내용 비저장 진단값.
 *
 * 원문과 요약은 기존 회의 payload에 이미 있으므로 여기에는 복제하지 않는다.
 * 시간 경계, 익명 화자 라벨, 이름 치환표, 고정 철자 치환과 집계값만 보존해
 * 음향 분리 → 문맥 보정 → 이름 추정 중 어느 단계에서 달라졌는지 비교한다.
 */
export type AnalysisDiagnostics = {
  schemaVersion: 1;
  stt: {
    analysisMode: AnalysisMode;
    primaryModel: SttModel;
    timingModel: "whisper-1" | "gpt-4o-mini-transcribe-realtime";
    durationSec: number;
    chunkCount: number;
    glossaryTermCount: number;
    primaryChars: number;
    timedSegmentCount: number;
    wordTimingCount: number;
  };
  diarization: {
    requested: boolean;
    model?: string;
    device?: string;
    wallMs?: number;
    speakerCount?: number;
    segmentCount: number;
    segments: SpeakerStageSegment[];
  };
  speakers: {
    attached: SpeakerStageTrace;
    reconciled: SpeakerStageTrace;
    nameGuesses: Array<Pick<SpeakerNameGuess, "label" | "name" | "confidence">>;
  };
  corrections: {
    fixedSpellings: Array<{
      lineIndex: number;
      wrong: string;
      suggestion: string;
      source: TermSuggestion["source"];
    }>;
  };
  final: {
    lineCount: number;
    speakerCount: number;
    linesWithWords: number;
    linesWithoutWords: number;
    wordTimingCoverage: number;
  };
};

function speakerStage(rows: SpeakerBlock[]): SpeakerStageTrace {
  return {
    blockCount: rows.length,
    speakerCount: new Set(rows.map((row) => row.speaker)).size,
    segments: rows.map((row) => ({
      startSec: row.startSec,
      endSec: row.endSec,
      speaker: row.speaker,
    })),
  };
}

function diarizationTrace(
  requested: boolean,
  result: DiarizationResult | null,
): AnalysisDiagnostics["diarization"] {
  if (!result) {
    return { requested, segmentCount: 0, segments: [] };
  }
  return {
    requested,
    model: result.model,
    device: result.device,
    wallMs: result.wallMs,
    speakerCount: result.speakerCount,
    segmentCount: result.segments.length,
    segments: result.segments.map((segment) => ({ ...segment })),
  };
}

export function buildAnalysisDiagnostics(params: {
  analysisMode: AnalysisMode;
  primaryModel: SttModel;
  timingModel: AnalysisDiagnostics["stt"]["timingModel"];
  durationSec: number;
  chunkCount: number;
  glossaryTermCount: number;
  primaryText: string;
  timedSegmentCount: number;
  wordTimingCount: number;
  speakerSplitRequested: boolean;
  diarization: DiarizationResult | null;
  attachedBlocks: SpeakerBlock[];
  reconciledBlocks: SpeakerBlock[];
  nameGuesses: SpeakerNameGuess[];
  fixedSpellings: TermSuggestion[];
  finalLines: TranscriptLine[];
}): AnalysisDiagnostics {
  const textLines = params.finalLines.filter(
    (line) => (line.text?.trim().length ?? 0) > 0,
  );
  const linesWithWords = textLines.filter((line) => (line.words?.length ?? 0) > 0)
    .length;
  return {
    schemaVersion: 1,
    stt: {
      analysisMode: params.analysisMode,
      primaryModel: params.primaryModel,
      timingModel: params.timingModel,
      durationSec: params.durationSec,
      chunkCount: params.chunkCount,
      glossaryTermCount: params.glossaryTermCount,
      primaryChars: params.primaryText.length,
      timedSegmentCount: params.timedSegmentCount,
      wordTimingCount: params.wordTimingCount,
    },
    diarization: diarizationTrace(
      params.speakerSplitRequested,
      params.diarization,
    ),
    speakers: {
      attached: speakerStage(params.attachedBlocks),
      reconciled: speakerStage(params.reconciledBlocks),
      nameGuesses: params.nameGuesses.map((guess) => ({
        label: guess.label,
        name: guess.name,
        confidence: guess.confidence,
      })),
    },
    corrections: {
      fixedSpellings: params.fixedSpellings.map((suggestion) => ({
        lineIndex: suggestion.lineIndex,
        wrong: suggestion.wrong,
        suggestion: suggestion.suggestion,
        source: suggestion.source,
      })),
    },
    final: {
      lineCount: textLines.length,
      speakerCount: new Set(textLines.map((line) => line.speaker)).size,
      linesWithWords,
      linesWithoutWords: textLines.length - linesWithWords,
      wordTimingCoverage: linesWithWords / Math.max(1, textLines.length),
    },
  };
}
