import type { SemanticDialogueLine } from "@/lib/stt/semantic-structure";
import type { TimelineSegment, TimelineSegmentKind } from "@/types/timeline";
import type { TranscriptLine, TranscriptWordTiming } from "@/types/transcript";
import { formatClock } from "@/lib/diarize-meeting";
import { lineStartSec } from "@/lib/transcript-time";

export type TimedSegment = {
  startSec: number;
  endSec: number;
  text: string;
  /** 0~1. STT가 이 구간을 얼마나 자신 있어 했는지 (모델이 안 주면 없음). */
  confidence?: number;
};

/** 단어 하나의 실측 시각(절대 초). STT가 준 원문 그대로, 아직 줄에 배정 전. */
export type WordTiming = {
  text: string;
  startSec: number;
  endSec: number;
};

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2),
  );
}

function textHasToken(text: string, token: string): boolean {
  const t = text.toLowerCase();
  const tok = token.toLowerCase();
  if (t.includes(tok)) return true;
  return tokenize(text).has(tok);
}

/** 공백, 문장부호 제거. 한국어는 조사 변형이 잦아 글자 단위로 비교한다. */
function normChars(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function bigramCounts(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i + 1 < s.length; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

type Prepared = {
  norm: string;
  grams: Map<string, number>;
  gramTotal: number;
};

function prepare(text: string): Prepared {
  const norm = normChars(text);
  const grams = bigramCounts(norm);
  let total = 0;
  for (const c of grams.values()) total += c;
  return { norm, grams, gramTotal: total };
}

/** 글자 bigram Dice 계수 (0~1). 조사, 띄어쓰기 차이에 강함. */
function gramSim(a: Prepared, b: Prepared): number {
  if (a.gramTotal === 0 || b.gramTotal === 0) {
    if (!a.norm || !b.norm) return 0;
    return a.norm === b.norm ? 1 : 0;
  }
  const [small, large] =
    a.grams.size <= b.grams.size ? [a.grams, b.grams] : [b.grams, a.grams];
  let inter = 0;
  for (const [g, c] of small) {
    const other = large.get(g);
    if (other) inter += Math.min(c, other);
  }
  return (2 * inter) / (a.gramTotal + b.gramTotal);
}

function overlapScore(a: string, b: string): number {
  const A = tokenize(a);
  const B = tokenize(b);
  let token = 0;
  if (A.size > 0 && B.size > 0) {
    let hit = 0;
    for (const t of A) if (B.has(t)) hit += 1;
    token = hit / Math.sqrt(A.size * B.size);
  }
  return Math.max(token, gramSim(prepare(a), prepare(b)));
}

/** 매칭을 신뢰할 최소 유사도. 아래면 앵커로 쓰지 않고 보간한다. */
const ANCHOR_MIN_SIM = 0.34;
/** 위치 탐색에 쓰는 줄 앞부분 글자 수. */
const PROBE_CHARS = 48;
/** 추정 위치 기준 탐색 폭 (글자). */
const SEARCH_MIN_CHARS = 400;
const SEARCH_MAX_CHARS = 4000;
const SEARCH_RATIO = 0.06;
/** 추정 위치에서 멀어질 때 감점 폭. */
const DISTANCE_PENALTY = 0.18;
/** 발화 시작점으로 당겨 붙이는 허용 오차 (초). */
const SNAP_SEC = 1.2;
/** 줄 사이 최소 간격 (초). 같은 시각이 두 개면 클릭이 앞줄로 튕긴다. */
const MIN_LINE_GAP = 0.05;

function cumulative(lengths: number[]): number[] {
  const out = new Array<number>(lengths.length + 1);
  out[0] = 0;
  for (let i = 0; i < lengths.length; i++) out[i + 1] = out[i]! + lengths[i]!;
  return out;
}

/** 실측 세그먼트를 글자 스트림으로 펼치고 글자마다 시각을 붙인다. */
function buildCharTimeline(timed: TimedSegment[]): {
  chars: string;
  timeAt: Float64Array;
} {
  let chars = "";
  const times: number[] = [];
  for (const seg of timed) {
    const norm = normChars(seg.text);
    if (!norm) continue;
    const start = Math.max(0, seg.startSec);
    const end = Math.max(start, seg.endSec);
    const span = end - start;
    for (let i = 0; i < norm.length; i++) {
      times.push(start + (span * i) / norm.length);
    }
    chars += norm;
  }
  return { chars, timeAt: Float64Array.from(times) };
}

function bigramSet(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(i, i + 2));
  return out;
}

/** 스트림 offset 위치가 줄 앞부분과 얼마나 겹치는지 (0~1). */
function probeScore(
  chars: string,
  offset: number,
  width: number,
  probe: Set<string>,
): number {
  const end = Math.min(chars.length - 1, offset + width);
  let hit = 0;
  for (let i = Math.max(0, offset); i < end; i++) {
    if (probe.has(chars.slice(i, i + 2))) hit += 1;
  }
  /**
   * 창이 스트림 끝에 걸려 잘리면 잘린 만큼 낮게 본다.
   *
   * 남은 글자 수로 나누면 끝자리에서 두어 글자만 맞아도 완전 일치가 된다.
   * 짧은 녹음에서는 그 점수가 제 자리의 진짜 일치를 눌러 모든 줄이 끝으로 쏠린다.
   */
  return width === 0 ? 0 : hit / width;
}

/**
 * 구조화 dialogue의 startSec를 STT 실측 세그먼트에 맞춤.
 *
 * 1) 실측 세그먼트를 글자 스트림(글자마다 시각)으로 펼침
 * 2) 각 줄의 앞부분을 직전 앵커 기준 추정 위치 근처에서 글자 단위로 탐색
 * 3) 유사도가 낮은 줄은 앞뒤 앵커 사이를 글자 수 비율로 보간
 *
 * timed가 비면 기본은 실패(글자 수 추정으로 싱크를 깨지 않음).
 */
export function alignDialogueToTimedSegments(
  dialogue: SemanticDialogueLine[],
  timed: TimedSegment[],
  durationSec: number,
  options?: { allowEstimateFallback?: boolean },
): SemanticDialogueLine[] {
  if (dialogue.length === 0) return [];
  const dur = Math.max(1, durationSec);

  if (timed.length === 0) {
    if (!options?.allowEstimateFallback) {
      throw new Error(
        "받아쓰기 실측 시각이 없어 대화 싱크를 맞출 수 없습니다.",
      );
    }
    const totalChars = dialogue.reduce((s, d) => s + d.text.length, 0) || 1;
    let acc = 0;
    let prev = 0;
    return dialogue.map((d) => {
      const startSec = Math.min(dur, (acc / totalChars) * dur);
      acc += d.text.length;
      const next = Math.max(prev, startSec);
      prev = next;
      return { ...d, startSec: next };
    });
  }

  const n = dialogue.length;
  const { chars, timeAt } = buildCharTimeline(timed);
  const tTotal = chars.length;
  const lastSeg = timed[timed.length - 1]!;
  const lastEnd = Math.min(dur, Math.max(lastSeg.endSec, lastSeg.startSec));

  const dNorm = dialogue.map((d) => normChars(d.text));
  const dCum = cumulative(dNorm.map((s) => Math.max(1, s.length)));
  const dTotal = dCum[n]! || 1;

  if (tTotal === 0) {
    return dialogue.map((d) => ({ ...d, startSec: 0 }));
  }

  const scale = tTotal / dTotal;
  const searchSpan = Math.min(
    SEARCH_MAX_CHARS,
    Math.max(SEARCH_MIN_CHARS, Math.ceil(tTotal * SEARCH_RATIO)),
  );

  /** 줄 앞부분이 스트림 어디서 시작하는지 추정 위치 근처에서 찾는다. */
  const findOffset = (
    i: number,
    estimate: number,
    span: number,
    boundLo: number,
    boundHi: number,
  ): { offset: number; score: number } | null => {
    const line = dNorm[i]!;
    if (line.length < 4) return null;
    const probeWidth = Math.min(PROBE_CHARS, line.length);
    const probe = bigramSet(line.slice(0, probeWidth));
    const lo = Math.max(boundLo, Math.round(estimate - span));
    const hi = Math.min(boundHi, Math.round(estimate + span));
    if (hi < lo) return null;

    // 추정 위치에서 멀수록 감점. 먼 곳의 우연한 일치를 막는다.
    const penalty = (o: number) =>
      (DISTANCE_PENALTY * Math.abs(o - estimate)) / Math.max(1, span);

    const coarse = Math.max(1, Math.floor(probeWidth / 6));
    let bestOffset = lo;
    let bestScore = 0;
    let bestAdj = -Infinity;
    const consider = (o: number) => {
      const raw = probeScore(chars, o, probeWidth, probe);
      const adj = raw - penalty(o);
      if (adj > bestAdj) {
        bestAdj = adj;
        bestScore = raw;
        bestOffset = o;
      }
    };
    for (let o = lo; o <= hi; o += coarse) consider(o);
    for (
      let o = Math.max(lo, bestOffset - coarse);
      o <= Math.min(hi, bestOffset + coarse);
      o += 1
    ) {
      consider(o);
    }
    if (bestScore < ANCHOR_MIN_SIM) return null;
    return { offset: bestOffset, score: bestScore };
  };

  // 1차: 전체 비율 추정 위치에서 후보 수집 (줄끼리 서로 영향 주지 않게)
  const cand = new Array<{ offset: number; score: number } | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    cand[i] = findOffset(i, dCum[i]! * scale, searchSpan, 0, tTotal - 2);
  }

  // 2차: 시간 순서를 지키는 후보만 채택 (점수 합 최대인 비감소 부분열)
  const pool: number[] = [];
  for (let i = 0; i < n; i++) if (cand[i]) pool.push(i);
  const accepted = new Array<boolean>(n).fill(false);
  if (pool.length > 0) {
    const best = new Float64Array(pool.length);
    const back = new Int32Array(pool.length).fill(-1);
    let tailIdx = 0;
    for (let k = 0; k < pool.length; k++) {
      const c = cand[pool[k]!]!;
      best[k] = c.score;
      for (let j = 0; j < k; j++) {
        if (cand[pool[j]!]!.offset > c.offset) continue;
        const v = best[j]! + c.score;
        if (v > best[k]!) {
          best[k] = v;
          back[k] = j;
        }
      }
      if (best[k]! > best[tailIdx]!) tailIdx = k;
    }
    for (let k = tailIdx; k >= 0; k = back[k]!) {
      accepted[pool[k]!] = true;
      if (back[k]! < 0) break;
    }
  }

  const anchorOffset = new Array<number | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (accepted[i]) anchorOffset[i] = cand[i]!.offset;
  }

  // 3차: 채택 앵커 사이 빈 줄을 좁은 범위로 다시 탐색
  for (let i = 0; i < n; i++) {
    if (anchorOffset[i] != null) continue;
    let prev = i - 1;
    while (prev >= 0 && anchorOffset[prev] == null) prev -= 1;
    let next = i + 1;
    while (next < n && anchorOffset[next] == null) next += 1;
    const loBound = prev >= 0 ? anchorOffset[prev]! : 0;
    const hiBound = next < n ? anchorOffset[next]! : tTotal - 2;
    if (hiBound <= loBound) continue;
    const fromChar = prev >= 0 ? dCum[prev]! : 0;
    const toChar = next < n ? dCum[next]! : dTotal;
    const ratio =
      toChar > fromChar ? (dCum[i]! - fromChar) / (toChar - fromChar) : 0;
    const estimate = loBound + (hiBound - loBound) * ratio;
    const span = Math.max(120, Math.min(searchSpan, (hiBound - loBound) / 2));
    const found = findOffset(i, estimate, span, loBound, hiBound);
    if (found) anchorOffset[i] = found.offset;
  }

  const anchorSec = new Array<number | null>(n).fill(null);
  for (let i = 0; i < n; i++) {
    const off = anchorOffset[i];
    if (off == null) continue;
    anchorSec[i] = Math.max(0, Math.min(dur, timeAt[off] ?? 0));
  }

  // 앵커 사이는 글자 수 비율로 보간
  const out = new Array<number>(n).fill(0);
  let idx = 0;
  let prevAnchorIdx = -1;
  let prevAnchorSec = 0;
  while (idx < n) {
    if (anchorSec[idx] != null) {
      out[idx] = anchorSec[idx]!;
      prevAnchorIdx = idx;
      prevAnchorSec = out[idx]!;
      idx += 1;
      continue;
    }
    let next = idx;
    while (next < n && anchorSec[next] == null) next += 1;
    const nextSec = next < n ? anchorSec[next]! : lastEnd;
    const fromChar = prevAnchorIdx >= 0 ? dCum[prevAnchorIdx]! : 0;
    const toChar = next < n ? dCum[next]! : dTotal;
    const charSpan = Math.max(1, toChar - fromChar);
    const secSpan = Math.max(0, nextSec - prevAnchorSec);
    for (let x = idx; x < next; x++) {
      const ratio = (dCum[x]! - fromChar) / charSpan;
      out[x] = prevAnchorSec + secSpan * ratio;
    }
    idx = next;
  }

  /**
   * 발화 시작점으로 당겨 붙인다.
   *
   * 시간을 글자 수로 보간하는데 문장 사이 침묵에는 글자가 없다. 줄이 시작되는
   * 자리가 바로 그 침묵 뒤라서 추정값이 늘 침묵 앞, 곧 앞 문장 꼬리에 떨어진다.
   * 눌러서 들으면 "...하겠습니다" 끝소리부터 나온다.
   * whisper가 끊어 준 구간 머리는 실제 말이 시작되는 지점이므로 거기로 맞춘다.
   */
  const segStarts = timed
    .map((s) => Math.max(0, s.startSec))
    .sort((a, b) => a - b);

  const snapToSpeechStart = (sec: number, floor: number): number => {
    let best = sec;
    let bestGap = SNAP_SEC;
    for (const s of segStarts) {
      if (s > sec + SNAP_SEC) break;
      const gap = Math.abs(s - sec);
      if (gap <= bestGap && s > floor) {
        best = s;
        bestGap = gap;
      }
    }
    return best;
  };

  let prevSec = -MIN_LINE_GAP;
  return dialogue.map((d, i) => {
    const floor = prevSec + MIN_LINE_GAP;
    const raw = Math.max(floor, Math.max(0, Math.min(dur, out[i]!)));
    const snapped = Math.min(dur, snapToSpeechStart(raw, prevSec));
    // 두 줄이 같은 시각이 되면 눌렀을 때 어느 줄로 갈지 정해지지 않는다.
    // 앞줄로 튕겨 엉뚱한 데서 재생되므로 반드시 앞으로 가게 한다.
    const startSec = Math.max(floor, snapped);
    prevSec = startSec;
    return { ...d, startSec };
  });
}

