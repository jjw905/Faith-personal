/** 대화기록 시각(00:12, 01:05:20) → 초. */
export function parseTranscriptTimeToSec(time: string): number {
  const parts = time
    .trim()
    .split(":")
    .map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) {
    return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  }
  if (parts.length === 2) {
    return parts[0]! * 60 + parts[1]!;
  }
  if (parts.length === 1) return parts[0]!;
  return 0;
}

export function formatPlaybackClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** 현재 시각에 해당하는 줄 인덱스 (시작 시각 기준, 마지막 매칭). */
export function activeLineIndexAt(
  startsSec: number[],
  currentSec: number,
): number {
  if (startsSec.length === 0) return -1;
  let idx = 0;
  for (let i = 0; i < startsSec.length; i++) {
    if (startsSec[i]! <= currentSec + 0.05) idx = i;
    else break;
  }
  return idx;
}
