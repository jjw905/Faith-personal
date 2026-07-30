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

/**
 * 재생 동기화에 쓸 줄 시작 시각.
 * time 문자열은 초 단위로 내림한 표시용이라 그대로 쓰면 늘 먼저 넘어간다.
 */
export function lineStartSec(line: {
  time: string;
  startSec?: number;
}): number {
  return typeof line.startSec === "number" && Number.isFinite(line.startSec)
    ? Math.max(0, line.startSec)
    : parseTranscriptTimeToSec(line.time);
}

/** 미디어 duration이 아직 없을 때 대화기록 마지막 줄 기준 추정. */
export function estimateTranscriptDurationSec(
  lines: Array<{ time: string; startSec?: number }>,
): number {
  if (lines.length === 0) return 0;
  let max = 0;
  for (const line of lines) {
    max = Math.max(max, lineStartSec(line));
  }
  return max > 0 ? max + 4 : 0;
}

/** "1시간 20분", "18분 27초", "5분" → 초. */
export function parseDurationLabelToSec(label: string): number {
  const t = label.trim();
  if (!t || t === "—" || t === "-") return 0;
  const h = t.match(/(\d+)\s*시간/);
  const m = t.match(/(\d+)\s*분/);
  const s = t.match(/(\d+)\s*초/);
  const total =
    (h ? Number(h[1]) * 3600 : 0) +
    (m ? Number(m[1]) * 60 : 0) +
    (s ? Number(s[1]) : 0);
  return Number.isFinite(total) ? Math.max(0, total) : 0;
}

export function formatPlaybackClock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) {
    return "0:00";
  }
  const s = Math.floor(sec);
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

/** HTMLMediaElement.duration → 유한 양수만. */
export function readMediaDurationSec(el: HTMLMediaElement): number {
  const d = el.duration;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/**
 * 현재 재생 시각에 맞는 단어 하나 (노래방 자막처럼 재생 중인 말풍선 안에서
 * 지금 말하는 단어를 찾는다). 단어 사이 짧은 공백은 직전 단어를 그대로 유지해
 * 하이라이트가 깜빡이지 않게 한다.
 */
export function activeWordAt<
  T extends { startSec: number; endSec: number },
>(words: T[] | undefined, currentSec: number): T | null {
  if (!words || words.length === 0) return null;
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    if (currentSec < w.startSec) {
      return i > 0 ? words[i - 1]! : null;
    }
    if (currentSec < w.endSec) return w;
  }
  return words[words.length - 1]!;
}