/** 배정 전에 start==end, 역전, 겹침을 정리한다. */
function sanitizeAssignedSourceWords(words: WordTiming[]): WordTiming[] {
  const sorted = [...words]
    .filter((w) => w.text.trim().length > 0 && Number.isFinite(w.startSec))
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  const MIN_DUR = 0.08;
  const out: WordTiming[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i]!;
    const nextStart = sorted[i + 1]?.startSec;
    let endSec = Number.isFinite(cur.endSec) ? cur.endSec : cur.startSec;
    if (!(endSec > cur.startSec)) {
      endSec =
        typeof nextStart === "number" && nextStart > cur.startSec
          ? Math.min(nextStart, cur.startSec + MIN_DUR)
          : cur.startSec + MIN_DUR;
    } else if (typeof nextStart === "number" && endSec > nextStart) {
      endSec = Math.max(cur.startSec + 0.02, nextStart);
    }
    // 같은 startSec이 여러 개면 살짝 밀어 포커스가 한 단어에만 머물게 한다.
    const startSec =
      out.length > 0 && cur.startSec <= out[out.length - 1]!.startSec
        ? out[out.length - 1]!.startSec + 0.02
        : cur.startSec;
    if (!(endSec > startSec)) endSec = startSec + MIN_DUR;
    out.push({ text: cur.text.trim(), startSec, endSec });
  }
  return out;
}

