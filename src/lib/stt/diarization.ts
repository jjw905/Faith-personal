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
 * 프로젝트 루트. 빌드 시 process.cwd()를 정적으로 두면 Turbopack NFT가
 * 저장소 전체(.data, Faith-office, .venv 심볼릭 링크)를 끌어와 배포 빌드가
 * 커지거나 깨진다. env 우선, cwd는 간접 호출로만 읽는다.
 */
function projectRoot(): string {
  const fromEnv = process.env.FAITH_ROOT?.trim();
  if (fromEnv) return fromEnv;
  return Reflect.apply(process.cwd, process, []) as string;
}

function runtimePath(...parts: string[]): string {
  return join(projectRoot(), ...parts);
}

/** NFT가 경로 트리를 펼치지 않도록 existsSync 인자에 ignore를 붙인다. */
function pathExists(target: string): boolean {
  return existsSync(/* turbopackIgnore: true */ target);
}

function pythonExecutable(): string {
  const explicit = process.env.DIARIZATION_PYTHON?.trim();
  if (explicit) return explicit;
  const local = runtimePath(".venv-diarization", "bin", "python3");
  return pathExists(local) ? local : "python3";
}

function modelsReady(): boolean {
  const publicModelsReady =
    pathExists(
      runtimePath(
        ".data",
        "models",
        "diarization",
        "sherpa-onnx-pyannote-segmentation-3-0",
        "model.onnx",
      ),
    ) &&
    pathExists(
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
  if (!pathExists(runtimePath("ml", "diarization", "diarize.py"))) {
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
    const workDir = projectRoot();
    const { stdout } = await execFileAsync(pythonExecutable(), args, {
      cwd: workDir,
      env: process.env,
      maxBuffer: 16 * 1024 * 1024,
      timeout: TIMEOUT_MS,
      killSignal: "SIGKILL",
    });
    const result = JSON.parse(stdout) as DiarizationResult;
    if (!Array.isArray(result.segments)) {
      throw new Error("화자분리 결과 형식이 올바르지 않습니다.");
    }
    // Community-1의 exclusive diarization은 전사 시각 결합을 위해 이미
    // 겹침 없는 화자 경계를 만든다. Sherpa 경계 잡음 보정을 다시 적용하면
    // KTV의 실제 8번째 질문자를 유령 화자로 오인해 7명으로 합쳤다.
    if (result.model.includes("speaker-diarization-community-1")) {
      return {
        ...result,
        speakerCount: new Set(result.segments.map((segment) => segment.speaker))
          .size,
      };
    }
    return glueBoundaryFragmentSpeakers(prunePhantomSpeakers(result));
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

/**
 * 화자 전환부에서 생기는 "유령 화자" 잡음.
 *
 * 진행자가 말을 마치는 순간과 다음 화자가 입을 떼는 순간 사이는 짧고
 * 발화 특징이 흐릿해 임베딩이 불안정하다. 그 결과 "네, 안녕하세요" 같은
 * 짧은 인사말이 매번 다른 사람 것인데도 하나의 낯선 클러스터로 뭉치는
 * 경우가 있다 — 실제 KTV 브리핑 녹취에서 반복 확인됨(전환마다 등장,
 * 매번 다른 화자 앞뒤로 거의 틈 없이 붙음, 발화량은 매번 몇 초뿐).
 *
 * 이런 클러스터는 "화자"가 아니라 경계 잡음으로 보고, 각 조각을 실제
 * 이웃 화자에게 돌려준다. 뒤에 진짜 침묵(화자 교대)이 있으면 그 인사말은
 * 다음에 말할 사람의 발화 시작으로 본다 — 내용도 대개 인사말이라 이 쪽이
 * 맞다. 양쪽 다 거의 붙어 있으면 더 가까운 쪽으로 준다.
 */
const FRAGMENT_MAX_SEGMENT_SEC = 6;
const FRAGMENT_MAX_TOTAL_SEC = 40;
const FRAGMENT_GLUE_GAP_SEC = 1;
const FRAGMENT_MIN_OCCURRENCES = 2;

export function glueBoundaryFragmentSpeakers(
  result: DiarizationResult,
): DiarizationResult {
  const segments = [...result.segments].sort((a, b) => a.startSec - b.startSec);
  if (segments.length < 3) return result;

  const bySpeaker = new Map<string, DiarizationSegment[]>();
  for (const s of segments) {
    const list = bySpeaker.get(s.speaker) ?? [];
    list.push(s);
    bySpeaker.set(s.speaker, list);
  }

  /**
   * s 직전/직후, 다른(제외 대상이 아닌) 화자의 가장 가까운 구간.
   * 겹침은 틈이 아니라 붙어 있는 것으로 본다(음수 틈은 0으로 자른다) —
   * 화자분리 경계가 살짝 겹치는 것은 흔한 반올림 오차다.
   */
  const nearestBefore = (
    s: { startSec: number },
    exclude: (speaker: string) => boolean,
  ): DiarizationSegment | undefined => {
    let best: DiarizationSegment | undefined;
    for (const o of segments) {
      if (exclude(o.speaker) || o.startSec >= s.startSec) continue;
      if (!best || o.startSec > best.startSec) best = o;
    }
    return best;
  };

  const nearestAfter = (
    s: { startSec: number },
    exclude: (speaker: string) => boolean,
  ): DiarizationSegment | undefined => {
    let best: DiarizationSegment | undefined;
    for (const o of segments) {
      if (exclude(o.speaker) || o.startSec <= s.startSec) continue;
      if (!best || o.startSec < best.startSec) best = o;
    }
    return best;
  };

  const gapTo = (edgeSec: number, otherEndSec: number): number =>
    Math.max(0, edgeSec - otherEndSec);

  /** 같은 화자끼리 틈이 좁으면 하나의 등장으로 묶는다(경계 판정 단위). */
  const OCCURRENCE_MERGE_GAP_SEC = 2;
  function mergeIntoOccurrences(
    segs: DiarizationSegment[],
  ): Array<{ startSec: number; endSec: number }> {
    const sorted = [...segs].sort((a, b) => a.startSec - b.startSec);
    const out: Array<{ startSec: number; endSec: number }> = [];
    for (const s of sorted) {
      const last = out[out.length - 1];
      if (last && s.startSec - last.endSec <= OCCURRENCE_MERGE_GAP_SEC) {
        last.endSec = Math.max(last.endSec, s.endSec);
      } else {
        out.push({ startSec: s.startSec, endSec: s.endSec });
      }
    }
    return out;
  }

  const fragmentSpeakers = new Set<string>();
  for (const [speaker, segs] of bySpeaker) {
    if (segs.length < FRAGMENT_MIN_OCCURRENCES) continue;
    const maxDur = Math.max(...segs.map((s) => s.endSec - s.startSec));
    const totalDur = segs.reduce((sum, s) => sum + (s.endSec - s.startSec), 0);
    if (maxDur > FRAGMENT_MAX_SEGMENT_SEC || totalDur > FRAGMENT_MAX_TOTAL_SEC) {
      continue;
    }
    const isSelf = (sp: string) => sp === speaker;
    const occurrences = mergeIntoOccurrences(segs);
    const allBoundaryAdjacent = occurrences.every((occ) => {
      const before = nearestBefore(occ, isSelf);
      const after = nearestAfter(occ, isSelf);
      const gapBefore = before ? gapTo(occ.startSec, before.endSec) : Infinity;
      const gapAfter = after ? gapTo(after.startSec, occ.endSec) : Infinity;
      return gapBefore <= FRAGMENT_GLUE_GAP_SEC || gapAfter <= FRAGMENT_GLUE_GAP_SEC;
    });
    if (allBoundaryAdjacent) fragmentSpeakers.add(speaker);
  }
  if (fragmentSpeakers.size === 0) return result;

  const isFragment = (sp: string) => fragmentSpeakers.has(sp);
  const glued = segments.map((s) => {
    if (!isFragment(s.speaker)) return s;
    const before = nearestBefore(s, isFragment);
    const after = nearestAfter(s, isFragment);
    const gapBefore = before ? gapTo(s.startSec, before.endSec) : Infinity;
    const gapAfter = after ? gapTo(after.startSec, s.endSec) : Infinity;

    // 기본은 "붙어 있는 쪽"(끊김 없는 오디오는 대개 같은 사람이 이어 말한
    // 것)이다. 인사말처럼 다음 화자 것으로 봐야 하는 예외는, 본문 텍스트를
    // 아는 speaker-attach 쪽에서 내용을 보고 다시 넘겨준다(attachSpeakersToText
    // 의 reassignGreetingFragments).
    let target: DiarizationSegment | undefined;
    if (before && gapBefore <= FRAGMENT_GLUE_GAP_SEC) {
      target = before;
    } else if (after && gapAfter <= FRAGMENT_GLUE_GAP_SEC) {
      target = after;
    } else if (before && gapBefore <= gapAfter) {
      target = before;
    } else {
      target = after ?? before;
    }
    return target ? { ...s, speaker: target.speaker } : s;
  });

  return {
    ...result,
    segments: glued,
    speakerCount: new Set(glued.map((segment) => segment.speaker)).size,
  };
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
  /** 단어는 끝 시각이 다음 화자 구간으로 늘어날 수 있어 시작점을 우선한다. */
  anchor?: "overlap" | "start";
}): Array<T & { speaker: string }> {
  const { timed, diarization, anchor = "overlap" } = params;
  const labels = speakerLabels(diarization.segments);

  return timed.map((seg) => {
    const startSec = Math.max(0, seg.startSec);
    const endSec = Math.max(startSec + 0.01, seg.endSec);

    const bySpeaker = new Map<string, number>();
    let anchored = false;
    if (anchor === "start") {
      const point = startSec + Math.min(0.05, (endSec - startSec) * 0.2);
      const active = diarization.segments.filter(
        (candidate) =>
          candidate.startSec <= point && point < candidate.endSec,
      );
      if (active.length > 0) {
        const picked = active.reduce((best, candidate) =>
          candidate.endSec - point > best.endSec - point ? candidate : best,
        );
        bySpeaker.set(picked.speaker, 1);
        anchored = true;
      }
    }
    for (const d of diarization.segments) {
      if (anchored) break;
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
