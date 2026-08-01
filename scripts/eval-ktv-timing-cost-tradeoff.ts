/**
 * KTV 다화자 브리핑에서 "타이밍 패스를 바꾸면 화자 품질이 얼마나 상하는가"를 잰다.
 *
 * 배경: 업로드 원가의 최대 항목은 본문 전사가 아니라 whisper-1 단어 시각
 * 패스($0.006/분)다. precision은 그 결과를 로컬 강제 정렬로 덮어쓰므로
 * 이미 낭비일 가능성이 있다. 화자 배정 품질을 지키면서 이 패스를 뺄 수
 * 있는지 확인한다.
 *
 * 화자분리는 오디오만 보므로 모든 arm에서 동일 캐시를 쓴다. 변수는
 * 본문 모델과 단어 시각 출처 둘뿐이다.
 *
 * ARM=candidate npx tsx --tsconfig tsconfig.json scripts/eval-ktv-timing-cost-tradeoff.ts
 * (ARM 미지정 시 세 arm을 순서대로 모두 실행)
 */
import { config } from "dotenv";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import { chunkedTranscribe } from "../src/lib/stt/chunked-transcribe";
import {
  diarizeAudio,
  glueBoundaryFragmentSpeakers,
  prunePhantomSpeakers,
  type DiarizationResult,
} from "../src/lib/stt/diarization";
import {
  forceAlignTranscript,
  forcedAlignmentAvailable,
} from "../src/lib/stt/forced-alignment";
import {
  attachSpeakersToText,
  attachSpeakersToWordTimings,
  type SpeakerBlock,
} from "../src/lib/stt/speaker-attach";
import { reconcileTranscriptVariants } from "../src/lib/stt/transcript-reconcile";
import type { SttModel } from "../src/lib/stt/models";
import type { TimedSegment, WordTiming } from "../src/lib/stt/timed-segments";

const ROOT = ".data/stt-bench";
const AUDIO = `${ROOT}/ktv-briefing-20251231.mp3`;
const DIAR_CACHE =
  process.env.DIAR_CACHE ?? `${ROOT}/ktv__local-diarization.json`;
const REFERENCE =
  process.env.REFERENCE ??
  "/Users/905jjw/Downloads/ktv-briefing-20251231 (1).txt";
const OUT = `${ROOT}/timing-cost-tradeoff`;

/** 원가 환산. 요금제 문서와 같은 기준을 쓴다. */
const KRW_PER_USD = 1440;

type Arm = {
  id: string;
  label: string;
  model: SttModel;
  /** true면 whisper-1 단어 시각 패스를 탄다. false면 mini Realtime 구간 시각. */
  wordTimestamps: boolean;
  /** 로컬 Wav2Vec2 강제 정렬로 단어 시각을 다시 만든다. */
  forcedAlignment: boolean;
  note: string;
};

const ARMS: Arm[] = [
  {
    id: "standard-now",
    label: "현행 standard (mini + whisper 단어시각)",
    model: "gpt-4o-mini-transcribe",
    wordTimestamps: true,
    forcedAlignment: false,
    note: "지금 Free/Pro 기본 경로",
  },
  {
    id: "precision-now",
    label: "현행 precision (gpt-transcribe + whisper 단어시각 + 강제정렬)",
    model: "gpt-transcribe",
    wordTimestamps: true,
    forcedAlignment: true,
    note: "지금 화자 구분 모드. whisper 단어시각은 강제정렬이 덮어씀",
  },
  {
    id: "candidate",
    label: "후보 C (mini + mini 구간시각 + 강제정렬)",
    model: "gpt-4o-mini-transcribe",
    wordTimestamps: false,
    forcedAlignment: true,
    note: "whisper 패스 제거. 단어 시각은 강제정렬로 복원",
  },
  /**
   * C가 precision보다 화자 묶음이 크게 나빴다(0.55 vs 0.94). 원인이 본문
   * 모델인지 타이밍 구간인지 가른다. D는 C에서 타이밍만 whisper로 되돌리고,
   * E는 C에서 본문만 gpt-transcribe로 되돌린다.
   */
  {
    id: "mini-whisper-aligned",
    label: "D (mini + whisper 구간시각 + 강제정렬)",
    model: "gpt-4o-mini-transcribe",
    wordTimestamps: true,
    forcedAlignment: true,
    note: "본문만 mini. 타이밍 구간은 whisper 유지",
  },
  {
    id: "gpt-minitiming-aligned",
    label: "E (gpt-transcribe + mini 구간시각 + 강제정렬)",
    model: "gpt-transcribe",
    wordTimestamps: false,
    forcedAlignment: true,
    note: "본문만 gpt-transcribe. 타이밍은 mini 구간",
  },
];

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

