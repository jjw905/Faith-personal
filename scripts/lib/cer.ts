/**
 * 글자 단위 오류율을 잰다.
 *
 * 정답지가 녹음 전체를 덮지 않거나 중간을 건너뛰는 경우가 많다. 통째로 이어
 * 붙여 비교하면 빠진 만큼이 전부 오류로 잡혀 실제보다 훨씬 나쁘게 나온다.
 * 그래서 문단마다 전사에서 짝을 찾고, 짝이 있는 데만 더한다.
 */

export function normalize(text: string): string {
  return text.toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
}

export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(
        Math.min(
          cur[j - 1]! + 1,
          prev[j]! + 1,
          prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        ),
      );
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export type Mismatch = {
  dist: number;
  len: number;
  ref: string;
  hyp: string;
};

export type AlignedCer = {
  cer: number;
  matched: number;
  total: number;
  refChars: number;
  worst: Mismatch[];
};

/** 짝을 못 찾았다고 볼 기준. 절반 넘게 틀리면 다른 대목이다. */
const MISS_RATIO = 0.5;

/**
 * @param refParas 정답 문단 (이미 normalize 된 것)
 * @param hyp 전사 전체 (이미 normalize 된 것)
 */
export function alignedCer(refParas: string[], hyp: string): AlignedCer {
  let cursor = 0;
  let totalDist = 0;
  let totalRef = 0;
  let matched = 0;
  const worst: Mismatch[] = [];

  for (const para of refParas) {
    const lo = Math.max(0, cursor - 120);
    const hi = Math.min(hyp.length, cursor + 900);
    let best = { dist: Infinity, start: cursor, end: cursor };

    const tryAt = (start: number, len: number) => {
      const end = Math.min(hyp.length, start + len);
      const d = editDistance(para, hyp.slice(start, end));
      if (d < best.dist) best = { dist: d, start, end };
    };

    for (let start = lo; start <= hi; start += 12) {
      for (const scale of [0.9, 1.05, 1.2]) {
        tryAt(start, Math.round(para.length * scale));
      }
    }
    const from = Math.max(lo, best.start - 12);
    for (let start = from; start <= best.start + 12; start++) {
      const shortest = Math.round(para.length * 0.85);
      const longest = Math.round(para.length * 1.25);
      for (let len = shortest; len <= longest; len += 4) tryAt(start, len);
    }

    if (best.dist / para.length > MISS_RATIO) continue;

    totalDist += best.dist;
    totalRef += para.length;
    matched += 1;
    worst.push({
      dist: best.dist,
      len: para.length,
      ref: para.slice(0, 60),
      hyp: hyp.slice(best.start, Math.min(best.end, best.start + 60)),
    });
    cursor = best.end;
  }

  worst.sort((a, b) => b.dist / b.len - a.dist / a.len);
  return {
    cer: totalDist / Math.max(1, totalRef),
    matched,
    total: refParas.length,
    refChars: totalRef,
    worst,
  };
}
