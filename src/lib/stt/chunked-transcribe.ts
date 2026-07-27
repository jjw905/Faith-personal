import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { toFile } from "openai/uploads";

import { stripHallucination } from "@/lib/stt/hallucination-guard";
import { hasAudioTools } from "@/lib/stt/local-tools";
import { getOpenAIClient } from "@/lib/stt/openai";
import type { SttModel } from "@/lib/stt/models";
import {
  estimateSttUsdFromMinutes,
  estimateSttUsdFromTokens,
} from "@/lib/stt/pricing";
import type { TimedSegment } from "@/lib/stt/timed-segments";

export const CHUNK_SEC = 300;

/**
 * 나누지 않고 그대로 올릴 수 있는 상한. 전사 API가 파일당 25MB까지 받는다.
 * ffmpeg가 없는 서버에서는 이 안쪽 파일만 처리할 수 있다.
 */
const DIRECT_UPLOAD_MAX_BYTES = 24 * 1024 * 1024;

/** 무음 판정 기준. 이보다 조용한 구간이 이 길이 이상 이어지면 무음. */
const SILENCE_NOISE_DB = -32;
const SILENCE_MIN_SEC = 0.35;
/** 목표 분할 지점에서 이 범위 안의 무음까지만 경계로 당긴다. */
const SILENCE_SEARCH_SEC = 25;

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

/**
 * 전사 프롬프트 예산.
 *
 * 전사 API는 프롬프트를 224토큰까지만 본다. 한국어로 300자 남짓이다.
 * 직전 문맥을 800자씩 넣던 것은 그 자리를 넘겨서 앞부분이 버려지고 있었고,
 * 고유명사를 알려 줄 자리도 남지 않았다. 세 몫으로 나눠 쓴다.
 */
const PROMPT_MAX_CHARS = 300;
/** 문맥으로 넘길 직전 전사 끝부분. */
const CONTEXT_CHARS = 150;

/**
 * 용어는 지시문이 아니라 앞선 발화처럼 넣는다.
 *
 * 이 모델은 프롬프트를 지시로 읽는다. "이 회의에 나오는 말: ..." 식으로 주면
 * 목록을 과제로 받아들여 전사를 거의 포기한다(475자 → 34자). 같은 낱말을
 * 앞서 나온 말처럼 흘려 두면 표기만 따라오고 본 일은 계속한다.
 */
function glossaryLine(glossary: string[] | undefined): string {
  if (!glossary?.length) return "";
  return `${glossary.join(", ")}. `;
}

/**
 * 전사가 무너졌는지.
 *
 * 한국어 회의는 초당 2~3자쯤 나온다. 조용한 구간을 감안해도 초당 0.5자
 * 아래로 떨어지면 말이 없었던 게 아니라 모델이 그만둔 것이다.
 */
function isTooShort(text: string, durationSec: number): boolean {
  if (durationSec < 10) return false;
  return text.replace(/\s/g, "").length / durationSec < 0.5;
}

function firstPrompt(glossary?: string[]): string {
  return (
    `${glossaryLine(glossary)}` +
    "회의 녹음이다. 빠짐없이 전사하라. 요약, 생략 금지."
  ).slice(0, PROMPT_MAX_CHARS);
}

function continuePrompt(
  prevText: string,
  chunkIndex: number,
  total: number,
  glossary?: string[],
) {
  const tail = prevText.replace(/\s+/g, " ").trim().slice(-CONTEXT_CHARS);
  return (
    `${glossaryLine(glossary)}` +
    `회의 녹음 ${chunkIndex + 1}/${total} 구간이다. 이어서 빠짐없이 전사하라. 요약, 생략 금지.\n` +
    `직전 끝부분: ${tail}`
  ).slice(0, PROMPT_MAX_CHARS);
}

export type AudioChunk = {
  path: string;
  /** 원본 기준 시작 시각. 청크 길이 합산이 아닌 실제 분할 지점. */
  startSec: number;
  endSec: number;
};

/** 무음 구간 (초). */
type SilenceSpan = { startSec: number; endSec: number };

