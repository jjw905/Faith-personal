import { readFile } from "fs/promises";
import { join } from "path";

export type DailyEvalVariantSummary = {
  variant: string;
  clips: number;
  durationSec: number;
  cer: number;
  wer: number;
  properNounBwer: number;
  cpWer: number;
  droppedTurns: number;
  turnCoverage: number;
  omissionRate: number;
  hallucinationRate: number;
  krwPerMinute: number;
  estimatedUsd: number;
  apiDroppedTurns?: number | null;
  meanFirstDeltaMs?: number | null;
  meanLatencyMs?: number | null;
  costUnderKrw12?: boolean | null;
};

export type DailyEvalCompare = {
  generatedAt: string | null;
  dataset: string;
  license: string;
  split: string;
  contaminationRule: string;
  upload: DailyEvalVariantSummary | null;
  realtime: DailyEvalVariantSummary | null;
  uploadPath: string;
  realtimePath: string;
  model: string | null;
  realtimeVad: string | null;
  gates: Record<string, boolean | null> | null;
};

const RESULTS_DIR = join(
  process.cwd(),
  ".data/stt-bench/daily-video/results",
);

async function readJson<T>(name: string): Promise<T | null> {
  try {
    const raw = await readFile(join(RESULTS_DIR, name), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function pickSummary(
  row: Partial<DailyEvalVariantSummary> & { variant?: string },
  fallbackVariant: string,
): DailyEvalVariantSummary {
  return {
    variant: row.variant ?? fallbackVariant,
    clips: Number(row.clips ?? 0),
    durationSec: Number(row.durationSec ?? 0),
    cer: Number(row.cer ?? 0),
    wer: Number(row.wer ?? 0),
    properNounBwer: Number(row.properNounBwer ?? 0),
    cpWer: Number(row.cpWer ?? 0),
    droppedTurns: Number(row.droppedTurns ?? 0),
    turnCoverage: Number(row.turnCoverage ?? 0),
    omissionRate: Number(row.omissionRate ?? 0),
    hallucinationRate: Number(row.hallucinationRate ?? 0),
    krwPerMinute: Number(row.krwPerMinute ?? 0),
    estimatedUsd: Number(row.estimatedUsd ?? 0),
    apiDroppedTurns:
      row.apiDroppedTurns === undefined ? null : Number(row.apiDroppedTurns),
    meanFirstDeltaMs:
      row.meanFirstDeltaMs === undefined || row.meanFirstDeltaMs === null
        ? null
        : Number(row.meanFirstDeltaMs),
    meanLatencyMs:
      row.meanLatencyMs === undefined || row.meanLatencyMs === null
        ? null
        : Number(row.meanLatencyMs),
    costUnderKrw12:
      row.costUnderKrw12 === undefined ? null : Boolean(row.costUnderKrw12),
  };
}

/** 로컬 개발용. 결과 JSON의 요약만 읽고 rows/전사는 제외. */
export async function loadDailyEvalCompare(): Promise<DailyEvalCompare> {
  type UploadFile = {
    generatedAt?: string;
    dataset?: string;
    license?: string;
    split?: string;
    contaminationRule?: string;
    summaries?: Array<Partial<DailyEvalVariantSummary> & { variant?: string }>;
    gates?: Record<string, boolean | null>;
  };
  type RealtimeFile = {
    generatedAt?: string;
    dataset?: string;
    license?: string;
    split?: string;
    model?: string;
    path?: string;
    contaminationRule?: string;
    summary?: Partial<DailyEvalVariantSummary> & { variant?: string };
  };

  const [uploadFile, realtimeFile] = await Promise.all([
    readJson<UploadFile>("dev-baseline-current.json"),
    readJson<RealtimeFile>("dev-realtime.json"),
  ]);

  const uploadRow =
    uploadFile?.summaries?.find((s) => s.variant === "current") ??
    uploadFile?.summaries?.[0] ??
    null;

  return {
    generatedAt: realtimeFile?.generatedAt ?? uploadFile?.generatedAt ?? null,
    dataset: realtimeFile?.dataset ?? uploadFile?.dataset ?? "KMSAV",
    license: realtimeFile?.license ?? uploadFile?.license ?? "",
    split: realtimeFile?.split ?? uploadFile?.split ?? "dev",
    contaminationRule:
      realtimeFile?.contaminationRule ??
      uploadFile?.contaminationRule ??
      "",
    upload: uploadRow ? pickSummary(uploadRow, "current") : null,
    realtime: realtimeFile?.summary
      ? pickSummary(realtimeFile.summary, "realtime")
      : null,
    uploadPath: "chunkedTranscribe",
    realtimePath: realtimeFile?.path ?? "realtimeTranscribeFile",
    model: realtimeFile?.model ?? "gpt-4o-mini-transcribe",
    realtimeVad: "server_vad",
    gates: uploadFile?.gates ?? null,
  };
}
