/**
 * KTV 다화자 브리핑에서 음성 cluster와 모델 최종 화자 확정을 비교한다.
 *
 * 클로바 녹취는 제품 입력에 넣지 않고 평가 정답지로만 마지막에 읽는다.
 * npx tsx --tsconfig tsconfig.json scripts/eval-ktv-speaker-reconcile.ts
 */
import { config } from "dotenv";
import { readFileSync, writeFileSync } from "node:fs";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import {
  diarizeAudio,
  glueBoundaryFragmentSpeakers,
  prunePhantomSpeakers,
  type DiarizationResult,
} from "../src/lib/stt/diarization";
import {
  attachSpeakersToText,
  attachSpeakersToWordTimings,
  type SpeakerBlock,
} from "../src/lib/stt/speaker-attach";
import { reconcileSpeakerTurns } from "../src/lib/stt/speaker-turns";
import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";
import {
  DEFAULT_STT_MODEL,
  isSttModel,
} from "../src/lib/stt/models";
import type {
  TimedSegment,
  WordTiming,
} from "../src/lib/stt/timed-segments";

const ROOT = ".data/stt-bench";
const DIAR_CACHE =
  process.env.DIAR_CACHE ?? `${ROOT}/ktv__local-diarization.json`;
const WORD_CACHE = process.env.WORD_CACHE;
const TEXT_CACHE = process.env.TEXT_CACHE;
const STT_CACHE =
  process.env.STT_CACHE ?? `${ROOT}/ktv__fresh-stt-word-timings.json`;
const AUDIO = `${ROOT}/ktv-briefing-20251231.mp3`;
const requestedSttModel = process.env.STT_MODEL?.trim() ?? "";
const STT_MODEL = isSttModel(requestedSttModel)
  ? requestedSttModel
  : DEFAULT_STT_MODEL;
const REFERENCE =
  process.env.REFERENCE ??
  "/Users/905jjw/Downloads/ktv-briefing-20251231 (1).txt";

type ReferenceTurn = { speaker: string; text: string };