/**
 * 화면 대화와 Whisper 단어열을 회의 전체에서 한 번만 순차 매칭한다.
 *
 * 줄마다 추정 시간창을 먼저 만들면 한 줄이 10초 일찍 잡힌 순간 그 다음
 * 줄까지 연쇄적으로 밀린다. 여기서는 시간창을 전혀 쓰지 않고 텍스트 순서로
 * 단어열을 먼저 연결한 뒤, 실제 단어 시각으로 줄 시작을 확정한다.
 */
type LexicalToken = {
  norm: string;
  startOffset: number;
  endOffset: number;
};

type TimedLexicalToken = LexicalToken & {
  sourceIndex: number;
  startSec: number;
  endSec: number;
};

type TargetLexicalToken = LexicalToken & {
  lineIndex: number;
};

function lexicalTokens(text: string): LexicalToken[] {
  return [...text.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({
    norm: normChars(match[0]),
    startOffset: match.index ?? 0,
    endOffset: (match.index ?? 0) + match[0].length,
  }));
}

function wordMatchScore(target: string, source: string): number {
  if (!target || !source) return 0;
  if (target === source) return 1;
  // 한두 글자는 우연히 겹치기 쉬우므로 완전 일치만 허용한다.
  if (target.length <= 2 || source.length <= 2) return 0;
  if (target.includes(source) || source.includes(target)) return 0.88;
  return gramSim(prepare(target), prepare(source));
}

