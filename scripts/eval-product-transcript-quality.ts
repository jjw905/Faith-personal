/**
 * 저장된 제품 산출물을 정답 노트와 함께 평가한다. API 호출은 하지 않는다.
 *
 * 기본값은 brief-ailab의 가장 최근 standard/precision 결과다.
 * 특정 산출물을 보려면 --standard=.data/...json --precision=.data/...json.
 */
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

type Word = {
  text: string;
  startSec: number;
  endSec: number;
};

type ProductMeeting = {
  id: string;
  analysisMode?: "standard" | "precision";
  rawText?: string;
  meeting: {
    title: string;
    duration?: string;
    participants?: Array<{ name: string }>;
  };
  transcript: {
    lines: Array<{
      startSec: number;
      speaker: string;
      text?: string;
      words?: Word[];
    }>;
  };
  timeline?: { overallSummary?: string };
};

const DATA_DIR = ".data/user-meetings";
const DEFAULT_REFERENCE = ".data/stt-bench/fixtures/brief-ailab.reference.txt";
const OUT = ".data/stt-bench/product-transcript-quality";
const MAX_BUBBLE_CHARS = 280;
const P95_BUBBLE_CHARS = 220;
const SUMMARY_SUPPORT_MIN = 0.72;
const CLICK_P95_MAX_SEC = 0.35;
const SPEAKER_BOUNDARY_TOLERANCE_SEC = 2;
const SPEAKER_BOUNDARY_F1_MIN = 0.9;

function arg(name: string): string | undefined {
  return process.argv
    .find((value) => value.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function dense(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function percentile(values: number[], ratio: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))]!;
}

function latestSnapshot(title: string, mode: "standard" | "precision"): string {
  const candidates = readdirSync(DATA_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(DATA_DIR, name))
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  for (const candidate of candidates) {
    try {
      const meeting = JSON.parse(readFileSync(candidate.path, "utf8")) as ProductMeeting;
      if (meeting.meeting?.title === title && meeting.analysisMode === mode) {
        return candidate.path;
      }
    } catch {
      // 손상된 다른 로컬 산출물은 선택 후보에서만 제외한다.
    }
  }
  throw new Error(`${title} ${mode} 제품 산출물을 찾지 못했습니다.`);
}

