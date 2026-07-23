import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { toFile } from "openai/uploads";

import { getOpenAIClient } from "@/lib/stt/openai";
import type { SttModel } from "@/lib/stt/models";
import {
  estimateSttUsdFromMinutes,
  estimateSttUsdFromTokens,
} from "@/lib/stt/pricing";
import type { TimedSegment } from "@/lib/stt/timed-segments";

export const CHUNK_SEC = 300;

export type SttUsageTotals = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedUsd: number;
  billSource: "tokens" | "audio_minutes" | "mixed";
};

function parseTranscriptionUsage(res: unknown): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} | null {
  const usage = (res as { usage?: Record<string, unknown> })?.usage;
  if (!usage || typeof usage !== "object") return null;

  const input =
    typeof usage.input_tokens === "number"
      ? usage.input_tokens
      : typeof usage.prompt_tokens === "number"
        ? usage.prompt_tokens
        : 0;
  const output =
    typeof usage.output_tokens === "number"
      ? usage.output_tokens
      : typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : 0;
  const total =
    typeof usage.total_tokens === "number"
      ? usage.total_tokens
      : input + output;

  if (input <= 0 && output <= 0 && total <= 0) return null;
  return {
    inputTokens: Math.max(0, input),
    outputTokens: Math.max(0, output),
    totalTokens: Math.max(0, total || input + output),
  };
}

export function probeDurationSec(audioPath: string): number {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      audioPath,
    ],
    { encoding: "utf8" },
  ).trim();
  const n = Number(out);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("오디오 길이를 읽지 못했습니다.");
  }
  return n;
}

function continuePrompt(prevText: string, chunkIndex: number, total: number) {
  const tail = prevText.replace(/\s+/g, " ").trim().slice(-800);
  return (
    `이 파일은 회의 녹음의 ${chunkIndex + 1}/${total} 구간이다. ` +
    `앞 구간에서 이어지는 발화를 처음부터 끝까지 빠짐없이 전사하라. 요약·생략 금지.\n` +
    `직전 전사 끝부분(문맥용):\n${tail}`
  );
}

function prepareChunks(
  audioPath: string,
  workDir: string,
  chunkSec: number,
): string[] {
  mkdirSync(workDir, { recursive: true });
  for (const f of readdirSync(workDir)) {
    if (f.endsWith(".mp3")) {
      rmSync(join(workDir, f), { force: true });
    }
  }

  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      audioPath,
      "-f",
      "segment",
      "-segment_time",
      String(chunkSec),
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      "-reset_timestamps",
      "1",
      join(workDir, "part_%03d.mp3"),
    ],
    { stdio: "pipe" },
  );

  return readdirSync(workDir)
    .filter((f) => f.startsWith("part_") && f.endsWith(".mp3"))
    .sort()
    .map((f) => join(workDir, f));
}

function parseVerboseSegments(
  res: unknown,
  offsetSec: number,
): TimedSegment[] {
  const segments = (res as { segments?: unknown })?.segments;
  if (!Array.isArray(segments)) return [];
  const out: TimedSegment[] = [];
  for (const s of segments) {
    const row = s as { start?: number; end?: number; text?: string };
    const text = (row.text || "").trim();
    if (!text) continue;
    const start = Number(row.start);
    const end = Number(row.end);
    if (!Number.isFinite(start)) continue;
    out.push({
      startSec: offsetSec + Math.max(0, start),
      endSec:
        offsetSec +
        (Number.isFinite(end) ? Math.max(start, end) : Math.max(0, start)),
      text,
    });
  }
  return out;
}

async function transcribeChunkText(
  model: SttModel,
  bytes: Buffer,
  filename: string,
  prompt: string | undefined,
): Promise<{
  text: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
  timed: TimedSegment[];
}> {
  const client = getOpenAIClient();
  const file = await toFile(bytes, filename);

  if (model === "whisper-1") {
    const res = await client.audio.transcriptions.create({
      model: "whisper-1",
      file,
      response_format: "verbose_json",
      timestamp_granularities: ["segment"],
      ...(prompt ? { prompt } : {}),
    });
    return {
      text: (res.text || "").trim(),
      usage: parseTranscriptionUsage(res),
      timed: parseVerboseSegments(res, 0),
    };
  }

  const res = await client.audio.transcriptions.create({
    model,
    file,
    ...(prompt ? { prompt } : {}),
  });
  return {
    text: (res.text || "").trim(),
    usage: parseTranscriptionUsage(res),
    timed: [],
  };
}