function norm(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function bigrams(text: string): Map<string, number> {
  const value = norm(text);
  const counts = new Map<string, number>();
  for (let index = 0; index + 1 < value.length; index += 1) {
    const gram = value.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  return counts;
}

/** 후보가 긴 정답 턴의 일부여도 잡히도록 block 기준 bigram recall을 쓴다. */
function similarity(block: string, reference: string): number {
  const left = bigrams(block);
  const right = bigrams(reference);
  let total = 0;
  let hit = 0;
  for (const [gram, count] of left) {
    total += count;
    hit += Math.min(count, right.get(gram) ?? 0);
  }
  return total > 0 ? hit / total : 0;
}

function parseReference(text: string): ReferenceTurn[] {
  const turns: ReferenceTurn[] = [];
  let current: ReferenceTurn | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const marker = line.match(/^참석자\s+(\d+)\s+\d{2}:\d{2}$/);
    if (marker) {
      if (current?.text.trim()) turns.push(current);
      current = { speaker: `참석자 ${marker[1]}`, text: "" };
      continue;
    }
    if (current && line) current.text = `${current.text} ${line}`.trim();
  }
  if (current?.text.trim()) turns.push(current);
  return turns;
}

function expectedSpeakers(
  blocks: SpeakerBlock[],
  reference: ReferenceTurn[],
): Array<{ speaker: string; score: number }> {
  const out: Array<{ speaker: string; score: number }> = [];
  let cursor = 0;
  for (const block of blocks) {
    let bestIndex = cursor;
    let bestScore = -1;
    const lo = Math.max(0, cursor - 1);
    for (let index = lo; index < reference.length; index += 1) {
      const score = similarity(block.text, reference[index]!.text);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
      if (score >= 0.92) break;
    }
    cursor = Math.max(cursor, bestIndex);
    out.push({
      speaker: reference[bestIndex]?.speaker ?? "unknown",
      score: Math.max(0, bestScore),
    });
  }
  return out;
}

function coassignment(
  blocks: SpeakerBlock[],
  expected: Array<{ speaker: string }>,
): number {
  let correct = 0;
  let total = 0;
  for (let left = 0; left < blocks.length; left += 1) {
    for (let right = left + 1; right < blocks.length; right += 1) {
      const predictedSame = blocks[left]!.speaker === blocks[right]!.speaker;
      const expectedSame =
        expected[left]!.speaker === expected[right]!.speaker;
      total += 1;
      if (predictedSame === expectedSame) correct += 1;
    }
  }
  return total > 0 ? correct / total : 1;
}

function approximateWords(segments: TimedSegment[]): WordTiming[] {
  return segments.flatMap((segment) => {
    const tokens = [...segment.text.matchAll(/[\p{L}\p{N}]+/gu)].map(
      (match) => match[0],
    );
    const span = Math.max(0.08, segment.endSec - segment.startSec);
    return tokens.map((text, index) => ({
      text,
      startSec: segment.startSec + (span * index) / Math.max(1, tokens.length),
      endSec:
        segment.startSec +
        (span * (index + 1)) / Math.max(1, tokens.length),
    }));
  });
}

async function main() {
  let text = readFileSync(
    `${ROOT}/mtg-stt-ktv__glossary-transcript.txt`,
    "utf8",
  ).trim();
  let timedRaw = JSON.parse(
    readFileSync(`${ROOT}/ktv__timed-segments.json`, "utf8"),
  ) as { durationSec: number; segments: TimedSegment[] };
  let freshWords: WordTiming[] | undefined;
  if (process.env.LIVE_STT === "1") {
    const stt = await chunkedTranscribe({
      audioPath: AUDIO,
      workDir: `${ROOT}/ktv-community-stt-chunks`,
      model: STT_MODEL,
      wordTimestamps: true,
    });
    text = stt.text;
    timedRaw = { durationSec: stt.durationSec, segments: stt.timedSegments };
    freshWords = stt.wordTimings;
    writeFileSync(
      STT_CACHE,
      JSON.stringify(
        {
          text,
          durationSec: stt.durationSec,
          segments: stt.timedSegments,
          words: stt.wordTimings,
        },
        null,
        2,
      ),
    );
  } else if (process.env.USE_STT_CACHE === "1") {
    const cached = JSON.parse(readFileSync(STT_CACHE, "utf8")) as {
      text: string;
      durationSec: number;
      segments: TimedSegment[];
      words: WordTiming[];
    };
    text = cached.text;
    timedRaw = { durationSec: cached.durationSec, segments: cached.segments };
    freshWords = cached.words;
  }
  if (TEXT_CACHE) {
    const stored = JSON.parse(readFileSync(TEXT_CACHE, "utf8")) as {
      text?: string;
    };
    if (stored.text?.trim()) text = stored.text.trim();
  }
  const rawDiarization =
    process.env.LIVE_DIARIZATION === "1"
      ? await diarizeAudio({ audioPath: AUDIO })
      : (JSON.parse(readFileSync(DIAR_CACHE, "utf8")) as DiarizationResult);
  if (process.env.LIVE_DIARIZATION === "1") {
    writeFileSync(DIAR_CACHE, JSON.stringify(rawDiarization, null, 2));
  }
  // diarizeAudio 제품 경로는 이미 prune/glue를 한 번 적용한다. 같은 후처리를
  // 두 번 돌리면 Community-1의 짧은 실제 화자가 추가로 제거될 수 있다.
  const diarization =
    process.env.LIVE_DIARIZATION === "1" ||
    process.env.DIAR_CACHE_PROCESSED === "1"
      ? rawDiarization
      : glueBoundaryFragmentSpeakers(prunePhantomSpeakers(rawDiarization));
  let wordTimings = freshWords ?? approximateWords(timedRaw.segments);
  if (WORD_CACHE) {
    const stored = JSON.parse(readFileSync(WORD_CACHE, "utf8")) as
      | WordTiming[]
      | {
          words?: WordTiming[];
          transcript?: { lines?: Array<{ words?: WordTiming[] }> };
        };
    wordTimings = Array.isArray(stored)
      ? stored
      : (stored.words ??
        (stored.transcript?.lines ?? []).flatMap((line) => line.words ?? []));
  }
  let rawBlocks = attachSpeakersToWordTimings({
    text,
    wordTimings,
    timedSegments: timedRaw.segments,
    diarization,
  });
  if (rawBlocks.length === 0) {
    rawBlocks = attachSpeakersToText({
      text,
      timedSegments: timedRaw.segments,
      diarization,
      durationSec: timedRaw.durationSec,
      mergeAdjacent: false,
    });
  }
  if (process.env.RAW_ONLY === "1") {
    const fromSec = Number(process.env.FROM_SEC ?? 0);
    const toSec = Number(process.env.TO_SEC ?? Number.POSITIVE_INFINITY);
    rawBlocks.forEach((block, index) => {
      if (block.endSec < fromSec || block.startSec > toSec) return;
      console.log(
        `${index}\t${block.startSec.toFixed(1)}-${block.endSec.toFixed(1)}\t${block.speaker}\t${block.text}`,
      );
    });
    return;
  }

  if (process.env.SKIP_RECONCILE === "1") {
    const reference = parseReference(readFileSync(REFERENCE, "utf8"));
    const rawExpected = expectedSpeakers(rawBlocks, reference);
    console.log(
      JSON.stringify(
        {
          model: rawDiarization.model,
          wallMs: rawDiarization.wallMs,
          raw: {
            blocks: rawBlocks.length,
            speakers: new Set(rawBlocks.map((block) => block.speaker)).size,
            coassignment: coassignment(rawBlocks, rawExpected),
          },
        },
        null,
        2,
      ),
    );
    return;
  }

  const reconciled = await reconcileSpeakerTurns(rawBlocks);

  // 정답지는 모델 호출이 모두 끝난 뒤 평가에만 연다.
  const reference = parseReference(readFileSync(REFERENCE, "utf8"));
  const rawExpected = expectedSpeakers(rawBlocks, reference);
  const reconciledExpected = expectedSpeakers(reconciled.blocks, reference);
  const result = {
    raw: {
      blocks: rawBlocks.length,
      speakers: new Set(rawBlocks.map((block) => block.speaker)).size,
      coassignment: coassignment(rawBlocks, rawExpected),
    },
    reconciled: {
      blocks: reconciled.blocks.length,
      speakers: new Set(reconciled.blocks.map((block) => block.speaker)).size,
      coassignment: coassignment(reconciled.blocks, reconciledExpected),
    },
    usage: reconciled.usage,
  };
  console.log(JSON.stringify(result, null, 2));
  console.log("\n최종 블록:");
  reconciled.blocks.forEach((block, index) => {
    const expected = reconciledExpected[index]!;
    console.log(
      `[${block.startSec.toFixed(1)}] ${block.speaker} / ${expected.speaker} (${expected.score.toFixed(2)}): ${block.text.slice(0, 100)}`,
    );
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