/**
 * 두 모델의 전체 단어열을 banded sequence alignment로 맞춘다.
 *
 * 앞에서 가장 가까운 같은 단어를 고르는 방식은 한 단어를 놓친 뒤 뒤쪽의
 * 반복어로 수십 초 점프할 수 있다. 전역 문맥에서 삽입·삭제 비용을 함께
 * 계산하면 "네", "정부" 같은 반복어도 앞뒤 문장에 맞는 위치에 남는다.
 */
function alignTokenSequences(
  target: TargetLexicalToken[],
  source: TimedLexicalToken[],
): Array<[number, number]> {
  const n = target.length;
  const m = source.length;
  if (n === 0 || m === 0) return [];

  const band = Math.max(128, Math.abs(n - m) + 96);
  const rowStarts = new Int32Array(n + 1);
  const pointers: Uint8Array[] = new Array(n + 1);
  let previous = new Float64Array(0);
  let previousStart = 0;
  const negative = -1e15;
  const get = (scores: Float64Array, start: number, column: number) =>
    column < start || column >= start + scores.length
      ? negative
      : scores[column - start]!;

  for (let row = 0; row <= n; row += 1) {
    const center = Math.round((row * m) / n);
    const start = row === 0 ? 0 : Math.max(0, center - band);
    const end = row === n ? m : Math.min(m, center + band);
    const scores = new Float64Array(end - start + 1);
    scores.fill(negative);
    const dirs = new Uint8Array(scores.length);
    rowStarts[row] = start;
    pointers[row] = dirs;

    for (let column = start; column <= end; column += 1) {
      const offset = column - start;
      if (row === 0) {
        scores[offset] = -0.55 * column;
        dirs[offset] = column > 0 ? 3 : 0;
        continue;
      }
      if (column === 0) {
        scores[offset] = -0.9 * row;
        dirs[offset] = 2;
        continue;
      }

      const similarity = wordMatchScore(
        target[row - 1]!.norm,
        source[column - 1]!.norm,
      );
      const diagonal =
        get(previous, previousStart, column - 1) +
        (similarity >= 0.5 ? 2 + similarity * 2 : -1.6);
      const skipTarget = get(previous, previousStart, column) - 0.9;
      const skipSource = get(scores, start, column - 1) - 0.55;
      if (diagonal >= skipTarget && diagonal >= skipSource) {
        scores[offset] = diagonal;
        dirs[offset] = 1;
      } else if (skipTarget >= skipSource) {
        scores[offset] = skipTarget;
        dirs[offset] = 2;
      } else {
        scores[offset] = skipSource;
        dirs[offset] = 3;
      }
    }
    previous = scores;
    previousStart = start;
  }

  const matches: Array<[number, number]> = [];
  let row = n;
  let column = m;
  while (row > 0 || column > 0) {
    const start = rowStarts[row]!;
    const dirs = pointers[row]!;
    const direction =
      column >= start && column < start + dirs.length
        ? dirs[column - start]
        : row > 0
          ? 2
          : 3;
    if (direction === 1 && row > 0 && column > 0) {
      if (
        wordMatchScore(
          target[row - 1]!.norm,
          source[column - 1]!.norm,
        ) >= 0.5
      ) {
        matches.push([row - 1, column - 1]);
      }
      row -= 1;
      column -= 1;
    } else if (direction === 2 && row > 0) {
      row -= 1;
    } else if (column > 0) {
      column -= 1;
    } else {
      row -= 1;
    }
  }
  return matches.reverse();
}

