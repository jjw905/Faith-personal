/**
 * 보정이 바꾼 자리마다 정답지 문맥과 견줘 좋아졌는지 판정한다.
 *
 * CER만 보면 좋은 변경과 나쁜 변경이 상쇄되어 숫자가 안 움직여도
 * 실제로는 망가지고 있을 수 있다. 용어집을 정답지에서 뽑으면 "바꾼 말이
 * 정답지에 있나"는 항상 참이라 쓸 수 없으므로, 자리 주변 창으로 견준다.
 */
import { editDistance, normalize } from "./cer";

export type Verdict = "improved" | "worsened" | "tied" | "unmatched";

export type ChangeVerdictInput = {
  /** 보정 전 전사 전체 */
  hypothesis: string;
  /** 바뀐 구간 시작 (hypothesis 기준) */
  start: number;
  /** 바뀐 구간 끝 (exclusive) */
  end: number;
  /** 바꾼 뒤 문구 */
  replacement: string;
  /** 정답지 전문 */
  reference: string;
  /** 좌우 문맥 글자 수. 기본 40 */
  contextChars?: number;
};

export type ChangeVerdictResult = {
  verdict: Verdict;
  beforeWindow: string;
  afterWindow: string;
  refSpan: string;
  beforeDist: number;
  afterDist: number;
  alignRatio: number;
};

const DEFAULT_CONTEXT = 40;
/** 정렬이 이보다 어긋나면 판정을 쓰지 않는다. */
const MAX_ALIGN_RATIO = 0.4;
const NGRAM = 6;

/** 창에서 앵커로 쓸 6-gram을 모은다. 왼쪽이 짧으면 오른쪽(불변)을 쓴다. */
function anchorGrams(beforeWindow: string, leftNorm: string, rightNorm: string): string[] {
  const gramLen = Math.min(NGRAM, beforeWindow.length);
  if (gramLen < 1) return [];
  const out: string[] = [];
  const add = (g: string) => {
    if (g.length === gramLen && !out.includes(g)) out.push(g);
  };

  // 계획: 앞부분 6-gram. 왼쪽이 충분하면 그게 불변 문맥이다.
  add(beforeWindow.slice(0, gramLen));
  if (leftNorm.length >= gramLen) {
    add(leftNorm.slice(0, gramLen));
    add(leftNorm.slice(leftNorm.length - gramLen));
  }
  // 왼쪽이 짧아 오류가 6-gram에 섞일 때 오른쪽 불변 문맥으로 좁힌다.
  if (rightNorm.length >= gramLen) {
    add(rightNorm.slice(0, gramLen));
  }
  if (out.length === 0) {
    for (let i = 0; i <= Math.min(12, beforeWindow.length - gramLen); i++) {
      add(beforeWindow.slice(i, i + gramLen));
    }
  }
  return out;
}

/**
 * before창과 가장 가까운 정답 구간을 고른다.
 * 6-gram으로 후보를 좁힌 뒤 주변만 견돈다.
 */
function findAlignedSpan(
  refNorm: string,
  beforeWindow: string,
  leftNorm: string,
  rightNorm: string,
): { start: number; end: number; dist: number } | null {
  if (!beforeWindow || !refNorm) return null;

  const grams = anchorGrams(beforeWindow, leftNorm, rightNorm);
  if (grams.length === 0) return null;

  const gramLen = grams[0]!.length;
  const candidates: number[] = [];
  for (const gram of grams) {
    for (let i = 0; i <= refNorm.length - gramLen; i++) {
      if (refNorm.slice(i, i + gramLen) === gram) candidates.push(i);
    }
  }
  if (candidates.length === 0) return null;

  let best: { start: number; end: number; dist: number } | null = null;
  for (const c of candidates) {
    // 오른쪽 앵커면 창 시작이 c보다 앞에 있다.
    const searchLo = Math.max(0, c - beforeWindow.length - 8);
    const searchHi = Math.min(refNorm.length, c + beforeWindow.length + 8);
    for (let start = searchLo; start < searchHi; start++) {
      for (const scale of [0.85, 1, 1.15]) {
        const len = Math.max(1, Math.round(beforeWindow.length * scale));
        const end = Math.min(refNorm.length, start + len);
        if (end <= start) continue;
        const dist = editDistance(beforeWindow, refNorm.slice(start, end));
        if (!best || dist < best.dist) best = { start, end, dist };
      }
    }
  }
  return best;
}

export function judgeChange(input: ChangeVerdictInput): ChangeVerdictResult {
  const ctx = input.contextChars ?? DEFAULT_CONTEXT;
  const original = input.hypothesis.slice(input.start, input.end);
  const left = input.hypothesis.slice(Math.max(0, input.start - ctx), input.start);
  const right = input.hypothesis.slice(
    input.end,
    Math.min(input.hypothesis.length, input.end + ctx),
  );

  const beforeWindow = normalize(left + original + right);
  const afterWindow = normalize(left + input.replacement + right);
  const leftNorm = normalize(left);
  const rightNorm = normalize(right);
  const refNorm = normalize(input.reference);

  const empty = {
    beforeWindow,
    afterWindow,
    refSpan: "",
    beforeDist: -1,
    afterDist: -1,
    alignRatio: 1,
  };

  if (!beforeWindow) {
    return { verdict: "unmatched", ...empty };
  }

  const aligned = findAlignedSpan(refNorm, beforeWindow, leftNorm, rightNorm);
  if (!aligned) {
    return { verdict: "unmatched", ...empty };
  }

  const alignRatio = aligned.dist / beforeWindow.length;
  if (alignRatio > MAX_ALIGN_RATIO) {
    return {
      verdict: "unmatched",
      beforeWindow,
      afterWindow,
      refSpan: refNorm.slice(aligned.start, aligned.end),
      beforeDist: aligned.dist,
      afterDist: -1,
      alignRatio,
    };
  }

  const refSpan = refNorm.slice(aligned.start, aligned.end);
  const beforeDist = aligned.dist;
  const afterDist = editDistance(refSpan, afterWindow);

  let verdict: Verdict;
  if (afterDist < beforeDist) verdict = "improved";
  else if (afterDist > beforeDist) verdict = "worsened";
  else verdict = "tied";

  return {
    verdict,
    beforeWindow,
    afterWindow,
    refSpan,
    beforeDist,
    afterDist,
    alignRatio,
  };
}