/** 발화가 끊긴 지점 목록. 청크 경계를 여기로 옮겨 말이 잘리지 않게 한다. */
function detectSilences(audioPath: string): SilenceSpan[] {
  // silencedetect 결과는 stderr로 나온다.
  const res = spawnSync(
    "ffmpeg",
    [
      "-v",
      "info",
      "-i",
      audioPath,
      "-af",
      `silencedetect=noise=${SILENCE_NOISE_DB}dB:d=${SILENCE_MIN_SEC}`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const log = res.stderr || "";
  if (!log) return [];

  const spans: SilenceSpan[] = [];
  let pending: number | null = null;
  for (const line of log.split("\n")) {
    const start = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (start) {
      pending = Number(start[1]);
      continue;
    }
    const end = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (end && pending != null) {
      const e = Number(end[1]);
      if (Number.isFinite(pending) && Number.isFinite(e) && e > pending) {
        spans.push({ startSec: pending, endSec: e });
      }
      pending = null;
    }
  }
  return spans;
}

/** 목표 지점에서 가장 가까운 무음 한가운데. 없으면 목표 그대로. */
function cutPointsAtSilence(
  durationSec: number,
  chunkSec: number,
  silences: SilenceSpan[],
): number[] {
  const cuts: number[] = [];
  let prev = 0;
  while (prev + chunkSec < durationSec - 1) {
    const target = prev + chunkSec;
    let best = target;
    let bestGap = Infinity;
    for (const s of silences) {
      const mid = (s.startSec + s.endSec) / 2;
      if (mid <= prev + 1) continue;
      const gap = Math.abs(mid - target);
      if (gap < bestGap && gap <= SILENCE_SEARCH_SEC) {
        bestGap = gap;
        best = mid;
      }
    }
    cuts.push(Number(best.toFixed(3)));
    prev = best;
  }
  return cuts;
}

/**
 * 원본을 청크로 자르고 각 청크의 원본 기준 시작 시각을 함께 돌려준다.
 * 경계는 발화 중간이 아니라 무음 지점으로 옮긴다. 고정 간격으로 자르면
 * 경계에 걸친 단어가 양쪽에서 다 날아간다.
 * 시작 시각은 ffmpeg가 알려주는 실제 분할 지점을 쓴다. 길이를 누적하면
 * 인코딩 패딩이 쌓여 뒤로 갈수록 싱크가 밀린다.
 */
function prepareChunks(
  audioPath: string,
  workDir: string,
  chunkSec: number,
): AudioChunk[] {
  mkdirSync(workDir, { recursive: true });
  for (const f of readdirSync(workDir)) {
    if (f.endsWith(".mp3") || f.endsWith(".csv")) {
      rmSync(join(workDir, f), { force: true });
    }
  }

  const durationSec = probeDurationSec(audioPath);
  const cuts =
    durationSec > chunkSec
      ? cutPointsAtSilence(durationSec, chunkSec, detectSilences(audioPath))
      : [];

  const listPath = join(workDir, "segments.csv");
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      audioPath,
      "-f",
      "segment",
      ...(cuts.length > 0
        ? ["-segment_times", cuts.join(",")]
        : ["-segment_time", String(chunkSec)]),
      "-segment_list",
      listPath,
      "-segment_list_type",
      "csv",
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

  const files = readdirSync(workDir)
    .filter((f) => f.startsWith("part_") && f.endsWith(".mp3"))
    .sort();

  const byName = new Map<string, { startSec: number; endSec: number }>();
  if (existsSync(listPath)) {
    for (const line of readFileSync(listPath, "utf8").split("\n")) {
      const [name, start, end] = line.trim().split(",");
      if (!name || start === undefined || end === undefined) continue;
      const s = Number(start);
      const e = Number(end);
      if (!Number.isFinite(s) || !Number.isFinite(e)) continue;
      byName.set(name.split("/").pop() || name, { startSec: s, endSec: e });
    }
  }

  let fallbackStart = 0;
  return files.map((f, i) => {
    const path = join(workDir, f);
    const known = byName.get(f);
    if (known) {
      return { path, startSec: known.startSec, endSec: known.endSec };
    }
    // segment_list 실패 시에만 목표 분할 길이로 추정
    const startSec = i === 0 ? 0 : fallbackStart;
    const endSec = startSec + chunkSec;
    fallbackStart = endSec;
    return { path, startSec, endSec };
  });
}

function parseVerboseDuration(res: unknown): number {
  const value = (res as { duration?: unknown })?.duration;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
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
  /** verbose 응답이 알려 준 길이. 아니면 0. */
  durationSec: number;
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
      durationSec: parseVerboseDuration(res),
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
    durationSec: 0,
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

/** 오디오 분 단위 요금과 토큰 요금을 합친다. 타이밍 패스는 whisper 요금이 따로 붙는다. */
function usageTotals(params: {
  model: SttModel;
  durationSec: number;
  timingAudioSec: number;
  hadTokenUsage: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}): SttUsageTotals {
  const minuteUsd = estimateSttUsdFromMinutes(params.model, params.durationSec);
  const tokenUsd = params.hadTokenUsage
    ? estimateSttUsdFromTokens(
        params.model,
        params.inputTokens,
        params.outputTokens,
      )
    : null;
  const timingUsd =
    params.model === "whisper-1"
      ? 0
      : estimateSttUsdFromMinutes(
          "whisper-1",
          params.timingAudioSec > 0 ? params.timingAudioSec : params.durationSec,
        );

  const estimatedUsd =
    (tokenUsd != null && tokenUsd > 0 ? tokenUsd : minuteUsd) + timingUsd;
  let billSource: SttUsageTotals["billSource"] = "audio_minutes";
  if (tokenUsd != null && tokenUsd > 0) {
    billSource = timingUsd > 0 ? "mixed" : "tokens";
  } else if (params.hadTokenUsage && minuteUsd > 0) {
    billSource = "mixed";
  }

  return {
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    totalTokens: params.totalTokens,
    estimatedUsd,
    billSource,
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

/** 진행률 보고를 한 줄로 줄인 형태. */
type StepReporter = (
  fraction: number,
  step: ChunkedTranscribeProgress["step"],
) => void;

/**
 * ffmpeg 없이 원본을 한 번에 전사한다.
 *
 * 배포 서버(빌드팩 이미지)에는 ffmpeg, ffprobe가 없어 길이 측정도 청크 분할도
 * 못 한다. 전사 API는 파일 하나를 그대로 받으므로 상한 안쪽이면 나눌 필요가
 * 없다. 길이는 whisper verbose 응답의 duration을 쓴다.
 */
async function transcribeWholeFile(params: {
  audioPath: string;
  model: SttModel;
  glossary?: string[];
  report: StepReporter;
}): Promise<ChunkedTranscribeResult> {
  const bytes = readFileSync(params.audioPath);
  if (bytes.length > DIRECT_UPLOAD_MAX_BYTES) {
    const limitMb = Math.floor(DIRECT_UPLOAD_MAX_BYTES / (1024 * 1024));
    throw new Error(
      `이 서버에서는 ${limitMb}MB 이하 파일만 전사할 수 있습니다. 더 작은 파일로 올려 주세요.`,
    );
  }

  const name = basename(params.audioPath) || "source.mp3";
  const needsTiming = params.model !== "whisper-1";
  params.report(0.08, "prepare");

  // 4o 계열은 시각을 주지 않는다. 길이도 여기서만 알 수 있어 먼저 받는다.
  const timingPass = needsTiming
    ? await timeChunkWithWhisper(bytes, `time_${name}`)
    : null;
  if (timingPass) params.report(0.5, "timing");

  let raw = await transcribeChunkText(
    params.model,
    bytes,
    name,
    firstPrompt(params.glossary),
  );

  const durationSec =
    raw.durationSec ||
    timingPass?.durationBillSec ||
    Math.max(
      0,
      ...(timingPass?.timed ?? raw.timed).map((s) => s.endSec),
    );

  // 용어를 붙이면 전사를 포기하는 일이 있다. 무너졌으면 용어 없이 다시 받는다.
  if (params.glossary?.length && isTooShort(raw.text, durationSec)) {
    console.warn(
      `[stt] 용어 주입 후 전사 붕괴(${raw.text.length}자). 용어 없이 재시도`,
    );
    const retry = await transcribeChunkText(
      params.model,
      bytes,
      name,
      firstPrompt(),
    );
    if (retry.text.length > raw.text.length) raw = retry;
  }

  const guard = stripHallucination(raw.text, durationSec);
  if (guard.removedSentences > 0) {
    console.warn(
      `[stt] 반복 환각 ${guard.removedSentences}문장(${guard.removedChars}자) 제거`,
    );
  }
  params.report(1, "done");

  const timed = timingPass ? timingPass.timed : raw.timed;
  return {
    text: guard.text,
    parts: [guard.text],
    durationSec,
    chunkCount: 1,
    timedSegments: timed,
    usage: usageTotals({
      model: params.model,
      durationSec,
      timingAudioSec: timingPass?.durationBillSec ?? 0,
      hadTokenUsage: Boolean(raw.usage),
      inputTokens: raw.usage?.inputTokens ?? 0,
      outputTokens: raw.usage?.outputTokens ?? 0,
      totalTokens: raw.usage?.totalTokens ?? 0,
    }),
  };
}

/**
 * 길이 확인 → N분 청크 → 직전 문맥 prompt 이어전사 → 연결.
 * 시각: whisper-1은 본전사 verbose, 그 외 모델은 별도 whisper 타이밍 패스.
 * ffmpeg가 없는 서버에서는 나누지 않고 한 번에 전사한다.
 */
export async function chunkedTranscribe(params: {
  audioPath: string;
  workDir: string;
  model: SttModel;
  chunkSec?: number;
  /** 이 회의에 나올 고유명사. 소리만으로 못 가리는 말을 미리 알려 준다. */
  glossary?: string[];
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
  if (!hasAudioTools()) {
    console.warn("[stt] ffmpeg가 없어 분할 없이 한 번에 전사합니다.");
    return transcribeWholeFile({
      audioPath: params.audioPath,
      model: params.model,
      glossary: params.glossary,
      report: (fraction, step) => report({ fraction, step }),
    });
  }

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

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const bytes = readFileSync(chunk.path);
    const chunkDur = Math.max(0, chunk.endSec - chunk.startSec);
    const offsetSec = chunk.startSec;
    const prompt =
      i === 0
        ? firstPrompt(params.glossary)
        : continuePrompt(prev, i, chunks.length, params.glossary);

    let raw = await transcribeChunkText(
      params.model,
      bytes,
      `part_${i}.mp3`,
      prompt,
    );

    /**
     * 용어를 붙이면 가끔 전사를 통째로 포기한다.
     *
     * 이 모델은 프롬프트를 지시로 읽어서, 낱말 목록을 보면 두 번에 한 번꼴로
     * 3분치를 40자쯤으로 뭉개고 끝낸다. 고유명사를 얻는 대신 본문을 잃는
     * 거래는 성립하지 않는다. 무너진 게 보이면 용어를 빼고 다시 받는다.
     */
    if (params.glossary?.length && isTooShort(raw.text, chunkDur)) {
      console.warn(
        `[stt] 청크 ${i + 1} 용어 주입 후 전사 붕괴(${raw.text.length}자). 용어 없이 재시도`,
      );
      const retry = await transcribeChunkText(
        params.model,
        bytes,
        `part_${i}.mp3`,
        i === 0 ? firstPrompt() : continuePrompt(prev, i, chunks.length),
      );
      if (retry.text.length > raw.text.length) raw = retry;
    }

    const { usage, timed } = raw;
    const guard = stripHallucination(raw.text, chunkDur);
    if (guard.removedSentences > 0) {
      console.warn(
        `[stt] 청크 ${i + 1} 반복 환각 ${guard.removedSentences}문장(${guard.removedChars}자) 제거`,
      );
    }
    if (guard.overGenerated) {
      console.warn(
        `[stt] 청크 ${i + 1} 초당 ${guard.charsPerSec.toFixed(1)}자로 과생성 의심`,
      );
    }
    const text = guard.text;
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
  }

  report({
    fraction: 1,
    step: "done",
    chunkIndex: Math.max(0, chunks.length - 1),
    chunkCount: chunks.length,
    completedUnits: totalUnits,
    totalUnits,
  });


  return {
    text: parts.filter(Boolean).join("\n"),
    parts,
    durationSec,
    chunkCount: chunks.length,
    timedSegments,
    usage: usageTotals({
      model: params.model,
      durationSec,
      timingAudioSec,
      hadTokenUsage,
      inputTokens,
      outputTokens,
      totalTokens,
    }),
  };
}

/**
 * 업로드 바이트를 작업 폴더에 풀어 놓는다.
 * 전사와 화자분리가 같은 파일을 봐야 해서 경로를 밖으로 돌려준다.
 */
export function writeSourceAudio(params: {
  audioBytes: Buffer;
  filename: string;
  workDir: string;
}): string {
  mkdirSync(params.workDir, { recursive: true });
  const ext = params.filename.includes(".")
    ? params.filename.slice(params.filename.lastIndexOf("."))
    : ".bin";
  const audioPath = join(params.workDir, `source${ext}`);
  writeFileSync(audioPath, params.audioBytes);
  return audioPath;
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
  const audioPath = writeSourceAudio(params);
  return chunkedTranscribe({
    audioPath,
    workDir: join(params.workDir, "chunks"),
    model: params.model,
    chunkSec: params.chunkSec,
    onProgress: params.onProgress,
  });
}