/** 한국어 발화 속도 근사. 미매칭 토큰 구간 길이를 어림할 때만 쓴다. */
const FILL_SEC_PER_CHAR = 0.16;
const FILL_MIN_WORD_SEC = 0.08;

/**
 * 매칭에 실패한 토큰에 시각을 채운다.
 *
 * "네,", "예," 같은 한두 글자 앞머리는 wordMatchScore가 완전 일치만 허용해
 * 자주 탈락한다. 그러면 그 줄의 첫 단어가 두 번째 어절이 되고, 줄 시작
 * 시각이 실제 발화보다 늦게 잡힌다. KTV 실측에서 빠른 분석 14%의 줄이
 * 이래서 중앙 +1초 지연이 났다.
 *
 * 빈 구간은 다음 실측 앵커에 붙여 뒤에서부터 채운다. 침묵이 길어도 말은
 * 다음 발화 직전에 이어지기 때문이다. 뒤에 앵커가 없을 때만 앞으로 늘린다.
 */
function fillUnmatchedTokenTimings(
  texts: string[],
  assigned: TranscriptWordTiming[][],
): void {
  let prevLineEnd = 0;

  texts.forEach((text, lineIndex) => {
    const timings = assigned[lineIndex]!;
    // 한 단어도 못 붙은 줄은 건드리지 않는다. 그런 줄은 앞뒤 앵커 사이에서
    // 글자량 비율로 보간하는 기존 경로가 더 안전하다.
    if (timings.length === 0) return;

    const byOffset = new Map(timings.map((t) => [t.startOffset, t]));
    const tokens = lexicalTokens(text);
    const lineEnd = Math.max(...timings.map((t) => t.endSec));

    let cursor = 0;
    while (cursor < tokens.length) {
      if (byOffset.has(tokens[cursor]!.startOffset)) {
        cursor += 1;
        continue;
      }
      let runEnd = cursor;
      while (
        runEnd < tokens.length &&
        !byOffset.has(tokens[runEnd]!.startOffset)
      ) {
        runEnd += 1;
      }

      const run = tokens.slice(cursor, runEnd);
      const chars = run.reduce(
        (sum, token) => sum + Math.max(1, token.endOffset - token.startOffset),
        0,
      );
      const wanted = Math.max(
        FILL_MIN_WORD_SEC * run.length,
        chars * FILL_SEC_PER_CHAR,
      );

      const before =
        cursor > 0
          ? byOffset.get(tokens[cursor - 1]!.startOffset)!.endSec
          : prevLineEnd;
      const after =
        runEnd < tokens.length
          ? byOffset.get(tokens[runEnd]!.startOffset)!.startSec
          : null;

      let from: number;
      let to: number;
      if (after != null) {
        // 뒤 앵커에 붙인다. 앞이 침묵이어도 말은 다음 어절 직전에 이어진다.
        const span = Math.min(Math.max(0, after - before), wanted);
        from = after - span;
        to = after;
      } else {
        from = before;
        to = before + wanted;
      }

      let at = from;
      for (const token of run) {
        const width = Math.max(1, token.endOffset - token.startOffset);
        const share = chars > 0 ? (to - from) * (width / chars) : 0;
        const startSec = at;
        const endSec = Math.max(startSec + FILL_MIN_WORD_SEC, startSec + share);
        at = endSec;
        timings.push({
          text: text.slice(token.startOffset, token.endOffset),
          startSec,
          endSec,
          startOffset: token.startOffset,
          endOffset: token.endOffset,
        });
      }
      cursor = runEnd;
    }

    prevLineEnd = Math.max(prevLineEnd, lineEnd);
  });
}

function matchWordTimingsToTexts(
  texts: string[],
  words: WordTiming[],
): TranscriptWordTiming[][] {
  const cleanWords = sanitizeAssignedSourceWords(words);
  const source: TimedLexicalToken[] = [];
  cleanWords.forEach((word, sourceIndex) => {
    for (const token of lexicalTokens(word.text)) {
      source.push({
        ...token,
        sourceIndex,
        startSec: word.startSec,
        endSec: word.endSec,
      });
    }
  });

  const assigned = texts.map(() => [] as TranscriptWordTiming[]);
  const target = texts.flatMap((text, lineIndex) =>
    lexicalTokens(text).map((token) => ({ ...token, lineIndex })),
  );
  const usedByLine = texts.map(() => new Set<number>());
  for (const [targetIndex, sourceIndex] of alignTokenSequences(target, source)) {
    const token = target[targetIndex]!;
    const hit = source[sourceIndex]!;
    if (usedByLine[token.lineIndex]!.has(hit.sourceIndex)) continue;
    usedByLine[token.lineIndex]!.add(hit.sourceIndex);
    assigned[token.lineIndex]!.push({
      text: texts[token.lineIndex]!.slice(
        token.startOffset,
        token.endOffset,
      ),
      startSec: hit.startSec,
      endSec: hit.endSec,
      startOffset: token.startOffset,
      endOffset: token.endOffset,
    });
  }
  fillUnmatchedTokenTimings(texts, assigned);
  assigned.forEach((line) => {
    line.sort((left, right) => left.startOffset - right.startOffset);
    // 텍스트 순서로 붙인 미매칭 토큰이 다음 실측 앵커 바로 앞에 보간될 때,
    // 20~80ms 정도 앞 토큰보다 이른 시각을 받을 수 있다. UI는 배열 순서대로
    // 현재 단어를 찾으므로 이 작은 역전도 엉뚱한 단어 점등을 만든다.
    for (let index = 0; index < line.length; index += 1) {
      const word = line[index]!;
      const previous = line[index - 1];
      const floor = previous ? previous.startSec + 0.02 : 0;
      word.startSec = Math.max(floor, word.startSec);
      word.endSec = Math.max(word.startSec + 0.02, word.endSec);
      if (previous && previous.endSec > word.startSec) {
        previous.endSec = Math.max(previous.startSec + 0.02, word.startSec);
      }
    }
  });
  return assigned;
}

