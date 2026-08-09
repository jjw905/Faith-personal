/**
 * 같은 KTV 원본을 반복 분석한 로컬 제품 산출물을 한 표로 비교한다.
 *
 * API 호출 없이 저장된 rawText, 최종 transcript, 단계별 diagnostics와 Clova
 * 화자 전환 정답만 읽는다. 새 실행을 계속 같은 파일에 누적 비교할 수 있다.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

import type { AnalysisDiagnostics } from "../src/lib/stt/analysis-diagnostics";

type Word = { startSec: number; endSec: number; text: string };
type Line = {
  startSec: number;
  speaker: string;
  text: string;
  words?: Word[];
};
type ProductMeeting = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  analysisMode?: string;
  model?: string;
  vaultFileId?: string;
  rawText?: string;
  meeting?: { title?: string };
  transcript?: { lines?: Line[] };
  analysisDiagnostics?: AnalysisDiagnostics;
};

type ReferenceTurn = { speakerId: string; startSec: number };

const DATA_DIR = ".data/user-meetings";
const DEFAULT_TITLE = "ktv-briefing-20251231";
const DEFAULT_REFERENCE =
  "Faith-office/08_검증_정답셋/Faith_브리핑_클로바_정답셋_2026-08-03/02_clova노트_정답/ktv-briefing-20251231.clova.txt";
const DEFAULT_OUTPUT =
  ".data/stt-bench/product-transcript-quality/ktv-run-history.json";
const BOUNDARY_TOLERANCE_SEC = 2;

function arg(name: string): string | undefined {
  return process.argv
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function dense(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z가-힣]/gu, "");
}

function parseReferenceTurns(reference: string): ReferenceTurn[] {
  const turns: ReferenceTurn[] = [];
  for (const raw of reference.split(/\r?\n/u)) {
    const marker = raw
      .trim()
      .match(/^참석자\s+(\d+)\s+(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/u);
    if (!marker) continue;
    const startSec =
      Number(marker[2] ?? 0) * 3600 +
      Number(marker[3]) * 60 +
      Number(marker[4]);
    const speakerId = `참석자 ${marker[1]}`;
    if (turns[turns.length - 1]?.speakerId === speakerId) continue;
    turns.push({ speakerId, startSec });
  }
  return turns;
}

function boundaryScore(predicted: number[], gold: number[]) {
  const used = new Set<number>();
  let matched = 0;
  for (const boundary of predicted) {
    let bestIndex = -1;
    let bestError = Number.POSITIVE_INFINITY;
    gold.forEach((target, index) => {
      const error = Math.abs(boundary - target);
      if (
        !used.has(index) &&
        error <= BOUNDARY_TOLERANCE_SEC &&
        error < bestError
      ) {
        bestIndex = index;
        bestError = error;
      }
    });
    if (bestIndex >= 0) {
      used.add(bestIndex);
      matched += 1;
    }
  }
  const precision = matched / Math.max(1, predicted.length);
  const recall = matched / Math.max(1, gold.length);
  return {
    toleranceSec: BOUNDARY_TOLERANCE_SEC,
    predicted: predicted.length,
    gold: gold.length,
    matched,
    precision,
    recall,
    f1:
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0,
  };
}

function round(value: number, places = 3): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function evaluate(meeting: ProductMeeting, goldBoundaries: number[]) {
  const lines = meeting.transcript?.lines ?? [];
  const rawText = meeting.rawText ?? "";
  const finalText = lines.map((line) => line.text).join(" ");
  const raw = dense(rawText);
  const final = dense(finalText);
  const speakers = [...new Set(lines.map((line) => line.speaker).filter(Boolean))];
  const host = lines[0]?.speaker;
  const hostCall = lines.find((line) => /이성택\s*기자님/u.test(line.text));
  const reporterIntro = lines.find((line) =>
    /한국일보.{0,12}이성택.{0,5}입니다/u.test(line.text),
  );
  const predictedBoundaries = lines.flatMap((line, index) =>
    index > 0 && line.speaker !== lines[index - 1]!.speaker
      ? [line.startSec]
      : [],
  );
  const textLines = lines.filter((line) => line.text.trim().length > 0);
  const linesWithWords = textLines.filter((line) => (line.words?.length ?? 0) > 0)
    .length;
  const reversedWords = textLines.reduce((count, line) => {
    const words = line.words ?? [];
    return (
      count +
      words.filter(
        (word, index) =>
          word.endSec < word.startSec ||
          (index > 0 && word.startSec < words[index - 1]!.startSec),
      ).length
    );
  }, 0);
  const timingCoverage = linesWithWords / Math.max(1, textLines.length);
  const boundary = boundaryScore(predictedBoundaries, goldBoundaries);

  const primary = {
    hostName: raw.includes("이규연"),
    hostRole: raw.includes("홍보소통수석"),
    firstReporter: raw.includes("한국일보이성택"),
    newsOutlet: raw.includes("뉴시스"),
    fourthReporter: raw.includes("김영록"),
    closingPhrase: raw.includes("글쎄요"),
  };
  const finalTerms = {
    newsOutlet: final.includes("뉴시스"),
    fourthReporter: final.includes("김영록"),
  };
  const handoff = {
    hostCallFound: Boolean(hostCall),
    reporterIntroFound: Boolean(reporterIntro),
    hostCallKeptWithHost: Boolean(hostCall && host && hostCall.speaker === host),
    reporterSeparatedFromHost: Boolean(
      reporterIntro && host && reporterIntro.speaker !== host,
    ),
    reporterNamedFromSelfIntro: Boolean(
      reporterIntro?.speaker.includes("이성택"),
    ),
    hostCall: hostCall
      ? { startSec: hostCall.startSec, speaker: hostCall.speaker }
      : null,
    reporterIntro: reporterIntro
      ? { startSec: reporterIntro.startSec, speaker: reporterIntro.speaker }
      : null,
  };

  const failureStages: string[] = [];
  if (Object.values(primary).some((passed) => !passed)) {
    failureStages.push("primary-stt");
  }
  if (!finalTerms.newsOutlet || !finalTerms.fourthReporter) {
    failureStages.push("term-correction");
  }
  if (
    !handoff.hostCallKeptWithHost ||
    !handoff.reporterSeparatedFromHost ||
    !handoff.reporterNamedFromSelfIntro
  ) {
    failureStages.push("speaker-handoff-or-name");
  }
  if (boundary.f1 < 0.9) failureStages.push("speaker-boundary");
  if (timingCoverage < 1 || reversedWords > 0) {
    failureStages.push("timing-attachment");
  }

  return {
    id: meeting.id,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    sourceId: meeting.vaultFileId,
    analysisMode: meeting.analysisMode,
    primaryModel: meeting.model,
    lineCount: lines.length,
    finalSpeakerCount: speakers.length,
    primary,
    fixedSpelling: {
      newsOutletApplied: !primary.newsOutlet && finalTerms.newsOutlet,
      recorded:
        meeting.analysisDiagnostics?.corrections.fixedSpellings ?? null,
    },
    finalTerms,
    handoff,
    boundary: {
      ...boundary,
      precision: round(boundary.precision),
      recall: round(boundary.recall),
      f1: round(boundary.f1),
    },
    timing: {
      linesWithWords,
      linesWithoutWords: textLines.length - linesWithWords,
      wordTimingCoverage: round(timingCoverage),
      reversedWords,
    },
    diagnostics: meeting.analysisDiagnostics
      ? {
          diarizationModel: meeting.analysisDiagnostics.diarization.model,
          diarizationSpeakerCount:
            meeting.analysisDiagnostics.diarization.speakerCount,
          attachedSpeakerCount:
            meeting.analysisDiagnostics.speakers.attached.speakerCount,
          reconciledSpeakerCount:
            meeting.analysisDiagnostics.speakers.reconciled.speakerCount,
          nameGuesses: meeting.analysisDiagnostics.speakers.nameGuesses,
        }
      : null,
    failureStages,
  };
}

function aggregate(rows: ReturnType<typeof evaluate>[]) {
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.primaryModel ?? "unknown"}/${row.analysisMode ?? "legacy"}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return Object.fromEntries(
    [...groups].map(([key, group]) => {
      const rate = (passed: (row: (typeof group)[number]) => boolean) =>
        round(group.filter(passed).length / Math.max(1, group.length));
      return [
        key,
        {
          runs: group.length,
          primaryHostNameRate: rate((row) => row.primary.hostName),
          primaryHostRoleRate: rate((row) => row.primary.hostRole),
          primaryNewsOutletRate: rate((row) => row.primary.newsOutlet),
          finalNewsOutletRate: rate((row) => row.finalTerms.newsOutlet),
          primaryFourthReporterRate: rate((row) => row.primary.fourthReporter),
          finalFourthReporterRate: rate((row) => row.finalTerms.fourthReporter),
          closingPhraseRate: rate((row) => row.primary.closingPhrase),
          firstHandoffRate: rate(
            (row) =>
              row.handoff.hostCallKeptWithHost &&
              row.handoff.reporterSeparatedFromHost &&
              row.handoff.reporterNamedFromSelfIntro,
          ),
          meanBoundaryF1: round(
            group.reduce((sum, row) => sum + row.boundary.f1, 0) /
              Math.max(1, group.length),
          ),
          meanWordTimingCoverage: round(
            group.reduce(
              (sum, row) => sum + row.timing.wordTimingCoverage,
              0,
            ) / Math.max(1, group.length),
          ),
        },
      ];
    }),
  );
}

function main() {
  const title = arg("--title") ?? DEFAULT_TITLE;
  const referencePath = arg("--reference") ?? DEFAULT_REFERENCE;
  const outputPath = arg("--out") ?? DEFAULT_OUTPUT;
  const referenceTurns = parseReferenceTurns(readFileSync(referencePath, "utf8"));
  const goldBoundaries = referenceTurns.slice(1).map((turn) => turn.startSec);
  const meetings = readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const meeting = JSON.parse(
          readFileSync(join(DATA_DIR, name), "utf8"),
        ) as ProductMeeting;
        return meeting.meeting?.title === title && meeting.transcript?.lines?.length
          ? [meeting]
          : [];
      } catch {
        return [];
      }
    });
  const runs = meetings
    .map((meeting) => evaluate(meeting, goldBoundaries))
    .sort((left, right) =>
      (right.createdAt ?? "").localeCompare(left.createdAt ?? ""),
    );
  const report = {
    generatedAt: new Date().toISOString(),
    title,
    referencePath,
    referenceTurnCount: referenceTurns.length,
    runCount: runs.length,
    aggregate: aggregate(runs),
    runs,
  };
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ...report, runs: runs.slice(0, 5), outputPath }, null, 2));
}

main();