/**
 * 같은 화자로 묶었는지를 쌍 단위로 본다. 라벨 이름이 달라도(화자 A vs 참석자 3)
 * 묶음 구조가 같으면 1.0이다.
 */
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

/** 문자 단위 편집거리. 전사 정확도(CER) 산출용. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = new Uint32Array(b.length + 1);
  let curr = new Uint32Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    const swap = prev;
    prev = curr;
    curr = swap;
  }
  return prev[b.length]!;
}

function accuracyPct(hypothesis: string, reference: string): number {
  const hyp = norm(hypothesis);
  const ref = norm(reference);
  if (ref.length === 0) return 0;
  const distance = levenshtein(hyp, ref);
  return Math.max(0, (1 - distance / ref.length) * 100);
}

/** 강제 정렬이 실패했을 때만 쓰는 근사 단어 시각. */
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
        segment.startSec + (span * (index + 1)) / Math.max(1, tokens.length),
    }));
  });
}

function loadDiarization(): DiarizationResult {
  if (process.env.LIVE_DIARIZATION === "1") {
    throw new Error("LIVE_DIARIZATION은 runArm 밖에서 미리 처리한다.");
  }
  const raw = JSON.parse(readFileSync(DIAR_CACHE, "utf8")) as DiarizationResult;
  return process.env.DIAR_CACHE_PROCESSED === "1"
    ? raw
    : glueBoundaryFragmentSpeakers(prunePhantomSpeakers(raw));
}

type ArmResult = {
  arm: string;
  label: string;
  note: string;
  model: SttModel;
  wordTimestamps: boolean;
  forcedAlignment: boolean;
  durationSec: number;
  wallSec: number;
  sttUsd: number;
  structureUsd: number;
  totalUsd: number;
  wonPerMinute: number;
  textChars: number;
  accuracyPct: number;
  timedSegments: number;
  wordTimings: number;
  wordSource: "whisper" | "forced-align" | "approximate" | "none";
  blocks: number;
  speakers: number;
  coassignment: number;
};

