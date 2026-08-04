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
  words?: Array<{ startSec: number }>;
}): number {
  const firstMeasuredWord = line.words?.find(
    (word) => Number.isFinite(word.startSec) && word.startSec >= 0,
  );
  if (firstMeasuredWord) return firstMeasuredWord.startSec;
  return typeof line.startSec === "number" && Number.isFinite(line.startSec)
    ? Math.max(0, line.startSec)
    : parseTranscriptTimeToSec(line.time);
}

/** 미디어 duration이 아직 없을 때 대화기록 마지막 줄 기준 추정. */
export function estimateTranscriptDurationSec(
  lines: Array<{
    time: string;
    startSec?: number;
    words?: Array<{ startSec: number }>;
  }>,
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

/** 발화가 끝난 뒤 형광펜이 완전히 사라지는 데 걸리는 시간. */
export const WORD_FOCUS_FADE_SEC = 0.28;

/**
 * 강제정렬이 침묵까지 한 단어의 endSec으로 삼는 오류를 UI에서 제한한다.
 * 글자 수가 긴 실제 어절은 허용하되 한 단어가 수 초간 켜져 있지는 않게 한다.
 */
const MAX_WORD_DURATION_BASE_SEC = 0.35;
const MAX_WORD_DURATION_PER_CHAR_SEC = 0.32;
const MAX_WORD_DURATION_SEC = 2.4;

export type ActiveWordFocus<T> = {
  word: T;
  /** 0~1. 발화 중에는 1, 발화 직후에는 서서히 0으로 내려간다. */
  strength: number;
};

function effectiveWordEndSec(word: {
  startSec: number;
  endSec: number;
  text?: string;
}): number {
  const textLength = Math.max(1, [...(word.text ?? "")].length);
  const plausibleDuration = Math.min(
    MAX_WORD_DURATION_SEC,
    MAX_WORD_DURATION_BASE_SEC + textLength * MAX_WORD_DURATION_PER_CHAR_SEC,
  );
  const reportedEnd = Number.isFinite(word.endSec)
    ? word.endSec
    : word.startSec;
  return Math.max(
    word.startSec,
    Math.min(reportedEnd, word.startSec + plausibleDuration),
  );
}

/**
 * 현재 재생 시각에 맞는 단어와 형광펜 강도.
 *
 * 다음 단어를 미리 켜거나 직전 단어를 무기한 유지하지 않는다. 두 동작 모두
 * 실제 발화보다 형광펜이 앞서거나, 침묵 중에도 켜져 있는 직접 원인이었다.
 * 발화가 끝난 직후만 짧게 감쇠시켜 음절 사이의 시각적 깜빡임을 줄인다.
 */
export function activeWordFocusAt<
  T extends { startSec: number; endSec: number; text?: string },
>(
  words: T[] | undefined,
  currentSec: number,
  fadeSec: number = WORD_FOCUS_FADE_SEC,
): ActiveWordFocus<T> | null {
  if (!words || words.length === 0) return null;
  const fade = Math.max(0, fadeSec);

  // 잔상보다 지금 실제로 발화 중인 단어를 먼저 찾는다. 한 단어의 fade 구간은
  // 흔히 다음 단어 시작과 겹친다. 배열 앞에서부터 fade까지 함께 반환하면
  // "직접"의 잔상이 이미 말하고 있는 "작동"을 약 0.28초 가리는 식으로
  // 하이라이트가 늘 한 단어 늦어 보인다.
  for (const word of words) {
    const endSec = effectiveWordEndSec(word);
    if (currentSec >= word.startSec && currentSec < endSec) {
      return { word, strength: 1 };
    }
  }

  // 현재 발화 중인 단어가 없을 때만 가장 최근 단어의 잔상을 보여준다.
  // 역전되거나 겹친 외부 timestamp가 와도 오래된 단어가 이기지 않게 한다.
  let fading: ActiveWordFocus<T> | null = null;
  for (const word of words) {
    const endSec = effectiveWordEndSec(word);
    if (fade > 0 && currentSec >= endSec && currentSec < endSec + fade) {
      const candidate = {
        word,
        strength: Math.max(0, 1 - (currentSec - endSec) / fade),
      };
      if (!fading || endSec > effectiveWordEndSec(fading.word)) {
        fading = candidate;
      }
    }
  }
  return fading;
}

/** 기존 호출부 호환용. 강도 없이 활성 단어만 필요할 때 쓴다. */
export function activeWordAt<
  T extends { startSec: number; endSec: number; text?: string },
>(words: T[] | undefined, currentSec: number): T | null {
  return activeWordFocusAt(words, currentSec)?.word ?? null;
}
