/**
 * 회의 분석 진행률 — 화면은 서버 실측 target을 부드럽게 따라간다.
 * 가짜로 단계를 건너뛰지 않는다. 폴링 간격(1초)만 아주 작게 메꾼다.
 */

/** STT 종료 / 구조화 시작 (process-upload PROGRESS와 맞춤) */
export const PROGRESS_STRUCTURE_START = 72;
export const PROGRESS_STRUCTURE_DONE = 90;
export const PROGRESS_ALIGNED = 95;
export const PROGRESS_BUILT = 98;

/** 폴링 사이 최대 자체 전진 (%). 실측을 넘지 않는 수준만. */
const POLL_SMOOTH_GAP = 1.1;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * 폴링 사이 표시 상한 = 실측 + 작은 여유.
 * stalled로 밴드를 부풀리지 않는다 (진행상황에 맞춤).
 */
export function softCreepCeiling(target: number, _stalledMs = 0): number {
  const t = clamp(target, 0, 100);
  if (t >= 99.5) return 100;
  return Math.min(98.5, t + POLL_SMOOTH_GAP);
}

/** @deprecated softCreepCeiling 사용. 호환용. */
export function displayCreepCeiling(
  target: number,
  _gapMax?: number,
  _max?: number,
): number {
  return softCreepCeiling(target, 0);
}

/** 호환·테스트용. 실측 단계 경계 참고. */
export function bandSoftMax(target: number): number {
  const t = clamp(target, 0, 100);
  if (t >= 99.5) return 100;
  if (t < PROGRESS_STRUCTURE_START) return PROGRESS_STRUCTURE_START - 1;
  if (t < PROGRESS_STRUCTURE_DONE) return PROGRESS_STRUCTURE_DONE - 1;
  if (t < PROGRESS_ALIGNED) return PROGRESS_ALIGNED - 1;
  if (t < PROGRESS_BUILT) return PROGRESS_BUILT - 0.5;
  return 98;
}

export type DisplayPercentStepInput = {
  current: number;
  target: number;
  /** 미사용(호환). 실측 추종만 한다. */
  stalledMs?: number;
  nowMs?: number;
  dtMs: number;
};

/**
 * 한 프레임 뒤 표시 퍼센트.
 * 서버 target을 ease로 따라가고, target 위로는 최대 POLL_SMOOTH_GAP만.
 */
export function nextDisplayPercent(input: DisplayPercentStepInput): number {
  const current = clamp(input.current, 0, 100);
  const target = clamp(input.target, 0, 100);
  const dt = clamp(input.dtMs, 8, 48);
  const frame = dt / 16.67;
  const ceiling = softCreepCeiling(target);

  if (current < target - 0.03) {
    const dist = target - current;
    const k = 1 - Math.exp(-0.18 * frame);
    const zone =
      current < 25 ? 1.12 : current < 55 ? 1 : current < 78 ? 0.9 : 0.78;
    const step = Math.max(0.06 * frame, dist * k * zone);
    return Math.min(target, current + step);
  }

  if (current >= ceiling - 0.01) return Math.min(ceiling, Math.max(current, target));

  // target에 거의 도달: 폴링 여유분까지 아주 천천히만
  const dist = ceiling - current;
  const perSec = 0.18 + dist * 0.12;
  const step = Math.max(0.004 * frame, (perSec * dt) / 1000);
  return Math.min(ceiling, current + step);
}

/** 구조화 한 파트(시도)가 차지하는 실측 구간 [lo, hi). */
export function structurePartRange(params: {
  partIndex: number;
  partCount: number;
  attempt?: number;
  depth?: number;
  structureStart?: number;
  structureDone?: number;
}): { lo: number; hi: number } {
  const start = params.structureStart ?? PROGRESS_STRUCTURE_START;
  const done = params.structureDone ?? PROGRESS_STRUCTURE_DONE;
  const top = done - 1;
  const parts = Math.max(1, Math.floor(params.partCount) || 1);
  const partIndex = clamp(Math.floor(params.partIndex) || 0, 0, parts - 1);
  const span = top - start;
  const partSpan = span / parts;
  const lo = start + partIndex * partSpan;
  const hi = start + (partIndex + 1) * partSpan;
  return { lo, hi: Math.min(top, hi) };
}

/**
 * 구조화 실측 퍼센트.
 * - 파트 시작: 해당 파트 lo
 * - waitedMs: 그 파트 안에서만 시간이 갈수록 hi에 점근 (파트 완료 전 hi 미도달)
 */
export function structureProgressPercent(params: {
  partIndex: number;
  partCount: number;
  attempt: number;
  depth?: number;
  waitedMs?: number;
  structureStart?: number;
  structureDone?: number;
}): number {
  const { lo, hi } = structurePartRange(params);
  const attempt = Math.max(1, Math.floor(params.attempt) || 1);
  const depth = Math.max(0, Math.floor(params.depth ?? 0));
  const waited = Math.max(0, params.waitedMs ?? 0);

  // attempt/depth는 같은 파트 안 재시도 — lo에서 조금 더 안쪽으로
  const retryNudge = Math.min((hi - lo) * 0.12, (attempt - 1) * 0.8 + depth * 0.6);
  const base = Math.min(hi - 0.35, lo + retryNudge);

  if (waited <= 0) {
    return clamp(Math.round(base * 10) / 10, lo, hi - 0.2);
  }

  // 전형 구조화 호출 ~40s. 파트 구간 92%까지만 점근.
  const expectedMs = 40_000;
  const t = 1 - Math.exp(-waited / expectedMs);
  const pct = base + (hi - base) * 0.92 * t;
  return clamp(Math.round(pct * 10) / 10, lo, hi - 0.15);
}

/** 시뮬레이션·검증용 */
export function simulateDisplayPercent(params: {
  target: number;
  durationMs: number;
  dtMs?: number;
  start?: number;
}): number[] {
  const dt = params.dtMs ?? 16.67;
  let cur = params.start ?? Math.max(0, params.target - 8);
  let stalled = 0;
  const out: number[] = [cur];
  for (let t = 0; t < params.durationMs; t += dt) {
    stalled += dt;
    cur = nextDisplayPercent({
      current: cur,
      target: params.target,
      stalledMs: stalled,
      nowMs: t,
      dtMs: dt,
    });
    out.push(cur);
  }
  return out;
}

/**
 * 서버 target 시계열을 화면이 얼마나 잘 따라가는지 검증용.
 * maxLag = max(0, target - display) 상한.
 */
export function simulateFollowTargets(params: {
  samples: Array<{ atMs: number; target: number }>;
  durationMs: number;
  dtMs?: number;
  start?: number;
}): { series: number[]; maxLag: number; maxLead: number } {
  const dt = params.dtMs ?? 16.67;
  let cur = params.start ?? params.samples[0]?.target ?? 0;
  let target = cur;
  let si = 0;
  let maxLag = 0;
  let maxLead = 0;
  const series: number[] = [];
  for (let t = 0; t <= params.durationMs; t += dt) {
    while (
      si < params.samples.length &&
      params.samples[si]!.atMs <= t
    ) {
      target = Math.max(target, params.samples[si]!.target);
      si += 1;
    }
    cur = nextDisplayPercent({
      current: cur,
      target,
      stalledMs: 0,
      nowMs: t,
      dtMs: dt,
    });
    series.push(cur);
    maxLag = Math.max(maxLag, target - cur);
    maxLead = Math.max(maxLead, cur - target);
  }
  return { series, maxLag, maxLead };
}