/** 4o 계열 텍스트 STT 후, whisper로 실측 구간 시각만 수집. */
async function timeChunkWithWhisper(
  bytes: Buffer,
  filename: string,
): Promise<{ timed: TimedSegment[]; durationBillSec: number }> {
  const client = getOpenAIClient();
  const file = await toFile(bytes, filename);
  const res = await client.audio.transcriptions.create({
    model: "whisper-1",
    file,
    response_format: "verbose_json",
    timestamp_granularities: ["segment"],
  });
  const durationBillSec =
    typeof (res as { duration?: number }).duration === "number"
      ? Number((res as { duration: number }).duration)
      : 0;
  return {
    timed: parseVerboseSegments(res, 0),
    durationBillSec,
  };
}

export type ChunkedTranscribeResult = {
  text: string;
  parts: string[];
  durationSec: number;
  chunkCount: number;
  usage: SttUsageTotals;
  /** whisper verbose 실측 세그먼트 (절대 초). */
  timedSegments: TimedSegment[];
};

/** STT 구간 내부 진행 (0–1). 청크 API 완료마다 갱신. */
export type ChunkedTranscribeProgress = {
  /** 0=시작, 1=전체 청크 완료 */
  fraction: number;
  chunkIndex: number;
  chunkCount: number;
  completedUnits: number;
  totalUnits: number;
  step: "probe" | "prepare" | "transcribe" | "timing" | "done";
};

/**
 * 길이 확인 → N분 청크 → 직전 문맥 prompt 이어전사 → 연결.
 * 시각: whisper-1은 본전사 verbose, 그 외 모델은 별도 whisper 타이밍 패스.
 */