/** 고품질 본문 한 덩어리를 Whisper 실측 단어열에 전역 순서로 맞춘다. */
export function alignTextToWordTimings(
  text: string,
  words: WordTiming[],
): TranscriptWordTiming[] {
  return matchWordTimingsToTexts([text], words)[0] ?? [];
}

function lineWeights(texts: string[]): number[] {
  return texts.map((text) => Math.max(1, normChars(text).length));
}

/**
 * 모델이 나눈 대화 줄의 시작 시각을 Whisper 단어 시각으로 확정한다.
 * 매칭되지 않은 줄만 앞뒤 실측 앵커 사이에서 글자량 비율로 보간한다.
 */
export function alignDialogueToWordTimings(
  dialogue: SemanticDialogueLine[],
  words: WordTiming[],
  durationSec: number,
): SemanticDialogueLine[] {
  if (dialogue.length === 0 || words.length === 0) return dialogue;
  const dur = Math.max(1, durationSec);
  const texts = dialogue.map((line) => line.text);
  const matched = matchWordTimingsToTexts(texts, words);
  const weights = lineWeights(texts);
  const starts = matched.map((lineWords) => lineWords[0]?.startSec ?? null);
  const ends = matched.map(
    (lineWords) => lineWords[lineWords.length - 1]?.endSec ?? null,
  );
  const out = new Array<number>(dialogue.length).fill(0);

  let index = 0;
  let previousSec = 0;
  let previousEnd = 0;
  while (index < dialogue.length) {
    if (starts[index] != null) {
      // 첫 말풍선은 오디오 시작부터 열어 두되 이후 줄은 실제 첫 단어에 맞춘다.
      out[index] =
        index === 0 && starts[index]! <= 1.5
          ? 0
          : Math.max(previousSec + MIN_LINE_GAP, starts[index]!);
      previousSec = out[index]!;
      previousEnd = Math.max(previousEnd, ends[index] ?? previousSec);
      index += 1;
      continue;
    }

    let next = index;
    while (next < dialogue.length && starts[next] == null) next += 1;
    const toSec = next < dialogue.length ? starts[next]! : dur;
    const fromSec = Math.min(toSec, Math.max(previousEnd, previousSec));
    const runWeight = weights
      .slice(index, next)
      .reduce((sum, weight) => sum + weight, 0);
    let usedWeight = 0;
    for (let row = index; row < next; row += 1) {
      const ratio = runWeight > 0 ? usedWeight / runWeight : 0;
      out[row] = Math.max(
        previousSec + MIN_LINE_GAP,
        fromSec + Math.max(0, toSec - fromSec) * ratio,
      );
      previousSec = out[row]!;
      usedWeight += weights[row]!;
    }
    index = next;
  }

  let monotonic = -MIN_LINE_GAP;
  return dialogue.map((line, lineIndex) => {
    const startSec = Math.min(
      dur,
      Math.max(monotonic + MIN_LINE_GAP, out[lineIndex]!),
    );
    monotonic = startSec;
    return { ...line, startSec };
  });
}

