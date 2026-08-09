/**
 * Faith 음성 모델 실험 장부.
 *
 * 기존 캐시와 model-lab/runs 아래의 불변 실행 manifest를 같은 KTV 정답으로
 * 다시 평가한다. 기본 실행은 API를 호출하거나 모델을 다운로드하지 않는다.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import {
  glueBoundaryFragmentSpeakers,
  prunePhantomSpeakers,
  type DiarizationResult,
} from "../src/lib/stt/diarization";

type Task = "asr" | "diarization" | "alignment";
type RunStatus = "completed" | "failed" | "cached";

type Segment = {
  startSec: number;
  endSec: number;
  speaker: string;
};

type RunManifest = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  task: Task;
  model: string;
  modelVersion?: string;
  fixtureId: "ktv-briefing-20251231" | string;
  status: RunStatus;
  diarizationStage?: "raw-model" | "product-postprocessed" | "unknown-cache";
  runtime?: {
    device?: string;
    wallMs?: number;
    peakRssMb?: number;
    provider?: string;
    region?: string;
    machineType?: string;
  };
  cost?: {
    estimatedUsd: number;
    paidApi: boolean;
  };
  privacy: {
    execution:
      | "local-offline"
      | "rented-cloud-offline"
      | "external-api"
      | "unknown-cache";
    audioSentExternally: boolean;
  };
  license?: string;
  artifacts?: {
    transcriptPath?: string;
    diarizationPath?: string;
  };
  error?: string;
  notes?: string[];
  durationSec?: number;
};

const ROOT = ".data/stt-bench";
const LAB = join(ROOT, "model-lab");
const RUNS = join(LAB, "runs");
const FIXTURE_ID = "ktv-briefing-20251231";
const REFERENCE = join(ROOT, "ktv__reference.txt");
const DURATION_SEC = 704.34;
const BOUNDARY_TOLERANCE_SEC = 2;
const LEGACY_METRIC_SCOPE = "legacy_diagnostic_only" as const;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z가-힣]/gu, "");
}

function cleanReference(raw: string): string {
  return raw
    .replace(/^\uFEFF/u, "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^참석자\s+\d+\s+\d{2}:\d{2}$/u.test(line) &&
        !/^\d{4}\.\d{2}\.\d{2}/u.test(line) &&
        !/^ktv-briefing/u.test(line.toLowerCase()) &&
        line !== "조진원" &&
        line !== "clovanote.naver.com",
    )
    .join(" ");
}

function charErrorRate(reference: string, hypothesis: string): number {
  const expected = normalize(reference);
  const actual = normalize(hypothesis);
  if (!expected) return actual ? 1 : 0;
  const row = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let left = 1; left <= expected.length; left += 1) {
    let diagonal = row[0]!;
    row[0] = left;
    for (let right = 1; right <= actual.length; right += 1) {
      const previous = row[right]!;
      row[right] = Math.min(
        row[right]! + 1,
        row[right - 1]! + 1,
        diagonal + Number(expected[left - 1] !== actual[right - 1]),
      );
      diagonal = previous;
    }
  }
  return row[actual.length]! / expected.length;
}

function phraseMetrics(text: string) {
  const value = normalize(text);
  const probes = {
    hostName: ["이규연"],
    hostRole: ["홍보소통수석"],
    firstReporter: ["한국일보", "이성택"],
    fourthReporter: ["뉴시스", "김영록"],
    closingPhrase: ["글쎄요"],
  };
  const checks = Object.fromEntries(
    Object.entries(probes).map(([key, terms]) => [
      key,
      terms.every((term) => value.includes(normalize(term))),
    ]),
  );
  const passed = Object.values(checks).filter(Boolean).length;
  return { checks, recall: passed / Object.keys(checks).length };
}

function referenceBoundaries(raw: string): number[] {
  const starts: number[] = [];
  let previousSpeaker: string | undefined;
  for (const line of raw.split(/\r?\n/u)) {
    const marker = line.trim().match(/^참석자\s+(\d+)\s+(\d{2}):(\d{2})$/u);
    if (!marker) continue;
    const speaker = marker[1];
    const startSec = Number(marker[2]) * 60 + Number(marker[3]);
    if (previousSpeaker && speaker !== previousSpeaker && startSec > 0) starts.push(startSec);
    previousSpeaker = speaker;
  }
  return starts;
}

function predictedBoundaries(segments: Segment[]): number[] {
  const ordered = [...segments].sort((a, b) => a.startSec - b.startSec);
  const boundaries: number[] = [];
  let previous: string | undefined;
  for (const segment of ordered) {
    if (previous && segment.speaker !== previous) boundaries.push(segment.startSec);
    previous = segment.speaker;
  }
  return boundaries;
}

function boundaryMetrics(predicted: number[], gold: number[]) {
  const used = new Set<number>();
  let matched = 0;
  for (const boundary of predicted) {
    let best = -1;
    let bestError = Number.POSITIVE_INFINITY;
    gold.forEach((target, index) => {
      const error = Math.abs(boundary - target);
      if (!used.has(index) && error <= BOUNDARY_TOLERANCE_SEC && error < bestError) {
        best = index;
        bestError = error;
      }
    });
    if (best >= 0) {
      used.add(best);
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
    f1: precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0,
  };
}

function cachedRuns(): RunManifest[] {
  const asr = [
    {
      id: "cache-gpt-transcribe-one-shot",
      model: "gpt-transcribe",
      path: join(ROOT, "new-transcribe-compare", "gpt-transcribe.txt"),
      usd: (DURATION_SEC / 60) * 0.006,
    },
    {
      id: "cache-gpt-transcribe-forced-words",
      model: "gpt-transcribe+forced-word-timings",
      path: join(
        ROOT,
        "new-transcribe-compare",
        "gpt-transcribe-forced-words.json",
      ),
      usd: (DURATION_SEC / 60) * 0.006,
      notes: ["PRIMARY 원문을 바꾸지 않은 강제정렬 단어 근거"],
    },
    {
      id: "cache-gpt-transcribe-product",
      model: "gpt-transcribe-product-pipeline",
      path: join(ROOT, "new-transcribe-compare", "gpt-transcribe-product-stt.json"),
      usd: (DURATION_SEC / 60) * 0.006,
    },
    {
      id: "cache-gpt-4o-transcribe",
      model: "gpt-4o-transcribe",
      path: join(ROOT, "ktv__gpt-4o-transcribe__raw.txt"),
      usd: (DURATION_SEC / 60) * 0.006,
    },
    {
      id: "cache-gpt-4o-mini-transcribe",
      model: "gpt-4o-mini-transcribe",
      path: join(ROOT, "ktv__gpt-4o-mini-transcribe__raw.txt"),
      usd: (DURATION_SEC / 60) * 0.003,
    },
    {
      id: "cache-whisper-1",
      model: "whisper-1",
      path: join(ROOT, "ktv__whisper-1__raw.txt"),
      usd: (DURATION_SEC / 60) * 0.006,
    },
  ].filter((item) => existsSync(item.path));

  const diarization = [
    {
      id: "cache-sherpa-default",
      model: "sherpa-pyannote-segmentation-3.0+3D-Speaker",
      path: join(ROOT, "ktv__local-diarization.json"),
      notes: ["기본 로컬 캐시"],
    },
    {
      id: "cache-sherpa-threshold-0.85",
      model: "sherpa-pyannote-segmentation-3.0+3D-Speaker",
      path: join(ROOT, "ktv__titanet-085-diarization.json"),
      notes: ["speaker threshold 0.85 실험"],
    },
    {
      id: "cache-community-1",
      model: "pyannote/speaker-diarization-community-1",
      path: join(ROOT, "ktv__community1-diarization.json"),
      notes: ["CPU 전체 파일 실험"],
    },
  ].filter((item) => existsSync(item.path));

  return [
    ...asr.map((item) => ({
      schemaVersion: 1 as const,
      id: item.id,
      createdAt: "cache",
      task: "asr" as const,
      model: item.model,
      fixtureId: FIXTURE_ID,
      status: "cached" as const,
      cost: { estimatedUsd: item.usd, paidApi: true },
      privacy: {
        execution: "external-api" as const,
        audioSentExternally: true,
      },
      artifacts: { transcriptPath: item.path },
      notes: "notes" in item ? item.notes : undefined,
    })),
    ...diarization.map((item) => ({
      schemaVersion: 1 as const,
      id: item.id,
      createdAt: "cache",
      task: "diarization" as const,
      model: item.model,
      fixtureId: FIXTURE_ID,
      status: "cached" as const,
      diarizationStage: "unknown-cache" as const,
      cost: { estimatedUsd: 0, paidApi: false },
      privacy: {
        execution: "local-offline" as const,
        audioSentExternally: false,
      },
      license: item.model.startsWith("pyannote/") ? "CC-BY-4.0" : "mixed-open-models",
      artifacts: { diarizationPath: item.path },
      notes: item.notes,
    })),
  ];
}

function loadRunManifests(): RunManifest[] {
  if (!existsSync(RUNS)) return [];
  return readdirSync(RUNS)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(RUNS, name), "utf8")) as RunManifest);
}

function transcriptFrom(path: string): string {
  const raw = readFileSync(path, "utf8");
  if (!path.endsWith(".json")) return raw;
  const value = JSON.parse(raw) as {
    text?: string;
    transcript?: string;
    words?: Array<{ text?: string }>;
  };
  return (
    value.text ??
    value.transcript ??
    value.words?.map((word) => word.text?.trim()).filter(Boolean).join(" ") ??
    ""
  );
}

function diarizationFrom(path: string): { segments: Segment[]; wallMs?: number; device?: string } {
  const value = JSON.parse(readFileSync(path, "utf8")) as {
    segments?: Segment[];
    wallMs?: number;
    device?: string;
  };
  return { segments: value.segments ?? [], wallMs: value.wallMs, device: value.device };
}

function round(value: number, places = 4): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function speakerAt(segments: Segment[], timeSec: number): string | null {
  const containing = segments
    .filter(
      (segment) => segment.startSec <= timeSec && segment.endSec >= timeSec,
    )
    .sort(
      (left, right) =>
        right.endSec - right.startSec - (left.endSec - left.startSec),
    );
  if (containing[0]) return containing[0].speaker;

  const nearest = [...segments]
    .map((segment) => ({
      speaker: segment.speaker,
      distance: Math.min(
        Math.abs(segment.startSec - timeSec),
        Math.abs(segment.endSec - timeSec),
      ),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
  return nearest && nearest.distance <= 0.75 ? nearest.speaker : null;
}

/** KTV에서 실제로 회귀했던 짧은 진행자 호명과 기자 자기소개를 별도 검사한다. */
function ktvCriticalHandoff(segments: Segment[]) {
  const hostBefore = speakerAt(segments, 100);
  const hostCall = speakerAt(segments, 116.5);
  const firstReporter = speakerAt(segments, 120.5);
  const fourthReporter = speakerAt(segments, 297);
  return {
    speakers: { hostBefore, hostCall, firstReporter, fourthReporter },
    hostCallSameAsHost:
      hostBefore != null && hostCall != null && hostBefore === hostCall,
    firstReporterDifferentFromHost:
      hostBefore != null &&
      firstReporter != null &&
      hostBefore !== firstReporter,
    fourthReporterDifferentFromHost:
      hostBefore != null &&
      fourthReporter != null &&
      hostBefore !== fourthReporter,
  };
}