export async function chunkedTranscribe(params: {
  audioPath: string;
  workDir: string;
  model: SttModel;
  chunkSec?: number;
  onProgress?: (p: ChunkedTranscribeProgress) => void;
}): Promise<ChunkedTranscribeResult> {
  const chunkSec = params.chunkSec ?? CHUNK_SEC;
  if (!existsSync(params.audioPath)) {
    throw new Error("오디오 파일이 없습니다.");
  }

  const report = (
    partial: Omit<
      ChunkedTranscribeProgress,
      "chunkIndex" | "chunkCount" | "completedUnits" | "totalUnits"
    > &
      Partial<
        Pick<
          ChunkedTranscribeProgress,
          "chunkIndex" | "chunkCount" | "completedUnits" | "totalUnits"
        >
      >,
  ) => {
    params.onProgress?.({
      chunkIndex: partial.chunkIndex ?? 0,
      chunkCount: partial.chunkCount ?? 0,
      completedUnits: partial.completedUnits ?? 0,
      totalUnits: partial.totalUnits ?? 0,
      fraction: partial.fraction,
      step: partial.step,
    });
  };

  report({ fraction: 0, step: "probe" });
  const durationSec = probeDurationSec(params.audioPath);
  report({ fraction: 0.04, step: "probe" });

  const chunks = prepareChunks(params.audioPath, params.workDir, chunkSec);
  if (chunks.length === 0) {
    throw new Error("청크 분할에 실패했습니다.");
  }

  const needsTiming = params.model !== "whisper-1";
  const unitsPerChunk = needsTiming ? 2 : 1;
  const totalUnits = chunks.length * unitsPerChunk;
  let completedUnits = 0;

  const sttFraction = (units: number) =>
    0.08 + (totalUnits <= 0 ? 0.92 : (units / totalUnits) * 0.92);

  report({
    fraction: 0.08,
    step: "prepare",
    chunkCount: chunks.length,
    totalUnits,
    completedUnits: 0,
  });

  const parts: string[] = [];
  const timedSegments: TimedSegment[] = [];
  let prev = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let hadTokenUsage = false;
  let timingAudioSec = 0;
  let offsetSec = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunkPath = chunks[i]!;
    const bytes = readFileSync(chunkPath);
    const chunkDur = probeDurationSec(chunkPath);
    const prompt =
      i === 0
        ? "회의 녹음 시작 구간이다. 처음부터 끝까지 빠짐없이 전사하라. 요약·생략 금지."
        : continuePrompt(prev, i, chunks.length);

    const { text, usage, timed } = await transcribeChunkText(
      params.model,
      bytes,
      `part_${i}.mp3`,
      prompt,
    );
    parts.push(text);
    prev = text;
    if (usage) {
      hadTokenUsage = true;
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      totalTokens += usage.totalTokens;
    }

    completedUnits += 1;
    report({
      fraction: sttFraction(completedUnits),
      step: "transcribe",
      chunkIndex: i,
      chunkCount: chunks.length,
      completedUnits,
      totalUnits,
    });

    let chunkTimed = timed.map((s) => ({
      ...s,
      startSec: s.startSec + offsetSec,
      endSec: s.endSec + offsetSec,
    }));

    if (needsTiming) {
      const timedPass = await timeChunkWithWhisper(bytes, `time_${i}.mp3`);
      timingAudioSec += timedPass.durationBillSec || chunkDur;
      chunkTimed = timedPass.timed.map((s) => ({
        ...s,
        startSec: s.startSec + offsetSec,
        endSec: s.endSec + offsetSec,
      }));
      completedUnits += 1;
      report({
        fraction: sttFraction(completedUnits),
        step: "timing",
        chunkIndex: i,
        chunkCount: chunks.length,
        completedUnits,
        totalUnits,
      });
    }

    timedSegments.push(...chunkTimed);
    offsetSec += chunkDur;
  }

  report({
    fraction: 1,
    step: "done",
    chunkIndex: Math.max(0, chunks.length - 1),
    chunkCount: chunks.length,
    completedUnits: totalUnits,
    totalUnits,
  });


  const minuteUsd = estimateSttUsdFromMinutes(params.model, durationSec);
  const tokenUsd = hadTokenUsage
    ? estimateSttUsdFromTokens(params.model, inputTokens, outputTokens)
    : null;
  const timingUsd =
    params.model === "whisper-1"
      ? 0
      : estimateSttUsdFromMinutes(
          "whisper-1",
          timingAudioSec > 0 ? timingAudioSec : durationSec,
        );

  let estimatedUsd = (tokenUsd != null && tokenUsd > 0 ? tokenUsd : minuteUsd) + timingUsd;
  let billSource: SttUsageTotals["billSource"] = "audio_minutes";
  if (tokenUsd != null && tokenUsd > 0) {
    billSource = timingUsd > 0 ? "mixed" : "tokens";
  } else if (hadTokenUsage && minuteUsd > 0) {
    billSource = "mixed";
  }

  return {
    text: parts.filter(Boolean).join("\n"),
    parts,
    durationSec,
    chunkCount: chunks.length,
    timedSegments,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedUsd,
      billSource,
    },
  };
}

/** Buffer를 임시 파일로 저장한 뒤 청크 STT. */
export async function chunkedTranscribeBuffer(params: {
  audioBytes: Buffer;
  filename: string;
  workDir: string;
  model: SttModel;
  chunkSec?: number;
  onProgress?: (p: ChunkedTranscribeProgress) => void;
}): Promise<ChunkedTranscribeResult> {
  mkdirSync(params.workDir, { recursive: true });
  const ext = params.filename.includes(".")
    ? params.filename.slice(params.filename.lastIndexOf("."))
    : ".bin";
  const audioPath = join(params.workDir, `source${ext}`);
  writeFileSync(audioPath, params.audioBytes);
  return chunkedTranscribe({
    audioPath,
    workDir: join(params.workDir, "chunks"),
    model: params.model,
    chunkSec: params.chunkSec,
    onProgress: params.onProgress,
  });
}
