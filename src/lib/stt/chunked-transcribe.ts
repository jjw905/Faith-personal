import { execFileSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { toFile } from "openai/uploads";

import { stripHallucination } from "@/lib/stt/hallucination-guard";
import { hasAudioTools, requireAudioToolPath } from "@/lib/stt/local-tools";
import {
  assertUploadAudioBytes,
  assertUploadAudioDuration,
} from "@/lib/stt/upload-limits";
import { getOpenAIClient } from "@/lib/stt/openai";
import type { SttModel } from "@/lib/stt/models";
import { realtimeTranscribeFile } from "@/lib/stt/realtime/transcribe-session";
import { REALTIME_STT_MINI } from "@/lib/stt/realtime/types";
import {
  estimateSttUsdFromMinutes,
  estimateSttUsdFromTokens,
} from "@/lib/stt/pricing";
import type { TimedSegment, WordTiming } from "@/lib/stt/timed-segments";
import {
  repairChunkBoundarySurface,
  type ChunkBoundarySurfaceRepair,
} from "@/lib/stt/surface-accuracy";

export const CHUNK_SEC = 300;
export const CHUNK_OVERLAP_SEC = 1.2;

/** 무음 판정 기준. 이보다 조용한 구간이 이 길이 이상 이어지면 무음. */
const SILENCE_NOISE_DB = -32;
const SILENCE_MIN_SEC = 0.35;
/** 목표 분할 지점에서 이 범위 안의 무음까지만 경계로 당긴다. */
const SILENCE_SEARCH_SEC = 25;
/**
 * whisper 타이밍 패스 앞 침묵.
 * 길면 중간 발화를 통째로 빼먹는 경우가 있어, 이 길이 이상이면 잘라 보낸다.
 */
const LEADING_SILENCE_TRIM_MIN_SEC = 1.5;
/** 발화 시작이 잘리지 않게 남기는 여유. */
const LEADING_SPEECH_PAD_SEC = 0.15;

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

function parseMeanLogprob(res: unknown): {
  meanLogprob?: number;
  logprobCount: number;
} {
  const logprobs = (res as { logprobs?: unknown })?.logprobs;
  if (!Array.isArray(logprobs)) return { logprobCount: 0 };
  const values = logprobs
    .map((row) =>
      row && typeof row === "object"
        ? Number((row as { logprob?: unknown }).logprob)
        : Number.NaN,
    )
    .filter(Number.isFinite);
  if (values.length === 0) return { logprobCount: 0 };
  return {
    meanLogprob: values.reduce((sum, value) => sum + value, 0) / values.length,
    logprobCount: values.length,
  };
}

/**
 * ffmpeg/ffprobe 자식 프로세스 상한.
 *
 * execFileSync/spawnSync는 이 Node 프로세스 전체(이벤트 루프)를 그동안 막는다.
 * 손상되거나 악의적으로 조작된 오디오 파일이 디코더를 무한 루프에 빠뜨리면
 * timeout 없이는 서버 전체가 그 요청 하나 때문에 멈춘다. 실제 처리 시간보다
 * 넉넉히 두되 반드시 killSignal로 강제 종료한다.
 */
const PROBE_TIMEOUT_MS = 30_000;
const SILENCE_DETECT_TIMEOUT_MS = 10 * 60 * 1000;
const CHUNK_ENCODE_TIMEOUT_MS = 5 * 60 * 1000;

export function probeDurationSec(audioPath: string): number {
  const out = execFileSync(
    requireAudioToolPath("ffprobe"),
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      audioPath,
    ],
    { encoding: "utf8", timeout: PROBE_TIMEOUT_MS, killSignal: "SIGKILL" },
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
  /** 겹침을 포함한 원본 기준 시작, 끝 시각. */
  startSec: number;
  endSec: number;
  /** 이 청크가 책임지는 비중복 구간. */
  coreStartSec: number;
  coreEndSec: number;
};

/** 무음 구간 (초). */
type SilenceSpan = { startSec: number; endSec: number };

/** 발화가 끊긴 지점 목록. 청크 경계를 여기로 옮겨 말이 잘리지 않게 한다. */
function detectSilences(audioPath: string): SilenceSpan[] {
  // silencedetect 결과는 stderr로 나온다.
  const res = spawnSync(
    requireAudioToolPath("ffmpeg"),
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
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: SILENCE_DETECT_TIMEOUT_MS,
      killSignal: "SIGKILL",
    },
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

/**
 * 파일 맨 앞 침묵이 끝나면 그 시각.
 * 없거나 짧으면 0. whisper에 긴 앞 침묵을 넣으면 뒤 발화를 건너뛴다.
 */
function leadingSilenceTrimSec(audioPath: string): number {
  const first = detectSilences(audioPath)[0];
  if (!first || first.startSec > 0.25) return 0;
  if (first.endSec < LEADING_SILENCE_TRIM_MIN_SEC) return 0;
  return Math.max(0, first.endSec - LEADING_SPEECH_PAD_SEC);
}

function extractAudioFromSec(
  sourcePath: string,
  startSec: number,
  outPath: string,
) {
  execFileSync(
    requireAudioToolPath("ffmpeg"),
    [
      "-y",
      "-v",
      "error",
      "-ss",
      String(startSec),
      "-i",
      sourcePath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "flac",
      "-compression_level",
      "5",
      outPath,
    ],
    {
      encoding: "utf8",
      timeout: CHUNK_ENCODE_TIMEOUT_MS,
      killSignal: "SIGKILL",
    },
  );
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
  options: {
    boundaryMode: "fixed" | "silence";
    overlapSec: number;
  },
): AudioChunk[] {
  mkdirSync(/* turbopackIgnore: true */ workDir, { recursive: true });
  for (const f of readdirSync(/* turbopackIgnore: true */ workDir)) {
    if (f.endsWith(".mp3") || f.endsWith(".flac")) {
      rmSync(/* turbopackIgnore: true */ join(workDir, f), { force: true });
    }
  }

  const durationSec = probeDurationSec(audioPath);
  const cuts =
    options.boundaryMode === "silence" && durationSec > chunkSec
      ? cutPointsAtSilence(durationSec, chunkSec, detectSilences(audioPath))
      : Array.from(
          { length: Math.max(0, Math.ceil(durationSec / chunkSec) - 1) },
          (_, index) => Math.min(durationSec, (index + 1) * chunkSec),
        );
  const boundaries = [0, ...cuts, durationSec]
    .filter((value, index, values) => index === 0 || value > values[index - 1]!)
    .map((value) => Number(value.toFixed(3)));
  const chunks: AudioChunk[] = [];
  for (let index = 0; index < boundaries.length - 1; index++) {
    const coreStartSec = boundaries[index]!;
    const coreEndSec = boundaries[index + 1]!;
    const startSec = Math.max(
      0,
      coreStartSec - (index > 0 ? options.overlapSec : 0),
    );
    const endSec = Math.min(
      durationSec,
      coreEndSec + (index < boundaries.length - 2 ? options.overlapSec : 0),
    );
    const path = join(
      /* turbopackIgnore: true */ workDir,
      `part_${String(index).padStart(3, "0")}.flac`,
    );
    execFileSync(
      requireAudioToolPath("ffmpeg"),
      [
        "-y",
        "-v",
        "error",
        "-i",
        audioPath,
        "-ss",
        String(startSec),
        "-t",
        String(endSec - startSec),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "flac",
        "-compression_level",
        "5",
        path,
      ],
      {
        stdio: "pipe",
        timeout: CHUNK_ENCODE_TIMEOUT_MS,
        killSignal: "SIGKILL",
      },
    );
    if (existsSync(/* turbopackIgnore: true */ path)) {
      chunks.push({
        path,
        startSec,
        endSec,
        coreStartSec,
        coreEndSec,
      });
    }
  }
  return chunks;
}

function removeBoundaryDuplicate(previous: string, current: string): string {
  const prior = [...previous.matchAll(/[0-9A-Za-z가-힣]+/g)];
  const next = [...current.matchAll(/[0-9A-Za-z가-힣]+/g)];
  const max = Math.min(20, prior.length, next.length);
  for (let count = max; count >= 1; count--) {
    const before = prior
      .slice(-count)
      .map((match) => match[0].toLowerCase())
      .join("");
    const after = next
      .slice(0, count)
      .map((match) => match[0].toLowerCase())
      .join("");
    if (before !== after || (count === 1 && before.length < 4)) continue;
    const last = next[count - 1]!;
    return current.slice((last.index ?? 0) + last[0].length).trimStart();
  }
  return current;
}

function parseVerboseDuration(res: unknown): number {
  const value = (res as { duration?: unknown })?.duration;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function parseVerboseSegments(res: unknown, offsetSec: number): TimedSegment[] {
  const segments = (res as { segments?: unknown })?.segments;
  if (!Array.isArray(segments)) return [];
  const out: TimedSegment[] = [];
  for (const s of segments) {
    const row = s as {
      start?: number;
      end?: number;
      text?: string;
      avg_logprob?: number;
    };
    const text = (row.text || "").trim();
    if (!text) continue;
    const start = Number(row.start);
    const end = Number(row.end);
    if (!Number.isFinite(start)) continue;
    const avgLogprob = Number(row.avg_logprob);
    out.push({
      startSec: offsetSec + Math.max(0, start),
      endSec:
        offsetSec +
        (Number.isFinite(end) ? Math.max(start, end) : Math.max(0, start)),
      text,
      ...(Number.isFinite(avgLogprob)
        ? { confidence: Math.max(0, Math.min(1, Math.exp(avgLogprob))) }
        : {}),
    });
  }
  return out;
}

function parseVerboseWords(res: unknown, offsetSec: number): WordTiming[] {
  const words = (res as { words?: unknown })?.words;
  if (!Array.isArray(words)) return [];
  const raw: WordTiming[] = [];
  for (const w of words) {
    const row = w as { word?: string; start?: number; end?: number };
    const text = (row.word || "").trim();
    if (!text) continue;
    const start = Number(row.start);
    const end = Number(row.end);
    if (!Number.isFinite(start)) continue;
    raw.push({
      text,
      startSec: offsetSec + Math.max(0, start),
      endSec:
        offsetSec +
        (Number.isFinite(end) ? Math.max(start, end) : Math.max(0, start)),
    });
  }
  return sanitizeWordTimings(raw);
}

/** whisper가 start==end로 주는 토큰을 재생 포커스에 쓸 수 있게 고친다. */
function sanitizeWordTimings(words: WordTiming[]): WordTiming[] {
  if (words.length === 0) return [];
  const sorted = [...words].sort(
    (a, b) => a.startSec - b.startSec || a.endSec - b.endSec,
  );
  const MIN_DUR = 0.08;
  const out: WordTiming[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const nextStart = sorted[i + 1]?.startSec;
    let endSec = cur.endSec;
    if (!(endSec > cur.startSec)) {
      endSec =
        typeof nextStart === "number" && nextStart > cur.startSec
          ? Math.min(nextStart, cur.startSec + MIN_DUR)
          : cur.startSec + MIN_DUR;
    } else if (typeof nextStart === "number" && endSec > nextStart) {
      // 다음 단어와 겹치면 경계까지만.
      endSec = Math.max(cur.startSec + 0.02, nextStart);
    }
    out.push({
      text: cur.text,
      startSec: cur.startSec,
      endSec,
    });
  }
  return out;
}

async function transcribeChunkText(
  model: SttModel,
  bytes: Buffer,
  filename: string,
  prompt: string | undefined,
  options?: {
    wordTimestamps?: boolean;
    keywords?: string[];
    signal?: AbortSignal;
  },
): Promise<{
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
  timed: TimedSegment[];
  words: WordTiming[];
  /** verbose 응답이 알려 준 길이. 아니면 0. */
  durationSec: number;
  meanLogprob?: number;
  logprobCount: number;
}> {
  const client = getOpenAIClient();
  const file = await toFile(bytes, filename);

  if (model === "whisper-1") {
    const granularities: ("segment" | "word")[] = options?.wordTimestamps
      ? ["segment", "word"]
      : ["segment"];
    const res = await client.audio.transcriptions.create(
      {
        model: "whisper-1",
        file,
        response_format: "verbose_json",
        timestamp_granularities: granularities,
        ...(prompt ? { prompt } : {}),
      },
      { signal: options?.signal },
    );
    return {
      text: (res.text || "").trim(),
      usage: parseTranscriptionUsage(res),
      timed: parseVerboseSegments(res, 0),
      words: options?.wordTimestamps ? parseVerboseWords(res, 0) : [],
      durationSec: parseVerboseDuration(res),
      logprobCount: 0,
    };
  }

  if (model === "gpt-transcribe") {
    const response = await client.audio.transcriptions.create(
      {
        model,
        file,
        languages: ["ko"],
        ...(options?.keywords?.length
          ? { keywords: options.keywords.slice(0, 100) }
          : {}),
        ...(prompt ? { prompt } : {}),
      } as unknown as Parameters<typeof client.audio.transcriptions.create>[0],
      { signal: options?.signal },
    );
    const res = response as unknown as { text?: string; usage?: unknown };
    return {
      text: (res.text || "").trim(),
      usage: parseTranscriptionUsage(res),
      timed: [],
      words: [],
      durationSec: 0,
      logprobCount: 0,
    };
  }

  const res = await client.audio.transcriptions.create(
    {
      model,
      file,
      include: ["logprobs"],
      ...(prompt ? { prompt } : {}),
    },
    { signal: options?.signal },
  );
  const confidence = parseMeanLogprob(res);
  return {
    text: (res.text || "").trim(),
    usage: parseTranscriptionUsage(res),
    timed: [],
    words: [],
    durationSec: 0,
    ...confidence,
  };
}

/** 실시간 저신뢰 발화를 같은 mini로 한 번만 다시 확인한다. 타이밍 호출은 하지 않는다. */
export async function transcribeMiniAudioOnce(params: {
  audioBytes: Buffer;
  filename: string;
  glossary?: string[];
}): Promise<{ text: string; meanLogprob?: number }> {
  const result = await transcribeChunkText(
    "gpt-4o-mini-transcribe",
    params.audioBytes,
    params.filename,
    firstPrompt(params.glossary),
    { keywords: params.glossary },
  );
  return { text: result.text, meanLogprob: result.meanLogprob };
}

/**
 * 짧은 구간을 지정 모델로 한 번만 다시 확인한다. 고유명사 재확인처럼 mini보다
 * 비싼 모델로, 신뢰도와 무관하게 특정 구간만 골라 다시 들을 때 쓴다.
 */
export async function transcribeAudioOnce(params: {
  audioBytes: Buffer;
  filename: string;
  model?: SttModel;
  glossary?: string[];
}): Promise<{
  text: string;
  meanLogprob?: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
}> {
  const result = await transcribeChunkText(
    params.model ?? "gpt-4o-mini-transcribe",
    params.audioBytes,
    params.filename,
    firstPrompt(params.glossary),
    { keywords: params.glossary },
  );
  return {
    text: result.text,
    meanLogprob: result.meanLogprob,
    usage: result.usage,
  };
}

/**
 * REST mini 본문과 독립된 mini Realtime 출력에서 발화 시각만 수집한다.
 * whisper 타이밍 패스보다 분당 비용이 절반이고 본문 모델도 mini로 고정된다.
 */
async function timeChunkWithRealtimeMini(
  audioPath: string,
  signal?: AbortSignal,
): Promise<{ timed: TimedSegment[]; durationBillSec: number }> {
  try {
    const res = await realtimeTranscribeFile(audioPath, {
      model: REALTIME_STT_MINI,
      language: "ko",
      signal,
    });
    const durationBillSec = res.billedAudioSec || res.durationSec;
    const timed = res.utterances.map((utterance, index) => ({
      startSec: utterance.startSec,
      endSec:
        utterance.endSec ??
        res.utterances[index + 1]?.startSec ??
        res.durationSec,
      text: utterance.text,
      ...(typeof utterance.confidence === "number"
        ? { confidence: utterance.confidence }
        : {}),
    }));
    if (timed.length === 0) {
      throw new Error(
        "실측 시각(타이밍) 결과가 비어 있습니다. 잠시 후 다시 시도하거나 다른 파일로 올려 주세요.",
      );
    }
    return { timed, durationBillSec };
  } catch (err) {
    if (err instanceof Error && err.message.includes("실측 시각(타이밍)")) {
      throw err;
    }
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[stt] mini Realtime 타이밍 패스 실패", detail);
    throw new Error(`실측 시각(타이밍) 받아쓰기에 실패했습니다. ${detail}`);
  }
}

/**
 * 단어 단위 실측 시각까지 필요할 때의 타이밍 패스.
 * mini Realtime과 달리 whisper-1 verbose(segment+word)를 써서, 문장 구간뿐
 * 아니라 단어 하나하나의 시작/끝도 함께 받는다 — 재생 중 단어 하이라이트용.
 */
export async function whisperWordTimingsForFile(
  audioPath: string,
  glossary?: string[],
): Promise<{
  timed: TimedSegment[];
  words: WordTiming[];
  durationBillSec: number;
}> {
  return timeChunkWithWhisperWords(audioPath, glossary);
}

/**
 * 짧은 클립(실시간 발화 WAV)에서 단어 시각만 받는다.
 * 본문 전사는 이미 있으므로 하이라이트용으로만 쓴다.
 */
export async function whisperWordTimingsForBytes(params: {
  audioBytes: Buffer;
  filename: string;
  glossary?: string[];
  /** 클립이 회의 전체에서 시작하는 절대 초. 결과에 더한다. */
  offsetSec?: number;
}): Promise<{ words: WordTiming[]; text: string; durationBillSec: number }> {
  const res = await transcribeChunkText(
    "whisper-1",
    params.audioBytes,
    params.filename || "utterance.wav",
    firstPrompt(params.glossary),
    { wordTimestamps: true },
  );
  const offset = Math.max(0, params.offsetSec ?? 0);
  return {
    text: res.text,
    durationBillSec: res.durationSec,
    words: res.words.map((word) => ({
      text: word.text,
      startSec: word.startSec + offset,
      endSec: word.endSec + offset,
    })),
  };
}

async function timeChunkWithWhisperWords(
  audioPath: string,
  glossary?: string[],
  signal?: AbortSignal,
): Promise<{
  timed: TimedSegment[];
  words: WordTiming[];
  durationBillSec: number;
}> {
  const leadSec = leadingSilenceTrimSec(audioPath);
  let pathForWhisper = audioPath;
  let trimSec = 0;
  let tempPath: string | null = null;
  try {
    if (leadSec > 0) {
      const candidate = join(
        /* turbopackIgnore: true */ tmpdir(),
        `faith-whisper-lead-${randomBytes(8).toString("hex")}.flac`,
      );
      try {
        extractAudioFromSec(audioPath, leadSec, candidate);
        tempPath = candidate;
        pathForWhisper = candidate;
        trimSec = leadSec;
      } catch {
        // 침묵 잘라내기 실패는 실측 타이밍 자체를 막지 않는다. 원본으로 폴백.
        rmSync(/* turbopackIgnore: true */ candidate, { force: true });
      }
    }

    const bytes = readFileSync(/* turbopackIgnore: true */ pathForWhisper);
    const name = basename(audioPath) || "timing.mp3";
    const res = await transcribeChunkText(
      "whisper-1",
      bytes,
      name,
      firstPrompt(glossary),
      { wordTimestamps: true, signal },
    );
    if (res.timed.length === 0) {
      throw new Error(
        "실측 시각(타이밍) 결과가 비어 있습니다. 잠시 후 다시 시도하거나 다른 파일로 올려 주세요.",
      );
    }
    return {
      timed: res.timed.map((seg) => ({
        ...seg,
        startSec: seg.startSec + trimSec,
        endSec: seg.endSec + trimSec,
      })),
      words: res.words.map((word) => ({
        ...word,
        startSec: word.startSec + trimSec,
        endSec: word.endSec + trimSec,
      })),
      // 요금은 실제로 whisper에 넣은 길이. 자른 앞 침묵은 청구하지 않는다.
      durationBillSec: res.durationSec,
    };
  } finally {
    if (tempPath) rmSync(/* turbopackIgnore: true */ tempPath, { force: true });
  }
}

/** 오디오 분 단위 요금과 토큰 요금을 합친다. 타이밍 패스는 별도 모델 요금이 따로 붙는다. */
function usageTotals(params: {
  model: SttModel;
  durationSec: number;
  timingAudioSec: number;
  /** 타이밍 패스에 실제로 쓴 모델. 단어 타임스탬프를 요청하면 whisper-1로 바뀐다. */
  timingModel?: SttModel;
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
          params.timingModel ?? "gpt-4o-mini-transcribe",
          params.timingAudioSec > 0
            ? params.timingAudioSec
            : params.durationSec,
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
  /** parts 각 항목이 담당하는 원본 오디오 핵심 범위. */
  partRanges: Array<{ startSec: number; endSec: number }>;
  durationSec: number;
  chunkCount: number;
  usage: SttUsageTotals;
  /** STT 모델이 낸 실측 세그먼트 (절대 초). */
  timedSegments: TimedSegment[];
  /** 단어 단위 실측 시각 (절대 초). 요청하지 않았으면 빈 배열. */
  wordTimings: WordTiming[];
  /** 본문 전사 토큰 logprob 평균. API가 주지 않으면 없음. */
  meanLogprob?: number;
  /** 독립 단어 시각 합의로 제거한 overlap 경계 되감기. */
  surfaceRepairs?: ChunkBoundarySurfaceRepair[];
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
 * ffmpeg, ffprobe가 없을 때 원본을 한 번에 전사한다. mini Realtime 타이밍은
 * PCM 변환이 필요하므로 오디오 도구가 없는 배포는 시작 전에 차단한다.
 */
async function transcribeWholeFile(params: {
  audioPath: string;
  model: SttModel;
  glossary?: string[];
  wordTimestamps?: boolean;
  report: StepReporter;
  signal?: AbortSignal;
}): Promise<ChunkedTranscribeResult> {
  const bytes = readFileSync(/* turbopackIgnore: true */ params.audioPath);
  assertUploadAudioBytes(bytes.length);

  const name = basename(params.audioPath) || "source.mp3";
  const needsTiming = params.model !== "whisper-1";
  if (needsTiming && !hasAudioTools()) {
    throw new Error(
      "mini 실측 시각을 만들 오디오 도구가 없습니다. 서버 배포 설정을 확인해 주세요.",
    );
  }
  params.report(0.08, "prepare");

  // REST 4o 계열은 시각을 주지 않으므로 mini(또는 단어 시각이 필요하면 whisper-1)에서 발화 시각을 받는다.
  const timingPass = needsTiming
    ? params.wordTimestamps
      ? await timeChunkWithWhisperWords(
          params.audioPath,
          params.glossary,
          params.signal,
        )
      : await timeChunkWithRealtimeMini(params.audioPath, params.signal)
    : null;
  if (timingPass) params.report(0.5, "timing");

  let raw = await transcribeChunkText(
    params.model,
    bytes,
    name,
    firstPrompt(params.glossary),
    {
      keywords: params.glossary,
      wordTimestamps: !needsTiming && params.wordTimestamps,
      signal: params.signal,
    },
  );

  const durationSec =
    raw.durationSec ||
    timingPass?.durationBillSec ||
    Math.max(0, ...(timingPass?.timed ?? raw.timed).map((s) => s.endSec));

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
      {
        wordTimestamps: !needsTiming && params.wordTimestamps,
        signal: params.signal,
      },
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
  const words =
    timingPass && "words" in timingPass
      ? (timingPass as { words: WordTiming[] }).words
      : raw.words;
  return {
    text: guard.text,
    parts: [guard.text],
    partRanges: [{ startSec: 0, endSec: durationSec }],
    durationSec,
    chunkCount: 1,
    timedSegments: timed,
    wordTimings: words,
    meanLogprob: raw.meanLogprob,
    usage: usageTotals({
      model: params.model,
      durationSec,
      timingAudioSec: timingPass?.durationBillSec ?? 0,
      timingModel: params.wordTimestamps
        ? "whisper-1"
        : "gpt-4o-mini-transcribe",
      hadTokenUsage: Boolean(raw.usage),
      inputTokens: raw.usage?.inputTokens ?? 0,
      outputTokens: raw.usage?.outputTokens ?? 0,
      totalTokens: raw.usage?.totalTokens ?? 0,
    }),
  };
}

/**
 * 길이 확인 → N분 청크 → 직전 문맥 prompt 이어전사 → 연결.
 * 시각: whisper-1은 본전사 verbose, 그 외 모델은 mini Realtime 타이밍 패스.
 * ffmpeg가 없는 서버에서는 whisper-1만 한 번에 전사할 수 있다.
 */
export async function chunkedTranscribe(params: {
  audioPath: string;
  workDir: string;
  model: SttModel;
  chunkSec?: number;
  /** 평가용. 제품 기본은 무음 경계다. */
  boundaryMode?: "fixed" | "silence";
  /** 평가용. 제품 기본은 경계 양쪽 1.2초다. */
  overlapSec?: number;
  /** 평가용. 제품 기본은 직전 문맥을 이어 준다. */
  contextualPrompt?: boolean;
  /** 평가용. 제품 기본은 반복 환각을 제거한다. */
  hallucinationGuard?: boolean;
  /** 이 회의에 나올 고유명사. 소리만으로 못 가리는 말을 미리 알려 준다. */
  glossary?: string[];
  /** 켜면 단어 단위 실측 시각도 함께 받는다 (재생 중 단어 하이라이트용). */
  wordTimestamps?: boolean;
  onProgress?: (p: ChunkedTranscribeProgress) => void;
  signal?: AbortSignal;
}): Promise<ChunkedTranscribeResult> {
  const chunkSec = params.chunkSec ?? CHUNK_SEC;
  const boundaryMode = params.boundaryMode ?? "silence";
  const overlapSec = Math.max(0, params.overlapSec ?? CHUNK_OVERLAP_SEC);
  const contextualPrompt = params.contextualPrompt !== false;
  const hallucinationGuard = params.hallucinationGuard !== false;
  if (!existsSync(/* turbopackIgnore: true */ params.audioPath)) {
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
      wordTimestamps: params.wordTimestamps,
      report: (fraction, step) => report({ fraction, step }),
      signal: params.signal,
    });
  }

  const durationSec = probeDurationSec(params.audioPath);
  assertUploadAudioDuration(durationSec);
  report({ fraction: 0.04, step: "probe" });

  const chunks = prepareChunks(params.audioPath, params.workDir, chunkSec, {
    boundaryMode,
    overlapSec,
  });
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
  const wordTimings: WordTiming[] = [];
  let prev = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let hadTokenUsage = false;
  let timingAudioSec = 0;
  let logprobTotal = 0;
  let logprobCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const bytes = readFileSync(/* turbopackIgnore: true */ chunk.path);
    const chunkDur = Math.max(0, chunk.endSec - chunk.startSec);
    const offsetSec = chunk.startSec;
    const prompt =
      i === 0 || !contextualPrompt
        ? firstPrompt(params.glossary)
        : continuePrompt(prev, i, chunks.length, params.glossary);

    // 본문 전사와 단어 시각은 같은 청크를 독립적으로 읽는다. 직렬 실행하면
    // 11분 파일에서 긴 API 대기 6회가 그대로 더해지므로 둘을 함께 시작한다.
    const textPromise = transcribeChunkText(
      params.model,
      bytes,
      `part_${i}.flac`,
      prompt,
      {
        keywords: params.glossary,
        wordTimestamps: !needsTiming && params.wordTimestamps,
        signal: params.signal,
      },
    ).then((result) => {
      completedUnits += 1;
      report({
        fraction: sttFraction(completedUnits),
        step: "transcribe",
        chunkIndex: i,
        chunkCount: chunks.length,
        completedUnits,
        totalUnits,
      });
      return result;
    });
    const timingPromise = needsTiming
      ? (params.wordTimestamps
          ? timeChunkWithWhisperWords(
              chunk.path,
              params.glossary,
              params.signal,
            )
          : timeChunkWithRealtimeMini(chunk.path, params.signal)
        ).then((result) => {
          completedUnits += 1;
          report({
            fraction: sttFraction(completedUnits),
            step: "timing",
            chunkIndex: i,
            chunkCount: chunks.length,
            completedUnits,
            totalUnits,
          });
          return result;
        })
      : Promise.resolve(null);
    const [initialRaw, timedPass] = await Promise.all([
      textPromise,
      timingPromise,
    ]);
    let raw = initialRaw;

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
        `part_${i}.flac`,
        i === 0 || !contextualPrompt
          ? firstPrompt()
          : continuePrompt(prev, i, chunks.length),
        {
          wordTimestamps: !needsTiming && params.wordTimestamps,
          signal: params.signal,
        },
      );
      if (retry.text.length > raw.text.length) raw = retry;
    }

    const { usage, timed } = raw;
    const guard = hallucinationGuard
      ? stripHallucination(raw.text, chunkDur)
      : {
          text: raw.text,
          removedSentences: 0,
          removedChars: 0,
          overGenerated: false,
          charsPerSec:
            raw.text.replace(/\s/g, "").length / Math.max(1, chunkDur),
        };
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
    const text =
      overlapSec > 0 && i > 0
        ? removeBoundaryDuplicate(parts[parts.length - 1] ?? "", guard.text)
        : guard.text;
    parts.push(text);
    prev = text;
    if (usage) {
      hadTokenUsage = true;
      inputTokens += usage.inputTokens;
      outputTokens += usage.outputTokens;
      totalTokens += usage.totalTokens;
    }
    if (raw.meanLogprob !== undefined && raw.logprobCount > 0) {
      logprobTotal += raw.meanLogprob * raw.logprobCount;
      logprobCount += raw.logprobCount;
    }

    let chunkTimed = timed.map((s) => ({
      ...s,
      startSec: s.startSec + offsetSec,
      endSec: s.endSec + offsetSec,
    }));
    let chunkWords = raw.words.map((w) => ({
      ...w,
      startSec: w.startSec + offsetSec,
      endSec: w.endSec + offsetSec,
    }));

    if (needsTiming) {
      if (!timedPass) {
        throw new Error("실측 시각(타이밍) 결과가 비어 있습니다.");
      }
      timingAudioSec += timedPass.durationBillSec || chunkDur;
      chunkTimed = timedPass.timed.map((s) => ({
        ...s,
        startSec: s.startSec + offsetSec,
        endSec: s.endSec + offsetSec,
      }));
      chunkWords = (
        ("words" in timedPass ? timedPass.words : []) as WordTiming[]
      ).map((w) => ({
        ...w,
        startSec: w.startSec + offsetSec,
        endSec: w.endSec + offsetSec,
      }));
    }

    const inCore = (startSec: number, endSec: number) => {
      const middle = (startSec + endSec) / 2;
      return (
        middle >= chunk.coreStartSec &&
        (i === chunks.length - 1 || middle < chunk.coreEndSec)
      );
    };

    timedSegments.push(
      ...chunkTimed.filter((s) => inCore(s.startSec, s.endSec)),
    );
    wordTimings.push(...chunkWords.filter((w) => inCore(w.startSec, w.endSec)));
  }

  report({
    fraction: 1,
    step: "done",
    chunkIndex: Math.max(0, chunks.length - 1),
    chunkCount: chunks.length,
    completedUnits: totalUnits,
    totalUnits,
  });

  const partRanges = chunks.map((chunk) => ({
    startSec: chunk.coreStartSec,
    endSec: chunk.coreEndSec,
  }));
  const surface = repairChunkBoundarySurface({
    parts,
    partRanges,
    wordTimings,
  });

  return {
    text: surface.parts.filter(Boolean).join("\n"),
    parts: surface.parts,
    partRanges,
    durationSec,
    chunkCount: chunks.length,
    timedSegments,
    wordTimings,
    ...(surface.repairs.length > 0 ? { surfaceRepairs: surface.repairs } : {}),
    ...(logprobCount > 0 ? { meanLogprob: logprobTotal / logprobCount } : {}),
    usage: usageTotals({
      model: params.model,
      durationSec,
      timingAudioSec,
      timingModel: params.wordTimestamps
        ? "whisper-1"
        : "gpt-4o-mini-transcribe",
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
  mkdirSync(/* turbopackIgnore: true */ params.workDir, { recursive: true });
  const ext = params.filename.includes(".")
    ? params.filename.slice(params.filename.lastIndexOf("."))
    : ".bin";
  const audioPath = join(
    /* turbopackIgnore: true */ params.workDir,
    `source${ext}`,
  );
  writeFileSync(/* turbopackIgnore: true */ audioPath, params.audioBytes);
  return audioPath;
}

/** Buffer를 임시 파일로 저장한 뒤 청크 STT. */
export async function chunkedTranscribeBuffer(params: {
  audioBytes: Buffer;
  filename: string;
  workDir: string;
  model: SttModel;
  chunkSec?: number;
  wordTimestamps?: boolean;
  onProgress?: (p: ChunkedTranscribeProgress) => void;
}): Promise<ChunkedTranscribeResult> {
  const audioPath = writeSourceAudio(params);
  return chunkedTranscribe({
    audioPath,
    workDir: join(/* turbopackIgnore: true */ params.workDir, "chunks"),
    model: params.model,
    chunkSec: params.chunkSec,
    wordTimestamps: params.wordTimestamps,
    onProgress: params.onProgress,
  });
}