function evaluateRun(run: RunManifest, reference: string, goldBoundaries: number[]) {
  const base = {
    ...run,
    privacy: {
      ...run.privacy,
      audioSentExternally:
        run.privacy.execution === "rented-cloud-offline"
          ? true
          : run.privacy.audioSentExternally,
    },
    runtime: run.runtime
      ? {
          ...run.runtime,
          realtimeFactor:
            run.runtime.wallMs == null
              ? null
              : round(run.runtime.wallMs / 1000 / DURATION_SEC),
        }
      : undefined,
  };
  if (run.status === "failed") return base;
  if (run.task === "asr" && run.artifacts?.transcriptPath) {
    const text = transcriptFrom(run.artifacts.transcriptPath);
    return {
      ...base,
      metrics: {
        chars: text.length,
        cer: round(charErrorRate(reference, text)),
        phrases: phraseMetrics(text),
      },
    };
  }
  if (run.task === "diarization" && run.artifacts?.diarizationPath) {
    const result = diarizationFrom(run.artifacts.diarizationPath);
    const rawSegments = result.segments;
    const durationSec =
      run.durationSec ??
      (run.fixtureId === FIXTURE_ID
        ? DURATION_SEC
        : Math.max(1, ...rawSegments.map((segment) => segment.endSec)));
    const runtime = {
      ...run.runtime,
      device: run.runtime?.device ?? result.device,
      wallMs: run.runtime?.wallMs ?? result.wallMs,
    };
    const shouldApplyProductPostprocess =
      run.model.includes("sherpa-") &&
      (run.diarizationStage === "raw-model" ||
        run.privacy.execution === "rented-cloud-offline");
    const productResult: DiarizationResult = shouldApplyProductPostprocess
      ? glueBoundaryFragmentSpeakers(
          prunePhantomSpeakers({
            model: run.model,
            device: runtime.device ?? "unknown",
            durationSec,
            wallMs: runtime.wallMs ?? 0,
            speakerCount: new Set(rawSegments.map((segment) => segment.speaker)).size,
            segments: rawSegments,
          }),
        )
      : {
          model: run.model,
          device: runtime.device ?? "unknown",
          durationSec,
          wallMs: runtime.wallMs ?? 0,
          speakerCount: new Set(rawSegments.map((segment) => segment.speaker)).size,
          segments: rawSegments,
        };
    const segments = productResult.segments;
    if (run.fixtureId !== FIXTURE_ID) {
      const isSingleSpeakerFixture = run.fixtureId.includes("single-speaker");
      const rawSpeakerCount = new Set(
        rawSegments.map((segment) => segment.speaker),
      ).size;
      const speakerCount = new Set(
        segments.map((segment) => segment.speaker),
      ).size;
      return {
        ...base,
        runtime: {
          ...runtime,
          realtimeFactor:
            runtime.wallMs == null
              ? null
              : round(runtime.wallMs / 1000 / durationSec),
        },
        metrics: {
          speakerCount,
          segmentCount: segments.length,
          ...(isSingleSpeakerFixture
            ? { singleSpeakerPass: speakerCount === 1 }
            : {}),
          raw: {
            speakerCount: rawSpeakerCount,
            segmentCount: rawSegments.length,
            ...(isSingleSpeakerFixture
              ? { singleSpeakerPass: rawSpeakerCount === 1 }
              : {}),
          },
        },
      };
    }
    const rawBoundary = boundaryMetrics(
      predictedBoundaries(rawSegments),
      goldBoundaries,
    );
    return {
      ...base,
      runtime: {
        ...runtime,
        realtimeFactor:
          runtime.wallMs == null ? null : round(runtime.wallMs / 1000 / DURATION_SEC),
      },
      metrics: {
        speakerCount: new Set(segments.map((segment) => segment.speaker)).size,
        segmentCount: segments.length,
        boundary: Object.fromEntries(
          Object.entries(boundaryMetrics(predictedBoundaries(segments), goldBoundaries)).map(
            ([key, value]) => [key, typeof value === "number" ? round(value) : value],
          ),
        ),
        raw: {
          speakerCount: new Set(rawSegments.map((segment) => segment.speaker)).size,
          segmentCount: rawSegments.length,
          boundary: Object.fromEntries(
            Object.entries(rawBoundary).map(([key, value]) => [
              key,
              typeof value === "number" ? round(value) : value,
            ]),
          ),
          criticalHandoff: ktvCriticalHandoff(rawSegments),
        },
        criticalHandoff: ktvCriticalHandoff(segments),
      },
    };
  }
  return base;
}