export function assignWordTimingsToLines(
  lines: TranscriptLine[],
  words: WordTiming[],
  durationSec: number,
): TranscriptLine[] {
  if (words.length === 0 || lines.length === 0) return lines;
  const texts = lines.map((line) => line.text ?? "");
  const matched = matchWordTimingsToTexts(texts, words);
  const aligned = alignDialogueToWordTimings(
    lines.map((line) => ({
      startSec: lineStartSec(line),
      speaker: line.speaker,
      text: line.text ?? "",
    })),
    words,
    durationSec,
  );

  /**
   * 전체 정렬에서 통째로 탈락한 줄만, 이미 정해진 이웃 줄 사이의 좁은 시간창에서
   * 한 번 더 복구한다. 구조화 단계가 "코리아헤드"를 "코리아헤럴드"로 다듬는
   * 것처럼 일부 단어를 바꾸면 전역 최적화가 그 줄 전체를 건너뛸 수 있었다.
   * 그 상태에서는 말풍선 시작을 앞뒤 글자량으로 보간해 직전 화자의 끝말부터
   * 재생하고, 단어 클릭/하이라이트도 전부 사라진다.
   *
   * 두 개 이상의 어휘 앵커가 같은 좁은 창에서 순서대로 맞을 때만 채택한다.
   * 따라서 흔한 "네" 하나만 우연히 맞아 엉뚱한 시각으로 점프하지 않는다.
   */
  const recoveredStarts = new Array<number | null>(lines.length).fill(null);
  for (let index = 0; index < lines.length; index += 1) {
    if (matched[index]!.length > 0) continue;
    const text = texts[index]!;
    const targetTokens = lexicalTokens(text);
    if (targetTokens.length < 2) continue;

    const estimatedStart = aligned[index]?.startSec ?? lineStartSec(lines[index]!);
    const nextStart =
      aligned[index + 1]?.startSec ?? Math.min(durationSec, estimatedStart + 30);
    const windowStart = Math.max(0, estimatedStart - 1.5);
    const windowEnd = Math.min(
      durationSec,
      Math.max(windowStart + 0.1, nextStart + 0.35),
    );
    const candidates = words.filter(
      (word) => word.endSec > windowStart && word.startSec < windowEnd,
    );
    if (candidates.length < 2) continue;

    const sourceTokens: TimedLexicalToken[] = [];
    sanitizeAssignedSourceWords(candidates).forEach((word, sourceIndex) => {
      for (const token of lexicalTokens(word.text)) {
        sourceTokens.push({
          ...token,
          sourceIndex,
          startSec: word.startSec,
          endSec: word.endSec,
        });
      }
    });
    const localTarget = targetTokens.map((token) => ({ ...token, lineIndex: 0 }));
    const anchors = alignTokenSequences(localTarget, sourceTokens);
    const anchoredChars = anchors.reduce(
      (sum, [targetIndex]) =>
        sum +
        Math.max(
          1,
          localTarget[targetIndex]!.endOffset -
            localTarget[targetIndex]!.startOffset,
        ),
      0,
    );
    if (anchors.length < 2 || anchoredChars < 4) continue;

    const local = matchWordTimingsToTexts([text], candidates)[0] ?? [];
    if (local.length === 0) continue;
    matched[index] = local;
    recoveredStarts[index] = local[0]!.startSec;
  }

  let previousStart = -MIN_LINE_GAP;
  return lines.map((line, index) => {
    const lineWords = matched[index]!;
    const proposedStart =
      recoveredStarts[index] ?? aligned[index]?.startSec ?? lineStartSec(line);
    const startSec = Math.max(previousStart + MIN_LINE_GAP, proposedStart);
    previousStart = startSec;
    return {
      ...line,
      startSec: Math.round(startSec * 100) / 100,
      time: formatClock(startSec),
      ...(lineWords.length > 0 ? { words: lineWords } : { words: undefined }),
    };
  });
}

export type TimelineMapItem = {
  title: string;
  summary?: string;
  speakers?: string[];
  kind?: string;
  points?: string[];
  speakerNotes?: Array<{ name: string; said: string }>;
};

/** 구간에 실제로 말한 사람만 남긴 화자별 발언. */
function notesFor(
  item: TimelineMapItem,
  speakers: string[],
): Array<{ name: string; said: string }> | undefined {
  const notes = (item.speakerNotes ?? []).filter((n) =>
    speakers.includes(n.name),
  );
  return notes.length > 0 ? notes : undefined;
}

function round2(sec: number): number {
  return Math.round(sec * 100) / 100;
}

function parseTimelineKind(raw: string | undefined): TimelineSegmentKind {
  const k = (raw || "").trim().toLowerCase();
  if (k === "agenda") return "agenda";
  if (k === "discussion") return "discussion";
  if (k === "decision") return "decision";
  if (k === "action") return "action";
  if (k === "risk") return "risk";
  if (k === "report") return "report";
  if (k === "vote") return "vote";
  return "discussion";
}

/**
 * dialogue 실측 startSec로 타임라인 구간 경계 매핑 (연속 최적 할당).
 */
