/**
 * Community-1 legacy generalization diagnostic.
 *
 * This is deliberately cache-only. It compares immutable server manifests with
 * Clova speaker/time references from fixtures that were not used for the KTV
 * model choice. A run without absolute speaker timestamps is never counted as
 * a pass.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

type Segment = { startSec: number; endSec: number; speaker: string };
type Manifest = {
  id: string;
  fixtureId: string;
  model: string;
  modelVersion?: string;
  durationSec: number;
  speakerCount: number;
  segments: Segment[];
  runtime?: { wallMs?: number; inferenceMs?: number; device?: string };
  cost?: { estimatedUsd?: number; paidApi?: boolean };
};
type GoldTurn = { speaker: string; startSec: number; endSec: number };

const ROOT = process.cwd();
const ANSWERS = join(
  ROOT,
  "Faith-office/08_검증_정답셋/Faith_브리핑_클로바_정답셋_2026-08-03/02_clova노트_정답",
);
const RUNS = join(ROOT, ".data/stt-bench/model-lab/runs");
const DEFAULT_OUTPUT = join(
  ROOT,
  ".data/stt-bench/model-lab/community1-generalization.json",
);
const BOUNDARY_TOLERANCE_SEC = 2;
const LEGACY_METRIC_SCOPE = "legacy_diagnostic_only" as const;

const fixtures = [
  {
    id: "brief-startup",
    durationSec: 900.003,
    answer: join(ANSWERS, "brief-startup.clova.txt"),
    manifest: join(
      RUNS,
      "20260804T1421-brief-startup-community1-generalization.json",
    ),
  },
  {
    id: "brief-mou",
    durationSec: 272.256,
    answer: join(ANSWERS, "brief-mou.clova.txt"),
    manifest: join(
      RUNS,
      "20260804T1421-brief-mou-community1-generalization.json",
    ),
  },
] as const;

function round(value: number, places = 3): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function overlap(left: { startSec: number; endSec: number }, right: GoldTurn) {
  return Math.max(
    0,
    Math.min(left.endSec, right.endSec) -
      Math.max(left.startSec, right.startSec),
  );
}

function parseGold(path: string, durationSec: number): GoldTurn[] {
  const starts: Array<{ speaker: string; startSec: number }> = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const match = line
      .replace(/^\uFEFF/u, "")
      .trim()
      .match(/^참석자\s+(\d+)\s+(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/u);
    if (!match) continue;
    const speaker = `참석자 ${match[1]}`;
    const startSec =
      Number(match[2] ?? 0) * 3600 + Number(match[3]) * 60 + Number(match[4]);
    if (starts.at(-1)?.speaker === speaker) continue;
    starts.push({ speaker, startSec });
  }
  return starts.map((turn, index) => ({
    ...turn,
    endSec: starts[index + 1]?.startSec ?? durationSec,
  }));
}

function predictedBoundaries(segments: Segment[]): number[] {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec);
  const result: number[] = [];
  let previous: string | undefined;
  for (const segment of ordered) {
    if (previous && previous !== segment.speaker) result.push(segment.startSec);
    previous = segment.speaker;
  }
  return result;
}

function boundaryMetrics(predicted: number[], gold: number[]) {
  const used = new Set<number>();
  const usedPredicted = new Set<number>();
  const errors: number[] = [];
  for (const [predictedIndex, boundary] of predicted.entries()) {
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
      usedPredicted.add(predictedIndex);
      errors.push(bestError);
    }
  }
  const precision = errors.length / Math.max(1, predicted.length);
  const recall = errors.length / Math.max(1, gold.length);
  return {
    toleranceSec: BOUNDARY_TOLERANCE_SEC,
    predicted: predicted.length,
    gold: gold.length,
    matched: errors.length,
    precision: round(precision),
    recall: round(recall),
    f1: round(
      precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : 0,
    ),
    meanMatchedErrorSec: round(
      errors.reduce((sum, value) => sum + value, 0) /
        Math.max(1, errors.length),
    ),
    missedGoldSec: gold.filter((_, index) => !used.has(index)),
    extraPredictedSec: predicted.filter(
      (_, index) => !usedPredicted.has(index),
    ),
  };
}

function bestOneToOneScore(matrix: number[][]): number {
  const memo = new Map<string, number>();
  function visit(predictedIndex: number, usedGold: number): number {
    if (predictedIndex >= matrix.length) return 0;
    const key = `${predictedIndex}:${usedGold}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let best = visit(predictedIndex + 1, usedGold);
    for (
      let goldIndex = 0;
      goldIndex < (matrix[0]?.length ?? 0);
      goldIndex += 1
    ) {
      const bit = 1 << goldIndex;
      if ((usedGold & bit) !== 0) continue;
      best = Math.max(
        best,
        matrix[predictedIndex]![goldIndex]! +
          visit(predictedIndex + 1, usedGold | bit),
      );
    }
    memo.set(key, best);
    return best;
  }
  return visit(0, 0);
}

function identityMetrics(segments: Segment[], turns: GoldTurn[]) {
  const predictedSpeakers = [...new Set(segments.map((item) => item.speaker))];
  const goldSpeakers = [...new Set(turns.map((item) => item.speaker))];
  const matrix = predictedSpeakers.map((predicted) =>
    goldSpeakers.map((gold) =>
      segments
        .filter((segment) => segment.speaker === predicted)
        .reduce(
          (sum, segment) =>
            sum +
            turns
              .filter((turn) => turn.speaker === gold)
              .reduce((nested, turn) => nested + overlap(segment, turn), 0),
          0,
        ),
    ),
  );
  const scoredSpeechSec = matrix.reduce(
    (sum, row) => sum + row.reduce((nested, value) => nested + value, 0),
    0,
  );
  const oneToOneCorrectSec = bestOneToOneScore(matrix);
  const clusterPuritySec = matrix.reduce(
    (sum, row) => sum + Math.max(0, ...row),
    0,
  );
  const goldCoverageSec = goldSpeakers.reduce((sum, _, goldIndex) => {
    return sum + Math.max(0, ...matrix.map((row) => row[goldIndex] ?? 0));
  }, 0);
  return {
    scoredSpeechSec: round(scoredSpeechSec),
    oneToOneAccuracy: round(oneToOneCorrectSec / Math.max(1, scoredSpeechSec)),
    clusterPurity: round(clusterPuritySec / Math.max(1, scoredSpeechSec)),
    speakerCoverage: round(goldCoverageSec / Math.max(1, scoredSpeechSec)),
  };
}

function evaluate(
  manifest: Manifest,
  answerPath: string,
  expected: { id: string; durationSec: number },
) {
  const goldTurns = parseGold(answerPath, expected.durationSec);
  const goldSpeakers = [...new Set(goldTurns.map((turn) => turn.speaker))];
  const goldBoundaries = goldTurns.slice(1).map((turn) => turn.startSec);
  const boundary = boundaryMetrics(
    predictedBoundaries(manifest.segments),
    goldBoundaries,
  );
  const identity = identityMetrics(manifest.segments, goldTurns);
  const maxSegmentEndSec = Math.max(
    0,
    ...manifest.segments.map((segment) => segment.endSec),
  );
  const gates = {
    exactSpeakerCount: manifest.speakerCount === goldSpeakers.length,
    boundaryRecall: boundary.recall >= 0.8,
    boundaryF1: boundary.f1 >= 0.75,
    oneToOneIdentity: identity.oneToOneAccuracy >= 0.9,
    noPaidApi: manifest.cost?.paidApi !== true,
    inputSpanPlausible:
      maxSegmentEndSec >= expected.durationSec * 0.8 &&
      maxSegmentEndSec <= expected.durationSec + 2,
  };
  return {
    metricScope: LEGACY_METRIC_SCOPE,
    boundaryF1Role: "legacy_diagnostic_only",
    notPilotGold: true,
    fixtureId: expected.id,
    runId: manifest.id,
    model: manifest.model,
    modelVersion: manifest.modelVersion,
    durationSec: expected.durationSec,
    manifestMetadata: {
      recordedFixtureId: manifest.fixtureId,
      recordedDurationSec: manifest.durationSec,
      expectedFixtureId: expected.id,
      expectedDurationSec: expected.durationSec,
      valid:
        manifest.fixtureId === expected.id &&
        Math.abs(manifest.durationSec - expected.durationSec) <= 0.1,
      note:
        manifest.fixtureId === expected.id &&
        Math.abs(manifest.durationSec - expected.durationSec) <= 0.1
          ? undefined
          : "legacy server runner r3 metadata bug; raw segments remain unmodified",
    },
    gold: {
      source: answerPath.slice(ROOT.length + 1),
      speakerCount: goldSpeakers.length,
      turnCount: goldTurns.length,
      boundaryCount: goldBoundaries.length,
      timestampQuality: "clova-speaker-absolute-seconds",
    },
    predicted: {
      speakerCount: manifest.speakerCount,
      segmentCount: manifest.segments.length,
    },
    boundary,
    identity,
    runtime: manifest.runtime,
    cost: manifest.cost,
    gates,
    passed: Object.values(gates).every(Boolean),
  };
}

function markdown(report: ReturnType<typeof buildReport>): string {
  const rows = report.fixtures.map(
    (item) =>
      `| ${item.fixtureId} | ${item.gold.speakerCount} | ${item.predicted.speakerCount} | ${item.boundary.f1.toFixed(3)} | ${item.boundary.recall.toFixed(3)} | ${item.identity.oneToOneAccuracy.toFixed(3)} | ${item.identity.clusterPurity.toFixed(3)} | ${item.passed ? "통과" : "실패"} |`,
  );
  return [
    "# Community-1 미지 영상 일반화 검증 (legacy diagnostic)",
    "",
    `생성: ${report.generatedAt}`,
    "",
    "이 평가는 모델 선택에 쓰지 않은 Clova 절대 화자 시각만 사용한다. 정답 시각이 없는 실행은 포함하지 않는다. boundary F1·1:1 identity는 legacy 진단값이며 새 파일럿 gold 지표가 아니다.",
    "",
    "| fixture | 정답 화자 | 예측 화자 | 경계 F1 | 경계 재현율 | 1:1 화자 정확도 | cluster 순도 | 판정 |",
    "|---|---:|---:|---:|---:|---:|---:|---|",
    ...rows,
    "",
    `legacy 판정: **${report.passed ? "Community-1 단독 후보 일반화 통과" : "Community-1 단독 확정 보류"}**`,
    "",
    "통과 조건은 화자 수 일치, 2초 허용 경계 재현율 0.80 이상, 경계 F1 0.75 이상, 1:1 화자 정확도 0.90 이상, 유료 API 미사용이다.",
    "",
  ].join("\n");
}

function buildReport() {
  const missing = fixtures.flatMap((fixture) =>
    [fixture.answer, fixture.manifest].filter((path) => !existsSync(path)),
  );
  if (missing.length > 0) {
    throw new Error(`missing cache/gold files:\n${missing.join("\n")}`);
  }
  const results = fixtures.map((fixture) =>
    evaluate(
      JSON.parse(readFileSync(fixture.manifest, "utf8")) as Manifest,
      fixture.answer,
      fixture,
    ),
  );
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evaluation: "cache-only",
    metricScope: LEGACY_METRIC_SCOPE,
    boundaryF1Role: "legacy_diagnostic_only",
    notPilotGold: true,
    fixtures: results,
    passed: results.every((result) => result.passed),
  };
}

const report = buildReport();
mkdirSync(dirname(DEFAULT_OUTPUT), { recursive: true });
writeFileSync(DEFAULT_OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(DEFAULT_OUTPUT.replace(/\.json$/u, ".md"), markdown(report));
console.log(markdown(report));
