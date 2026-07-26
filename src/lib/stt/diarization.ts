import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import type { RealtimeUtterance } from "@/lib/stt/realtime/types";

const execFileAsync = promisify(execFile);

export type DiarizationSegment = {
  startSec: number;
  endSec: number;
  speaker: string;
};

export type DiarizationResult = {
  model: string;
  device: string;
  durationSec: number;
  wallMs: number;
  speakerCount: number;
  segments: DiarizationSegment[];
};

export type SpeakerUtterance = RealtimeUtterance & {
  speaker: string;
};

function pythonExecutable(): string {
  const local = join(process.cwd(), ".venv-diarization", "bin", "python3");
  return existsSync(local) ? local : "python3";
}

export function assertDiarizationConfigured(): void {
  const publicModelsReady =
    existsSync(
      join(
        process.cwd(),
        ".data",
        "models",
        "diarization",
        "sherpa-onnx-pyannote-segmentation-3-0",
        "model.onnx",
      ),
    ) &&
    existsSync(
      join(
        process.cwd(),
        ".data",
        "models",
        "diarization",
        "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx",
      ),
    );
  if (
    !process.env.HF_TOKEN?.trim() &&
    !process.env.PYANNOTE_MODEL_PATH?.trim() &&
    !publicModelsReady
  ) {
    throw new Error(
      "화자분리 모델이 없습니다. npm run diarization:setup을 실행하세요.",
    );
  }
}

/** pyannote Community-1을 로컬 프로세스로 실행한다. */
export async function diarizeAudio(params: {
  audioPath: string;
  maxAudioSec?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
}): Promise<DiarizationResult> {
  assertDiarizationConfigured();
  const script = join(process.cwd(), "ml", "diarization", "diarize.py");
  const args = [script, params.audioPath];
  if (params.maxAudioSec && params.maxAudioSec > 0) {
    args.push("--max-seconds", String(params.maxAudioSec));
  }
  if (params.minSpeakers && params.minSpeakers > 0) {
    args.push("--min-speakers", String(params.minSpeakers));
  }
  if (params.maxSpeakers && params.maxSpeakers > 0) {
    args.push("--max-speakers", String(params.maxSpeakers));
  }

  try {
    const { stdout } = await execFileAsync(pythonExecutable(), args, {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
    });
    const result = JSON.parse(stdout) as DiarizationResult;
    if (!Array.isArray(result.segments)) {
      throw new Error("화자분리 결과 형식이 올바르지 않습니다.");
    }
    return result;
  } catch (error) {
    const detail =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr).trim()
        : error instanceof Error
          ? error.message
          : String(error);
    throw new Error(detail || "화자분리 실행에 실패했습니다.");
  }
}

function speakerLabels(segments: DiarizationSegment[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const segment of [...segments].sort((a, b) => a.startSec - b.startSec)) {
    if (labels.has(segment.speaker)) continue;
    const index = labels.size;
    const token =
      index < 26 ? String.fromCharCode(65 + index) : String(index + 1);
    labels.set(segment.speaker, `화자 ${token}`);
  }
  return labels;
}

function overlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
): number {
  return Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));
}

/**
 * Realtime 모델의 완료 발화 단위에 pyannote의 배타적 화자 구간을 맞춘다.
 * 텍스트를 재분할하지 않고 가장 많이 겹친 모델 화자를 붙인다.
 */
export function alignRealtimeUtterancesToSpeakers(params: {
  utterances: RealtimeUtterance[];
  diarization: DiarizationResult;
  durationSec: number;
}): SpeakerUtterance[] {
  const { utterances, diarization, durationSec } = params;
  const segments = diarization.segments;
  const labels = speakerLabels(segments);

  return utterances.map((utterance, index) => {
    const startSec = Math.max(0, utterance.startSec);
    const nextStart = utterances[index + 1]?.startSec;
    const endSec = Math.max(
      startSec + 0.01,
      Math.min(durationSec, nextStart ?? durationSec),
    );

    let best: DiarizationSegment | undefined;
    let bestOverlap = 0;
    for (const segment of segments) {
      const amount = overlap(
        startSec,
        endSec,
        segment.startSec,
        segment.endSec,
      );
      if (amount > bestOverlap) {
        best = segment;
        bestOverlap = amount;
      }
    }

    if (!best && segments.length > 0) {
      const midpoint = (startSec + endSec) / 2;
      best = segments.reduce((nearest, segment) => {
        const nearestMid = (nearest.startSec + nearest.endSec) / 2;
        const segmentMid = (segment.startSec + segment.endSec) / 2;
        return Math.abs(segmentMid - midpoint) < Math.abs(nearestMid - midpoint)
          ? segment
          : nearest;
      });
    }

    return {
      ...utterance,
      speaker: best ? labels.get(best.speaker) ?? "화자 A" : "발화",
    };
  });
}

export function formatSpeakerTranscript(
  utterances: SpeakerUtterance[],
): string {
  return utterances
    .map(
      (utterance) =>
        `[${utterance.startSec.toFixed(2)}s][${utterance.speaker}] ${utterance.text.trim()}`,
    )
    .filter((line) => line.trim())
    .join("\n");
}