function markdown(rows: ReturnType<typeof evaluateRun>[]) {
  const asr = rows.filter((row) => row.task === "asr");
  const diarization = rows.filter((row) => row.task === "diarization");
  const failed = rows.filter((row) => row.status === "failed");
  const lines = [
    "# Faith 음성 모델 실험 장부",
    "",
    `생성: ${new Date().toISOString()}`,
    `fixture: ${FIXTURE_ID} (${DURATION_SEC.toFixed(2)}초)`,
    "평가 범위: legacy diagnostic — boundary F1은 새 파일럿 gold의 주지표가 아니다.",
    "",
    "## 전사",
    "",
    "| 모델 | CER | 핵심 구절 재현 | 시간 | API 비용 | 외부 전송 |",
    "|---|---:|---:|---:|---:|---|",
    ...asr.map((row) => {
      const metrics = "metrics" in row ? row.metrics as { cer?: number; phrases?: { recall: number } } : undefined;
      return `| ${row.model} | ${metrics?.cer?.toFixed(4) ?? "-"} | ${metrics?.phrases ? `${(metrics.phrases.recall * 100).toFixed(0)}%` : "-"} | ${row.runtime?.wallMs == null ? "-" : `${(row.runtime.wallMs / 1000).toFixed(1)}초`} | $${(row.cost?.estimatedUsd ?? 0).toFixed(4)} | ${row.privacy.audioSentExternally ? "예" : "아니오"} |`;
    }),
    "",
    "## 화자분리",
    "",
    "| fixture | 모델 | 화자 수 | 경계 F1 | 01:55 호명 | 1인 통과 | 시간 | RTF | 외부 전송 |",
    "|---|---|---:|---:|---|---|---:|---:|---|",
    ...diarization.map((row) => {
      const metrics = "metrics" in row ? row.metrics as {
        speakerCount?: number;
        boundary?: { f1?: number };
        criticalHandoff?: { hostCallSameAsHost?: boolean };
        singleSpeakerPass?: boolean;
      } : undefined;
      const fixture = row.fixtureId === FIXTURE_ID ? "KTV" : row.fixtureId;
      return `| ${fixture} | ${row.model}${row.id.includes("0.85") ? " (0.85)" : ""} | ${metrics?.speakerCount ?? "-"} | ${metrics?.boundary?.f1?.toFixed(3) ?? "-"} | ${metrics?.criticalHandoff ? (metrics.criticalHandoff.hostCallSameAsHost ? "통과" : "실패") : "-"} | ${metrics?.singleSpeakerPass == null ? "-" : metrics.singleSpeakerPass ? "통과" : "실패"} | ${row.runtime?.wallMs == null ? "-" : `${(row.runtime.wallMs / 1000).toFixed(1)}초`} | ${row.runtime?.realtimeFactor?.toFixed(3) ?? "-"} | ${row.privacy.audioSentExternally ? "예" : "아니오"} |`;
    }),
    ...(failed.length
      ? [
          "",
          "## 실패한 실험",
          "",
          ...failed.map((row) => `- ${row.model}: ${row.error ?? "원인 미기록"}`),
        ]
      : []),
    "",
    "새 실행은 `.data/stt-bench/model-lab/runs/<timestamp>-<model>.json`으로 추가한다. 기존 실행 manifest는 덮어쓰지 않는다.",
    "",
  ];
  return lines.join("\n");
}

