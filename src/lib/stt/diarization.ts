import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

import { commandExists } from "@/lib/stt/local-tools";
import type { RealtimeUtterance } from "@/lib/stt/realtime/types";

const execFileAsync = promisify(execFile);

/**
 * 화자분리 상한 시간.
 *
 * 로컬 CPU에서 도는 파이썬이라 입력에 따라 몇 분이 걸린다. 멈춘 프로세스가
 * 업로드 작업을 영원히 붙잡으면 회의가 진행률 72%에서 끝나지 않는다.
 */
const TIMEOUT_MS = 20 * 60 * 1000;

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

/**
 * 실행 시점에만 알 수 있는 경로다.
 *
 * join(process.cwd(), "...") 형태로 쓰면 번들러가 그 폴더를 빌드 자원으로 보고
 * 통째로 훑는다. 가상환경 폴더에는 시스템 파이썬을 가리키는 심볼릭 링크가 있어
 * 훑는 순간 빌드가 깨진다. 경로를 함수 뒤에 숨겨 정적 분석 대상에서 뺀다.
 */
function runtimePath(...parts: string[]): string {
  return join(process.env.FAITH_ROOT || process.cwd(), ...parts);
}

function pythonExecutable(): string {
  const explicit = process.env.DIARIZATION_PYTHON?.trim();
  if (explicit) return explicit;
  const local = runtimePath(".venv-diarization", "bin", "python3");
  return existsSync(local) ? local : "python3";
}

function modelsReady(): boolean {
  const publicModelsReady =
    existsSync(
      runtimePath(
        ".data",
        "models",
        "diarization",
        "sherpa-onnx-pyannote-segmentation-3-0",
        "model.onnx",
      ),
    ) &&
    existsSync(
      runtimePath(
        ".data",
        "models",
        "diarization",
        "3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx",
      ),
    );
  return (
    Boolean(process.env.HF_TOKEN?.trim()) ||
    Boolean(process.env.PYANNOTE_MODEL_PATH?.trim()) ||
    publicModelsReady
  );
}

export type DiarizationAvailability =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * 화자분리를 쓸 수 있는지 실행 시점에 판별한다.
 *
 * 배포 서버에는 파이썬 가상환경도 모델 가중치도 없다. 여기서 걸러 내지 않으면
 * 업로드 처리가 없는 프로그램을 부르다 예외로 끝난다. DIARIZATION_ENABLED=0으로
 * 손수 끌 수도 있다.
 */
export function diarizationAvailability(): DiarizationAvailability {
  const toggle = (process.env.DIARIZATION_ENABLED ?? "").trim().toLowerCase();
  if (toggle === "0" || toggle === "false" || toggle === "off") {
    return { ok: false, reason: "DIARIZATION_ENABLED로 꺼져 있습니다." };
  }
  if (!existsSync(runtimePath("ml", "diarization", "diarize.py"))) {
    return { ok: false, reason: "화자분리 스크립트가 없습니다." };
  }
  const python = pythonExecutable();
  if (!commandExists(python)) {
    return { ok: false, reason: `파이썬을 찾을 수 없습니다 (${python}).` };
  }
  if (!modelsReady()) {
    return {
      ok: false,
      reason: "화자분리 모델이 없습니다. npm run diarization:setup을 실행하세요.",
    };
  }
  return { ok: true };
}

export function assertDiarizationConfigured(): void {
  const state = diarizationAvailability();
  if (!state.ok) throw new Error(state.reason);
}

/** pyannote Community-1을 로컬 프로세스로 실행한다. */
export async function diarizeAudio(params: {
  audioPath: string;
  maxAudioSec?: number;
  minSpeakers?: number;
  maxSpeakers?: number;
}): Promise<DiarizationResult> {
  assertDiarizationConfigured();
  const script = runtimePath("ml", "diarization", "diarize.py");
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
      timeout: TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    const result = JSON.parse(stdout) as DiarizationResult;
    if (!Array.isArray(result.segments)) {
      throw new Error("화자분리 결과 형식이 올바르지 않습니다.");
    }
    return prunePhantomSpeakers(result);
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

/** 사람 하나로 볼 최소 발언량. 이보다 짧은 무리는 잡음이나 겹쳐 말한 조각이다. */
const MIN_SPEAKER_SEC = 5;
const MIN_SPEAKER_SHARE = 0.01;

/**
 * 0.5초짜리 무리까지 화자로 세면 참석자 목록에 유령이 생긴다.
 * 발언량이 미미한 무리는 지운다. 그 시간대는 이웃 화자가 받아간다.
 */
export function prunePhantomSpeakers(
  result: DiarizationResult,
): DiarizationResult {
  const bySpeaker = new Map<string, number>();
  for (const s of result.segments) {
    const dur = Math.max(0, s.endSec - s.startSec);
    bySpeaker.set(s.speaker, (bySpeaker.get(s.speaker) ?? 0) + dur);
  }
  let total = 0;
  for (const v of bySpeaker.values()) total += v;
  if (total <= 0) return result;

  const keep = new Set(
    [...bySpeaker]
      .filter(
        ([, sec]) => sec >= MIN_SPEAKER_SEC && sec / total >= MIN_SPEAKER_SHARE,
      )
      .map(([name]) => name),
  );
  // 전부 걸러지면 원본을 그대로 둔다.
  if (keep.size === 0) return result;
  if (keep.size === bySpeaker.size) return result;

  const segments = result.segments.filter((s) => keep.has(s.speaker));
  return { ...result, segments, speakerCount: keep.size };
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

/** 시각이 붙은 전사 구간. */
type TimedLike = { startSec: number; endSec: number; text: string };

/**
 * STT 실측 구간에 화자를 붙인다. 가장 오래 겹친 화자를 쓴다.
 *
 * 텍스트를 다시 나누지 않는다. 한 구간에 두 사람이 걸쳐 있으면 더 많이 말한
 * 쪽으로 간다. 구간을 쪼개면 문장이 잘려 대화기록이 망가진다.
 */
export function assignSpeakersToTimedSegments<T extends TimedLike>(params: {
  timed: T[];
  diarization: DiarizationResult;
}): Array<T & { speaker: string }> {
  const { timed, diarization } = params;
  const labels = speakerLabels(diarization.segments);

  return timed.map((seg) => {
    const startSec = Math.max(0, seg.startSec);
    const endSec = Math.max(startSec + 0.01, seg.endSec);

    const bySpeaker = new Map<string, number>();
    for (const d of diarization.segments) {
      const amount = overlap(startSec, endSec, d.startSec, d.endSec);
      if (amount <= 0) continue;
      bySpeaker.set(d.speaker, (bySpeaker.get(d.speaker) ?? 0) + amount);
    }

    let best: string | undefined;
    let bestAmount = 0;
    for (const [speaker, amount] of bySpeaker) {
      if (amount > bestAmount) {
        best = speaker;
        bestAmount = amount;
      }
    }

    if (!best && diarization.segments.length > 0) {
      // 겹치는 화자가 없으면 (무음, 잡음) 가장 가까운 구간의 화자.
      const mid = (startSec + endSec) / 2;
      best = diarization.segments.reduce((nearest, d) => {
        const nearestMid = (nearest.startSec + nearest.endSec) / 2;
        const dMid = (d.startSec + d.endSec) / 2;
        return Math.abs(dMid - mid) < Math.abs(nearestMid - mid) ? d : nearest;
      }).speaker;
    }

    return {
      ...seg,
      speaker: best ? (labels.get(best) ?? "화자 A") : "발화",
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
