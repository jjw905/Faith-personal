import { execFile } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import type { TimedSegment, WordTiming } from "@/lib/stt/timed-segments";

const execFileAsync = promisify(execFile);
const ALIGN_TIMEOUT_MS = 4 * 60 * 60 * 1000;

function projectRoot(): string {
  const fromEnv = process.env.FAITH_ROOT?.trim();
  if (fromEnv) return fromEnv;
  return Reflect.apply(process.cwd, process, []) as string;
}

export type ForcedAlignmentResult = {
  model: string;
  words: WordTiming[];
};

function pythonPath(): string {
  return join(projectRoot(), ".venv-alignment", "bin", "python3");
}

export function forcedAlignmentAvailable(): boolean {
  if (process.env.FORCED_ALIGNMENT_ENABLED === "0") return false;
  return (
    existsSync(/* turbopackIgnore: true */ pythonPath()) &&
    existsSync(
      /* turbopackIgnore: true */ join(
        projectRoot(),
        "ml",
        "alignment",
        "align.py",
      ),
    )
  );
}

/**
 * OpenAI가 확정한 전사문은 바꾸지 않고 무료 Wav2Vec2 모델로 단어 시각만
 * 오디오에 강제 정렬한다. 실행 환경이 없거나 실패하면 호출자가 API 시각으로
 * 안전하게 되돌아갈 수 있도록 예외를 던진다.
 */
export async function forceAlignTranscript(params: {
  audioPath: string;
  text: string;
  parts: string[];
  partRanges: Array<{ startSec: number; endSec: number }>;
  /** 전사 세그먼트 시각. 5분 청크를 문장 단위 창으로 쪼개 정렬을 앞당긴다. */
  timedSegments?: TimedSegment[];
  durationSec: number;
  workDir: string;
}): Promise<ForcedAlignmentResult> {
  if (!forcedAlignmentAvailable()) {
    throw new Error("한국어 강제 정렬 실행 환경이 없습니다.");
  }
  mkdirSync(params.workDir, { recursive: true });
  const inputPath = join(params.workDir, "forced-alignment-input.json");
  const outputPath = join(params.workDir, "forced-alignment-output.json");
  writeFileSync(
    inputPath,
    JSON.stringify({
      text: params.parts.join("\n") || params.text,
      durationSec: params.durationSec,
      partRanges: params.partRanges,
      timedSegments: params.timedSegments ?? [],
    }),
    "utf8",
  );
  try {
    await execFileAsync(
      pythonPath(),
      [
        join(projectRoot(), "ml", "alignment", "align.py"),
        params.audioPath,
        inputPath,
        outputPath,
        "--model-dir",
        join(projectRoot(), ".data", "models", "alignment"),
      ],
      {
        cwd: projectRoot(),
        env: process.env,
        timeout: ALIGN_TIMEOUT_MS,
        maxBuffer: 16 * 1024 * 1024,
        killSignal: "SIGKILL",
      },
    );
    const parsed = JSON.parse(readFileSync(outputPath, "utf8")) as {
      model?: unknown;
      words?: Array<{
        text?: unknown;
        startSec?: unknown;
        endSec?: unknown;
      }>;
    };
    const words = (parsed.words ?? [])
      .map((word) => ({
        text: String(word.text ?? "").trim(),
        startSec: Number(word.startSec),
        endSec: Number(word.endSec),
      }))
      .filter(
        (word) =>
          word.text.length > 0 &&
          Number.isFinite(word.startSec) &&
          Number.isFinite(word.endSec) &&
          word.endSec > word.startSec,
      );
    if (words.length < 3) {
      throw new Error("강제 정렬 단어 시각이 비어 있습니다.");
    }
    return {
      model: String(parsed.model ?? "whisperx-korean"),
      words,
    };
  } finally {
    rmSync(inputPath, { force: true });
    rmSync(outputPath, { force: true });
  }
}