function main() {
  mkdirSync(RUNS, { recursive: true });
  const rawReference = readFileSync(REFERENCE, "utf8");
  const reference = cleanReference(rawReference);
  const goldBoundaries = referenceBoundaries(rawReference);
  const manifests = [...cachedRuns(), ...loadRunManifests()];
  const ids = new Set<string>();
  for (const run of manifests) {
    if (ids.has(run.id)) throw new Error(`중복 실험 id: ${run.id}`);
    ids.add(run.id);
  }
  const rows = manifests.map((run) => evaluateRun(run, reference, goldBoundaries));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    metricScope: LEGACY_METRIC_SCOPE,
    boundaryF1Role: "legacy_diagnostic_only",
    notPilotGold: true,
    fixture: {
      id: FIXTURE_ID,
      durationSec: DURATION_SEC,
      referencePath: REFERENCE,
      goldSpeakerCount: 8,
      goldBoundaryCount: goldBoundaries.length,
    },
    runCount: rows.length,
    runs: rows,
  };
  const jsonPath = join(LAB, "summary.json");
  const mdPath = join(LAB, "summary.md");
  writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
  writeFileSync(mdPath, markdown(rows), "utf8");
  console.log(
    JSON.stringify(
      {
        ok: true,
        runCount: rows.length,
        jsonPath,
        mdPath,
        runFiles: existsSync(RUNS)
          ? readdirSync(RUNS).map((name) => basename(name)).length
          : 0,
      },
      null,
      2,
    ),
  );
}

main();