function summarySentences(text: string): string[] {
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function contentTokens(text: string): string[] {
  return [...text.toLowerCase().matchAll(/[0-9a-z가-힣]{2,}/g)]
    .map((match) => match[0])
    // 조사·서술어 끝만 달라지는 한국어 굴절을 근거 없음으로 세지 않는다.
    .map((token) =>
      token.replace(
        /(?:했습니다|되었습니다|합니다|됩니다|이었죠|했어요|하려는|에서는|으로는|과제로는|들에|에서|으로|하고|하는|하며|으며|에는|에게|까지|부터|처럼|라는|이란|이었던|였던|되고|되며|되어|이며|이라|이랑|들과|들을|으로|와|과|은|는|이|가|을|를|의|에)$/u,
        "",
      ),
    )
    .filter((token) => !["회의", "대해", "이를", "등이", "위한"].includes(token))
    .filter((token) => token.length >= 2);
}

function sentenceSupport(sentence: string, source: string) {
  const sourceDense = dense(source);
  const tokens = [...new Set(contentTokens(sentence))];
  const supported = tokens.filter((token) => sourceDense.includes(dense(token)));
  const score = supported.length / Math.max(1, tokens.length);
  return {
    sentence,
    score,
    supported,
    unsupported: tokens.filter((token) => !supported.includes(token)),
    passed: tokens.length > 0 && score >= SUMMARY_SUPPORT_MIN,
  };
}

function referenceSpeakerNames(reference: string, durationSec: number): string[] {
  const names: string[] = [];
  for (const line of reference.split(/\r?\n/)) {
    const clock = line.match(/\((\d{1,2}):(\d{2})\)/);
    if (clock && Number(clock[1]) * 60 + Number(clock[2]) > durationSec) break;
    const marker = line.match(/^\[[^\]]+\]\s*<([^>]+)>/);
    if (!marker) continue;
    const name = marker[1]!
      .replace(/\s+(?:행정안전부|중소벤처기업부|인공지능).+$/u, "")
      .trim();
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

type ReferenceTurn = { speakerId: string; startSec: number };

/** Clova Note txt의 "참석자 N 01:23" 머리글에서 원래 ID와 절대 시각을 복구한다. */
function clovaReferenceTurns(reference: string): ReferenceTurn[] {
  const turns: ReferenceTurn[] = [];
  for (const line of reference.split(/\r?\n/)) {
    const marker = line
      .trim()
      .match(/^참석자\s+(\d+)\s+(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/u);
    if (!marker) continue;
    const startSec =
      Number(marker[2] ?? 0) * 3600 +
      Number(marker[3]) * 60 +
      Number(marker[4]);
    const speakerId = `참석자 ${marker[1]}`;
    const previous = turns[turns.length - 1];
    // 같은 참석자의 연속 표시는 새 화자 전환이 아니다.
    if (previous?.speakerId === speakerId) continue;
    turns.push({ speakerId, startSec });
  }
  return turns;
}

function boundaryF1(
  predicted: number[],
  gold: number[],
  toleranceSec = SPEAKER_BOUNDARY_TOLERANCE_SEC,
) {
  const used = new Set<number>();
  let matched = 0;
  for (const boundary of predicted) {
    let bestIndex = -1;
    let bestError = Infinity;
    gold.forEach((target, index) => {
      if (used.has(index)) return;
      const error = Math.abs(boundary - target);
      if (error <= toleranceSec && error < bestError) {
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
    toleranceSec,
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

function orphanDuplicates(lines: ProductMeeting["transcript"]["lines"]) {
  const duplicates: Array<{ index: number; text: string; neighbor: string }> = [];
  lines.forEach((line, index) => {
    const value = dense(line.text ?? "");
    if (!value || value.length > 20) return;
    for (const neighborIndex of [index - 1, index + 1]) {
      const neighbor = lines[neighborIndex];
      const neighborText = dense(neighbor?.text ?? "");
      if (neighborText.length > value.length && neighborText.includes(value)) {
        duplicates.push({
          index,
          text: line.text ?? "",
          neighbor: neighbor?.text ?? "",
        });
        return;
      }
    }
  });
  return duplicates;
}

function evaluate(
  path: string,
  expectedSpeakers: string[],
  referenceTurns: ReferenceTurn[],
) {
  const product = JSON.parse(readFileSync(path, "utf8")) as ProductMeeting;
  const lines = product.transcript.lines;
  const rawText = product.rawText ?? "";
  const lineTexts = lines.map((line) => line.text ?? "");
  const lengths = lineTexts.map((text) => text.length);
  const dialogueSpeakers = [...new Set(lines.map((line) => line.speaker).filter(Boolean))];
  const participantNames = (product.meeting.participants ?? []).map(
    (participant) => participant.name,
  );
  const ungroundedParticipants = participantNames.filter(
    (name) => !dialogueSpeakers.includes(name),
  );
  const duplicateBubbles = orphanDuplicates(lines);
  const clickErrors = lines.flatMap((line) => {
    const words = line.words ?? [];
    if (words.length === 0) return [];
    const first = Math.min(...words.map((word) => word.startSec));
    return [Math.abs(line.startSec - first)];
  });
  const textLines = lines.filter((line) => (line.text ?? "").trim().length > 0);
  const linesWithoutWords = textLines.filter(
    (line) => (line.words?.length ?? 0) === 0,
  );
  const wordTimingCoverage =
    (textLines.length - linesWithoutWords.length) / Math.max(1, textLines.length);
  const predictedBoundaries = lines.flatMap((line, index) =>
    index > 0 && line.speaker !== lines[index - 1]!.speaker
      ? [line.startSec]
      : [],
  );
  const goldBoundaries = referenceTurns.slice(1).map((turn) => turn.startSec);
  const speakerBoundary =
    referenceTurns.length > 1
      ? boundaryF1(predictedBoundaries, goldBoundaries)
      : null;
  const reversedWords = lines.reduce((count, line) => {
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
  const summaryEvidence = summarySentences(product.timeline?.overallSummary ?? "").map(
    (sentence) => sentenceSupport(sentence, rawText),
  );
  // 분석 모드는 화자분리 사용 여부가 아니다. 빠른/정밀 모두 동일한
  // 정답 노트로 평가할 때는 모델 이름이 아니라 실제 복구된 화자 수를 본다.
  const referenceSpeakerGate =
    expectedSpeakers.length === 0 ||
    dialogueSpeakers.length === expectedSpeakers.length;
  const clickP95 = percentile(clickErrors, 0.95);
  const lineP95 = percentile(lengths, 0.95) ?? 0;
  const gates = {
    sourceFidelity: dense(lineTexts.join(" ")) === dense(rawText),
    readableBubbles:
      Math.max(0, ...lengths) <= MAX_BUBBLE_CHARS && lineP95 <= P95_BUBBLE_CHARS,
    noOrphanDuplicates: duplicateBubbles.length === 0,
    participantsGrounded: ungroundedParticipants.length === 0,
    referenceSpeakerCount: referenceSpeakerGate,
    speakerTransitions:
      speakerBoundary == null || speakerBoundary.f1 >= SPEAKER_BOUNDARY_F1_MIN,
    summaryEvidence:
      summaryEvidence.length > 0 && summaryEvidence.every((item) => item.passed),
    clickTiming:
      (product.analysisMode !== "precision" || wordTimingCoverage === 1) &&
      (clickP95 == null || (clickP95 <= CLICK_P95_MAX_SEC && reversedWords === 0)),
  };
  return {
    path,
    id: product.id,
    mode: product.analysisMode,
    lineCount: lines.length,
    bubbleChars: {
      max: Math.max(0, ...lengths),
      p95: lineP95,
      limits: { max: MAX_BUBBLE_CHARS, p95: P95_BUBBLE_CHARS },
    },
    duplicateBubbles,
    speakers: {
      referenceNames: expectedSpeakers,
      dialogue: dialogueSpeakers,
      participants: participantNames,
      ungroundedParticipants,
      transitionBoundary: speakerBoundary,
      note:
        "빠른/정밀 모드는 화자분리 여부를 뜻하지 않으므로, 정답 노트가 있으면 두 모드 모두 정답 화자 수와 비교",
    },
    timing: {
      linesWithWords: clickErrors.length,
      clickStartMaeSec:
        clickErrors.length > 0
          ? clickErrors.reduce((sum, value) => sum + value, 0) / clickErrors.length
          : null,
      clickStartP95Sec: clickP95,
      reversedWords,
      wordTimingCoverage,
      linesWithoutWords: linesWithoutWords.map((line) => ({
        startSec: line.startSec,
        speaker: line.speaker,
        text: line.text,
      })),
      goldWordMaeAvailable: false,
      note:
        "현재 정답 txt에는 단어 절대 시각이 없어 제품 내부 클릭 오차만 측정. Clova JSON 원본이 들어오면 gold 시작/끝 MAE를 활성화해야 함",
    },
    summaryEvidence: {
      threshold: SUMMARY_SUPPORT_MIN,
      sentenceSupportRate:
        summaryEvidence.filter((item) => item.passed).length /
        Math.max(1, summaryEvidence.length),
      sentences: summaryEvidence,
    },
    gates,
    passed: Object.values(gates).every(Boolean),
  };
}

function main() {
  const title = arg("--title") ?? "brief-ailab";
  const referencePath = arg("--reference") ?? DEFAULT_REFERENCE;
  const standardPath = arg("--standard") ?? latestSnapshot(title, "standard");
  const precisionPath = arg("--precision") ?? latestSnapshot(title, "precision");
  const reference = readFileSync(referencePath, "utf8");
  const referenceTurns = clovaReferenceTurns(reference);
  const namedSpeakers = referenceSpeakerNames(reference, 900);
  const expectedSpeakers =
    namedSpeakers.length > 0
      ? namedSpeakers
      : [...new Set(referenceTurns.map((turn) => turn.speakerId))];
  const results = [
    evaluate(standardPath, expectedSpeakers, referenceTurns),
    evaluate(precisionPath, expectedSpeakers, referenceTurns),
  ];
  const report = {
    generatedAt: new Date().toISOString(),
    title,
    referencePath,
    expectedSpeakers,
    goldAvailability: {
      speakerIds: expectedSpeakers.length > 0,
      speakerAbsoluteTimes: referenceTurns.length > 0,
      wordAbsoluteTimes: false,
      note:
        referenceTurns.length > 0
          ? "Clova Note txt의 참석자 ID와 절대 시작 시각을 복구해 화자 전환 boundary F1에 사용. 단어 절대 시각은 txt에 없어 추정값을 정답으로 쓰지 않음."
          : "이 reference.txt에는 참석자 절대 시각이 없어 화자 전환 F1을 계산하지 않음. 없는 시각을 추정값으로 정답 취급하지 않는다.",
      referenceTurns,
    },
    results,
    deploymentGatePassed: results.every((result) => result.passed),
  };
  mkdirSync(OUT, { recursive: true });
  const outputPath = join(OUT, `${title}.json`);
  writeFileSync(outputPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({ ...report, outputPath: basename(outputPath) }, null, 2));
  if (!report.deploymentGatePassed) process.exitCode = 1;
}

main();
