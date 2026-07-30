import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import {
  transcribeAudioOnce,
  transcribeMiniAudioOnce,
} from "@/lib/stt/chunked-transcribe";
import { requireAudioToolPath } from "@/lib/stt/local-tools";
import type { SttModel } from "@/lib/stt/models";
import { suggestSecondPassCorrections, type TermSuggestion } from "@/lib/stt/term-suggest";
import type { TimedSegment } from "@/lib/stt/timed-segments";

/** 신뢰도 하위 이 비율만 재확인한다. 60분 회의 기준 대략 7~9분 분량. */
const BOTTOM_PERCENT = 0.12;
/** 너무 짧은 구간은 잘라도 문맥이 없어 재확인 의미가 작다. */
const MIN_SEGMENT_SEC = 1.2;
/** 클립 경계에서 말이 잘리지 않도록 앞뒤로 살짝 더 잘라 붙인다. */
const CLIP_PADDING_SEC = 0.2;
/** 비용 상한. 회의가 아주 길어도 재확인은 이 개수를 넘지 않는다. */
const MAX_SEGMENTS = 60;

/** 손상된 오디오가 ffmpeg를 무한 루프에 빠뜨려도 이 프로세스 전체가 멈추지 않게. */
const EXTRACT_CLIP_TIMEOUT_MS = 60_000;

function extractClip(
  audioPath: string,
  startSec: number,
  endSec: number,
  outPath: string,
) {
  execFileSync(
    requireAudioToolPath("ffmpeg"),
    [
      "-y",
      "-v",
      "error",
      "-i",
      audioPath,
      "-ss",
      String(Math.max(0, startSec)),
      "-t",
      String(Math.max(0.2, endSec - startSec)),
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      outPath,
    ],
    {
      stdio: "pipe",
      timeout: EXTRACT_CLIP_TIMEOUT_MS,
      killSignal: "SIGKILL",
    },
  );
}

export type SecondPassSuggestion = TermSuggestion & { startSec: number };

export type SecondPassResult = {
  suggestions: SecondPassSuggestion[];
  segmentCount: number;
  audioSec: number;
};

/**
 * 60분을 전부 다시 돌리지 않고, 신뢰도가 가장 낮았던(겹쳐 말하기·잡음 등으로
 * 알아듣기 어려웠을) 문장만 짧게 잘라 mini로 한 번 더 확인한다.
 * 실시간 회의에서 저신뢰 발화를 즉시 재확인하는 것과 같은 방식을, 업로드
 * 회의에서는 신뢰도 하위 구간만 골라 배치로 적용한 것이다.
 */
export async function runSelectiveSecondPass(params: {
  audioPath: string;
  workDir: string;
  timedSegments: TimedSegment[];
  glossary: string[];
  bottomPercent?: number;
}): Promise<SecondPassResult> {
  const candidates = params.timedSegments.filter(
    (segment) =>
      typeof segment.confidence === "number" &&
      segment.text.trim().length > 0 &&
      segment.endSec - segment.startSec >= MIN_SEGMENT_SEC,
  );
  if (candidates.length === 0) {
    return { suggestions: [], segmentCount: 0, audioSec: 0 };
  }

  const pct = params.bottomPercent ?? BOTTOM_PERCENT;
  const count = Math.min(
    MAX_SEGMENTS,
    Math.max(1, Math.round(candidates.length * pct)),
  );
  const selected = [...candidates]
    .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))
    .slice(0, count);

  mkdirSync(params.workDir, { recursive: true });
  const out: SecondPassSuggestion[] = [];
  let audioSec = 0;

  for (let i = 0; i < selected.length; i++) {
    const segment = selected[i]!;
    const clipPath = join(params.workDir, `hard_${i}.mp3`);
    try {
      extractClip(
        params.audioPath,
        segment.startSec - CLIP_PADDING_SEC,
        segment.endSec + CLIP_PADDING_SEC,
        clipPath,
      );
      if (!existsSync(clipPath)) continue;
      audioSec += segment.endSec - segment.startSec + CLIP_PADDING_SEC * 2;

      const retry = await transcribeMiniAudioOnce({
        audioBytes: readFileSync(clipPath),
        filename: `hard_${i}.mp3`,
        glossary: params.glossary,
      });
      if (!retry.text.trim() || retry.text.trim() === segment.text.trim()) {
        continue;
      }

      const suggestions = suggestSecondPassCorrections({
        original: segment.text,
        secondPass: retry.text,
        glossary: params.glossary,
        sttLogprob: retry.meanLogprob,
      });
      out.push(
        ...suggestions.map((suggestion) => ({
          ...suggestion,
          startSec: segment.startSec,
        })),
      );
    } catch (err) {
      console.warn(`[stt] 저신뢰 구간 재확인 실패 (구간 ${i + 1}/${selected.length})`, err);
    } finally {
      rmSync(clipPath, { force: true });
    }
  }

  return { suggestions: out, segmentCount: selected.length, audioSec };
}