export function mapTimelineByDialogue(params: {
  items: TimelineMapItem[];
  dialogue: SemanticDialogueLine[];
  durationSec: number;
}): TimelineSegment[] {
  const { items, dialogue, durationSec } = params;
  const n = items.length;
  const m = dialogue.length;
  const dur = Math.max(1, durationSec);

  if (n === 0) return [];

  if (m === 0) {
    const span = dur / n;
    return items.map((item, i) => ({
      id: `s${i + 1}`,
      start: formatClock(i * span),
      end: formatClock(i === n - 1 ? dur : (i + 1) * span),
      startSec: round2(i * span),
      endSec: round2(i === n - 1 ? dur : (i + 1) * span),
      title: item.title || `구간 ${i + 1}`,
      summary: item.summary || item.title || "",
      kind: parseTimelineKind(item.kind),
      speakers:
        item.speakers && item.speakers.length > 0
          ? item.speakers
          : (["발화"] as string[]),
    }));
  }

  const score = Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) => {
      const q = `${items[i]!.title} ${items[i]!.summary || ""}`;
      return overlapScore(q, dialogue[j]!.text);
    }),
  );

  const NEG = -1e18;
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(NEG),
  );
  const cut: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0),
  );
  dp[0]![0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = i; j <= m; j++) {
      for (let k = i - 1; k < j; k++) {
        if (dp[i - 1]![k]! <= NEG / 2) continue;
        let seg = 0;
        for (let t = k; t < j; t++) seg += score[i - 1]![t]!;
        seg = seg / Math.max(1, j - k) + seg * 0.15;
        const val = dp[i - 1]![k]! + seg;
        if (val > dp[i]![j]!) {
          dp[i]![j] = val;
          cut[i]![j] = k;
        }
      }
    }
  }

  const starts: number[] = Array(n).fill(0);
  let j = m;
  for (let i = n; i >= 1; i--) {
    const k = cut[i]![j]!;
    starts[i - 1] = k;
    j = k;
  }

  return items.map((item, i) => {
    const a = starts[i]!;
    const b = i + 1 < n ? starts[i + 1]! : m;
    // 첫 구간은 항상 녹음 시작(0초)부터.
    const startSec =
      i === 0 ? 0 : Math.max(0, Math.min(dur, dialogue[a]?.startSec ?? 0));
    const endSec =
      i === n - 1
        ? dur
        : Math.max(
            startSec,
            Math.min(dur, dialogue[b]?.startSec ?? dur),
          );

    const fromDialogue = [
      ...new Set(
        dialogue
          .slice(a, b)
          .map((d) => d.speaker)
          .filter(Boolean) as string[],
      ),
    ];
    const speakers = [
      ...new Set([...(item.speakers ?? []), ...fromDialogue]),
    ].filter(Boolean);

    return {
      id: `s${i + 1}`,
      start: formatClock(startSec),
      end: formatClock(endSec),
      startSec: round2(startSec),
      endSec: round2(endSec),
      title: item.title || `구간 ${i + 1}`,
      summary: item.summary || item.title || "",
      kind: parseTimelineKind(item.kind),
      speakers: speakers.length > 0 ? speakers : (["발화"] as string[]),
      ...(item.points?.length ? { points: item.points } : {}),
      ...(notesFor(item, speakers)
        ? { speakerNotes: notesFor(item, speakers) }
        : {}),
    } satisfies TimelineSegment;
  });
}

/**
 * STT 실측 세그먼트로 타임라인 구간 경계 매핑.
 * 구간 제목의 고유 토큰으로 순차 앵커를 잡은 뒤 경계를 확정한다.
 */
export function mapTimelineByTimedSegments(params: {
  items: TimelineMapItem[];
  timed: TimedSegment[];
  durationSec: number;
}): TimelineSegment[] {
  const { items, timed, durationSec } = params;
  const n = items.length;
  const m = timed.length;
  const dur = Math.max(1, durationSec);

  if (n === 0) return [];

  if (m === 0) {
    return mapTimelineByDialogue({
      items,
      dialogue: [],
      durationSec: dur,
    });
  }

  const titleToks = items.map((it) => tokenize(it.title));
  const exclusive = titleToks.map((toks, i) => {
    const others = new Set<string>();
    titleToks.forEach((t, j) => {
      if (j === i) return;
      for (const x of t) others.add(x);
    });
    const uniq = [...toks].filter((t) => !others.has(t));
    return uniq.length > 0 ? new Set(uniq) : toks;
  });

  const anchors: number[] = [];
  let cursor = 0;
  for (let i = 0; i < n; i++) {
    const remain = n - i;
    const latestStart = Math.max(cursor, m - remain);
    let bestJ = cursor;
    let bestScore = -1;
    let firstGood = -1;

    for (let j = cursor; j <= latestStart; j++) {
      const text = timed[j]!.text;
      let hit = 0;
      for (const t of exclusive[i]!) if (textHasToken(text, t)) hit += 1;
      const exclusivity =
        exclusive[i]!.size > 0 ? hit / exclusive[i]!.size : 0;
      const soft = overlapScore(items[i]!.title, text);
      const score = exclusivity * 3 + soft * 0.5 - j * 0.001;
      if (score > bestScore) {
        bestScore = score;
        bestJ = j;
      }
      // 제목 고유어가 하나라도 나오면 첫 구간으로 확정
      if (firstGood < 0 && hit >= 1) {
        firstGood = j;
      }
    }

    const chosen = firstGood >= 0 ? firstGood : bestJ;
    anchors.push(chosen);
    cursor = Math.min(m - 1, chosen + 1);
  }

  // 비감소 강제
  for (let i = 1; i < anchors.length; i++) {
    if (anchors[i]! <= anchors[i - 1]!) {
      anchors[i] = Math.min(m - 1, anchors[i - 1]! + 1);
    }
  }

  // 첫 구간은 항상 녹음 시작(0초)부터.
  return items.map((item, i) => {
    const a = anchors[i]!;
    const b = i + 1 < n ? anchors[i + 1]! : m;
    const startSec =
      i === 0 ? 0 : Math.max(0, Math.min(dur, timed[a]?.startSec ?? 0));
    const endSec =
      i === n - 1
        ? dur
        : Math.max(startSec, Math.min(dur, timed[b]?.startSec ?? dur));

    return {
      id: `s${i + 1}`,
      start: formatClock(startSec),
      end: formatClock(endSec),
      startSec: round2(startSec),
      endSec: round2(endSec),
      title: item.title || `구간 ${i + 1}`,
      summary: item.summary || item.title || "",
      kind: parseTimelineKind(item.kind),
      speakers:
        item.speakers && item.speakers.length > 0
          ? item.speakers
          : (["발화"] as string[]),
      ...(item.points?.length ? { points: item.points } : {}),
      ...(notesFor(item, item.speakers ?? [])
        ? { speakerNotes: notesFor(item, item.speakers ?? []) }
        : {}),
    } satisfies TimelineSegment;
  });
}
