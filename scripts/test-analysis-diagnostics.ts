import { buildAnalysisDiagnostics } from "../src/lib/stt/analysis-diagnostics";

const diagnostics = buildAnalysisDiagnostics({
  analysisMode: "precision",
  primaryModel: "gpt-transcribe",
  timingModel: "whisper-1",
  durationSec: 12,
  chunkCount: 1,
  glossaryTermCount: 2,
  primaryText: "네, 이 기자님. 한국일보 이 기자입니다.",
  timedSegmentCount: 2,
  wordTimingCount: 4,
  speakerSplitRequested: true,
  diarization: {
    model: "test-diarization",
    device: "cpu",
    durationSec: 12,
    wallMs: 100,
    speakerCount: 2,
    segments: [
      { startSec: 0, endSec: 3, speaker: "A" },
      { startSec: 3, endSec: 12, speaker: "B" },
    ],
  },
  attachedBlocks: [
    { startSec: 0, endSec: 3, speaker: "A", text: "네, 이 기자님." },
    {
      startSec: 3,
      endSec: 12,
      speaker: "B",
      text: "한국일보 이 기자입니다.",
    },
  ],
  reconciledBlocks: [
    { startSec: 0, endSec: 3, speaker: "HOST", text: "네, 이 기자님." },
    {
      startSec: 3,
      endSec: 12,
      speaker: "REPORTER",
      text: "한국일보 이 기자입니다.",
    },
  ],
  nameGuesses: [
    {
      label: "REPORTER",
      name: "이 기자",
      confidence: 0.99,
      evidence: "자기소개",
    },
  ],
  fixedSpellings: [
    {
      lineIndex: 1,
      startOffset: 0,
      endOffset: 3,
      wrong: "유시스",
      suggestion: "뉴시스",
      reason: "고정 언론사",
      similarity: 0.9,
      dictionaryVerified: true,
      source: "glossary",
    },
  ],
  finalLines: [
    {
      id: "l1",
      time: "00:00",
      startSec: 0,
      segmentId: "s1",
      speaker: "HOST",
      text: "네, 이 기자님.",
      words: [
        {
          text: "네",
          startSec: 0,
          endSec: 0.3,
          startOffset: 0,
          endOffset: 1,
        },
      ],
    },
    {
      id: "l2",
      time: "00:03",
      startSec: 3,
      segmentId: "s1",
      speaker: "이 기자",
      text: "한국일보 이 기자입니다.",
    },
  ],
});

if (
  diagnostics.diarization.model !== "test-diarization" ||
  diagnostics.speakers.attached.speakerCount !== 2 ||
  diagnostics.speakers.reconciled.speakerCount !== 2 ||
  diagnostics.speakers.nameGuesses[0]?.label !== "REPORTER" ||
  diagnostics.corrections.fixedSpellings[0]?.suggestion !== "뉴시스" ||
  diagnostics.final.wordTimingCoverage !== 0.5
) {
  throw new Error("분석 단계 진단값을 정확히 만들지 못했습니다.");
}

console.log(
  JSON.stringify({
    ok: true,
    diarizationModel: diagnostics.diarization.model,
    attachedSpeakers: diagnostics.speakers.attached.speakerCount,
    reconciledSpeakers: diagnostics.speakers.reconciled.speakerCount,
    wordTimingCoverage: diagnostics.final.wordTimingCoverage,
  }),
);
