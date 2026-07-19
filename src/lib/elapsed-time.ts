/** "25:00" / "01:05:00" → 초 */
export function parseElapsed(label: string): number {
  const parts = label
    .trim()
    .split(":")
    .map((p) => Number(p));
  if (parts.length === 0 || parts.some((n) => Number.isNaN(n))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] ?? 0;
}

/** 구간 길이 → "10분" / "1시간 5분" */
export function formatElapsedMinutes(seconds: number): string {
  if (seconds <= 0) return "1분";
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m}분`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}시간 ${rm}분` : `${h}시간`;
}

/** 녹음 시작 후 시점 → "25분" / "1시간 5분" / "시작" */
export function formatElapsedPoint(seconds: number): string {
  if (seconds <= 0) return "시작";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    if (m === 0 && s === 0) return `${h}시간`;
    if (s === 0) return `${h}시간 ${m}분`;
    return `${h}시간 ${m}분`;
  }
  if (m === 0) return `${s}초`;
  if (s === 0) return `${m}분`;
  return `${m}분 ${s}초`;
}

/** 구간 표기 → "25분 – 35분" */
export function formatElapsedRange(startSec: number, endSec: number): string {
  return `${formatElapsedPoint(startSec)} – ${formatElapsedPoint(endSec)}`;
}

export function clampPercent(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}