async function runArm(
  arm: Arm,
  diarization: DiarizationResult,
  reference: ReferenceTurn[],
  referenceText: string,
): Promise<ArmResult> {
  console.log(`\n=== ${arm.id} — ${arm.label} ===`);
  const started = Date.now();

  const stt = await chunkedTranscribe({
    audioPath: AUDIO,
    workDir: `${ROOT}/timing-tradeoff-chunks/${arm.id}`,
    model: arm.model,
    wordTimestamps: arm.wordTimestamps,
    onProgress: (p) => {
      if (p.fraction >= 1 || Math.round(p.fraction * 100) % 25 === 0) {
        console.log(`  … 전사 ${(p.fraction * 100).toFixed(0)}%`);
      }
    },
  });
  console.log(
    `  전사 완료: ${stt.text.length}자, 구간 ${stt.timedSegments.length}, 단어 ${stt.wordTimings.length}, $${stt.usage.estimatedUsd.toFixed(4)}`,
  );

  // 제품 경로와 동일하게 gpt-transcribe가 아니면 독립 전사와 대조한다.
  let transcriptText = stt.text;
  let transcriptParts = stt.parts;
  let structureUsd = 0;
  if (arm.model !== "gpt-transcribe") {
    try {
      const reconciled = await reconcileTranscriptVariants({
        parts: stt.parts,
        partRanges: stt.partRanges,
        timedSegments: stt.timedSegments,
      });
      transcriptText = reconciled.text;
      transcriptParts = reconciled.parts;
      structureUsd = reconciled.usage.estimatedUsd ?? 0;
      console.log(`  본문 대조 완료: $${structureUsd.toFixed(4)}`);
    } catch (err) {
      console.warn("  본문 대조 실패, 원문 유지:", err);
    }
  }

  let wordTimings = stt.wordTimings;
  let wordSource: ArmResult["wordSource"] =
    wordTimings.length > 0 ? "whisper" : "none";

  if (arm.forcedAlignment) {
    if (!forcedAlignmentAvailable()) {
      console.warn("  강제 정렬 환경 없음 — 이 arm은 무효다");
    } else {
      try {
        const aligned = await forceAlignTranscript({
          audioPath: AUDIO,
          text: transcriptText,
          parts: transcriptParts,
          partRanges: stt.partRanges,
          durationSec: stt.durationSec,
          workDir: `${ROOT}/timing-tradeoff-chunks/${arm.id}/alignment`,
        });
        wordTimings = aligned.words;
        wordSource = "forced-align";
        console.log(
          `  강제 정렬 완료: ${aligned.model}, 단어 ${aligned.words.length}`,
        );
      } catch (err) {
        console.warn("  강제 정렬 실패:", err);
      }
    }
  }

  if (wordTimings.length === 0) {
    wordTimings = approximateWords(stt.timedSegments);
    wordSource = "approximate";
    console.warn("  단어 시각 없음 — 구간 비례 근사로 대체");
  }

  let blocks = attachSpeakersToWordTimings({
    text: transcriptText,
    wordTimings,
    timedSegments: stt.timedSegments,
    diarization,
  });
  if (blocks.length === 0) {
    blocks = attachSpeakersToText({
      text: transcriptText,
      timedSegments: stt.timedSegments,
      diarization,
      durationSec: stt.durationSec,
      mergeAdjacent: false,
    });
  }

  const expected = expectedSpeakers(blocks, reference);
  const wallSec = (Date.now() - started) / 1000;
  const sttUsd = stt.usage.estimatedUsd;
  const totalUsd = sttUsd + structureUsd;
  const minutes = stt.durationSec / 60;

  const result: ArmResult = {
    arm: arm.id,
    label: arm.label,
    note: arm.note,
    model: arm.model,
    wordTimestamps: arm.wordTimestamps,
    forcedAlignment: arm.forcedAlignment,
    durationSec: Number(stt.durationSec.toFixed(1)),
    wallSec: Number(wallSec.toFixed(1)),
    sttUsd: Number(sttUsd.toFixed(5)),
    structureUsd: Number(structureUsd.toFixed(5)),
    totalUsd: Number(totalUsd.toFixed(5)),
    wonPerMinute: Number(((totalUsd * KRW_PER_USD) / minutes).toFixed(2)),
    textChars: transcriptText.length,
    accuracyPct: Number(accuracyPct(transcriptText, referenceText).toFixed(1)),
    timedSegments: stt.timedSegments.length,
    wordTimings: wordTimings.length,
    wordSource,
    blocks: blocks.length,
    speakers: new Set(blocks.map((block) => block.speaker)).size,
    coassignment: Number(coassignment(blocks, expected).toFixed(4)),
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(
    join(OUT, `${arm.id}.json`),
    JSON.stringify({ ...result, blocksDetail: blocks }, null, 2),
    "utf8",
  );
  console.log(`  → ${JSON.stringify(result, null, 2)}`);
  return result;
}

async function main() {
  if (!existsSync(AUDIO)) throw new Error(`오디오 없음: ${AUDIO}`);
  if (!existsSync(DIAR_CACHE)) throw new Error(`화자분리 캐시 없음: ${DIAR_CACHE}`);
  if (!process.env.OPENAI_API_KEY?.trim()) {
    throw new Error("OPENAI_API_KEY가 필요합니다. .env.local을 확인해 주세요.");
  }

  let diarization: DiarizationResult;
  if (process.env.LIVE_DIARIZATION === "1") {
    console.log("화자분리 실행 중…");
    diarization = await diarizeAudio({ audioPath: AUDIO });
    writeFileSync(DIAR_CACHE, JSON.stringify(diarization, null, 2), "utf8");
  } else {
    diarization = loadDiarization();
  }
  console.log(
    `화자분리(공통): ${diarization.model}, 화자 ${diarization.speakerCount}명, 구간 ${diarization.segments.length}`,
  );

  // 정답지는 평가에만 쓴다. 파이프라인 입력에 넣지 않는다.
  const referenceRaw = readFileSync(REFERENCE, "utf8");
  const reference = parseReference(referenceRaw);
  const referenceText = reference.map((turn) => turn.text).join(" ");
  console.log(
    `정답지: 턴 ${reference.length}, 화자 ${new Set(reference.map((t) => t.speaker)).size}명, ${referenceText.length}자`,
  );

  const only = process.env.ARM?.trim();
  const targets = only ? ARMS.filter((arm) => arm.id === only) : ARMS;
  if (targets.length === 0) {
    throw new Error(`ARM=${only} 는 없다. 가능: ${ARMS.map((a) => a.id).join(", ")}`);
  }

  const results: ArmResult[] = [];
  for (const arm of targets) {
    try {
      results.push(await runArm(arm, diarization, reference, referenceText));
    } catch (err) {
      console.error(`[${arm.id}] 실패:`, err);
    }
  }

  console.log("\n=== 요약 ===");
  console.table(
    results.map((r) => ({
      arm: r.arm,
      "원가₩/분": r.wonPerMinute,
      "정확도%": r.accuracyPct,
      "화자수": r.speakers,
      "동일화자묶음": r.coassignment,
      "단어시각": r.wordSource,
      "블록": r.blocks,
      "실행초": r.wallSec,
    })),
  );

  writeFileSync(
    join(OUT, "summary.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        audio: AUDIO,
        krwPerUsd: KRW_PER_USD,
        diarization: {
          model: diarization.model,
          speakerCount: diarization.speakerCount,
        },
        referenceTurns: reference.length,
        referenceSpeakers: new Set(reference.map((t) => t.speaker)).size,
        results,
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nWrote ${join(OUT, "summary.json")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