export type ProperNounRecheck = {
  original: string;
  reheard: string;
  startSec: number;
  endSec: number;
};

export type ProperNounSecondPassResult = {
  rechecks: ProperNounRecheck[];
  checkedCount: number;
  audioSec: number;
};

/**
 * 사전에 없는 낱말(대부분 고유명사) 후보 구간만 골라 더 비싼 모델로 한 번
 * 다시 듣는다. 사전 교정과 달리 "정답 낱말"을 몰라도 시도할 수 있는 방식 —
 * 재확인 결과가 원래와 다르면 사람이 볼 후보로만 남기고, 자동으로 바꾸지 않는다.
 */
export async function runProperNounSecondPass(params: {
  audioPath: string;
  workDir: string;
  timedSegments: TimedSegment[];
  candidates: Array<{ text: string }>;
  model?: SttModel;
  glossary?: string[];
}): Promise<ProperNounSecondPassResult> {
  if (params.candidates.length === 0) {
    return { rechecks: [], checkedCount: 0, audioSec: 0 };
  }
  mkdirSync(params.workDir, { recursive: true });
  const usedSegments = new Set<number>();
  const rechecks: ProperNounRecheck[] = [];
  let audioSec = 0;
  let checked = 0;

  for (const candidate of params.candidates) {
    const segIndex = params.timedSegments.findIndex(
      (segment, index) =>
        !usedSegments.has(index) &&
        segment.text.includes(candidate.text) &&
        segment.endSec - segment.startSec >= MIN_SEGMENT_SEC,
    );
    if (segIndex < 0) continue;
    usedSegments.add(segIndex);
    const segment = params.timedSegments[segIndex]!;
    checked += 1;
    const clipPath = join(params.workDir, `noun_${checked}.mp3`);
    try {
      extractClip(
        params.audioPath,
        segment.startSec - CLIP_PADDING_SEC,
        segment.endSec + CLIP_PADDING_SEC,
        clipPath,
      );
      if (!existsSync(clipPath)) continue;
      audioSec += segment.endSec - segment.startSec + CLIP_PADDING_SEC * 2;

      const retry = await transcribeAudioOnce({
        audioBytes: readFileSync(clipPath),
        filename: `noun_${checked}.mp3`,
        model: params.model ?? "gpt-4o-transcribe",
        glossary: params.glossary,
      });
      const rehead = retry.text.trim();
      if (!rehead || rehead === segment.text.trim()) continue;
      rechecks.push({
        original: segment.text,
        reheard: rehead,
        startSec: segment.startSec,
        endSec: segment.endSec,
      });
    } catch (err) {
      console.warn(`[stt] 고유명사 재확인 실패 (구간 ${checked})`, err);
    } finally {
      rmSync(clipPath, { force: true });
    }
  }

  return { rechecks, checkedCount: checked, audioSec };
}
