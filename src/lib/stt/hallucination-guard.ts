/**
 * STT 환각 제거.
 *
 * 모델이 무너지면 같은 문장을 수십 번 반복하거나, 오디오가 끝난 뒤에도
 * 말을 지어낸다. 반대로 정상 발언을 지우면 회의록이 망가지므로,
 * 명백한 결함만 아래 기준으로 잘라낸다.
 *
 * 기준
 * 1. 같은 문장이 연달아 3번 넘게 나오면 1번만 남긴다.
 * 2. 같은 문장이 전체에서 6번 넘게 나오고 그 문장이 전체 글자의 30%를 넘으면
 *    앞의 2번만 남긴다.
 * 3. 초당 글자 수가 20자를 넘으면 과생성으로 표시한다. 지우지는 않는다.
 *
 * 짧은 대답(네, 예, 알겠습니다)은 실제로 반복되므로 8자 미만 문장은
 * 연속 반복만 본다.
 */

const CONSECUTIVE_LIMIT = 3;
const GLOBAL_LIMIT = 6;
const GLOBAL_SHARE = 0.3;
const SHORT_SENTENCE_CHARS = 8;
/** 한국어 회의 발화 속도의 3배 수준. 넘으면 과생성 의심. */
const MAX_CHARS_PER_SEC = 20;

export type HallucinationReport = {
  text: string;
  removedSentences: number;
  removedChars: number;
  /** 초당 글자 수가 기준을 넘었는지. 잘라내지는 않는다. */
  overGenerated: boolean;
  charsPerSec: number;
};

function normalize(sentence: string): string {
  return sentence.replace(/\s+/g, "").replace(/[.,!?…·"'`]/g, "");
}

/** 문장 단위로 나눈다. 구분자를 문장에 붙여 원문을 복원할 수 있게 한다. */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (ch === "\n" || ch === "." || ch === "?" || ch === "!") {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

export function stripHallucination(
  text: string,
  durationSec: number,
): HallucinationReport {
  const sentences = splitSentences(text);
  const counts = new Map<string, number>();
  for (const s of sentences) {
    const key = normalize(s);
    if (key.length >= SHORT_SENTENCE_CHARS) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const totalChars = normalize(text).length;
  const floodKeys = new Set<string>();
  for (const [key, count] of counts) {
    if (count > GLOBAL_LIMIT && (key.length * count) / (totalChars || 1) > GLOBAL_SHARE) {
      floodKeys.add(key);
    }
  }

  const kept: string[] = [];
  const floodKept = new Map<string, number>();
  let prevKey = "";
  let run = 0;
  let removedSentences = 0;
  let removedChars = 0;

  for (const sentence of sentences) {
    const key = normalize(sentence);
    if (!key) {
      kept.push(sentence);
      continue;
    }

    run = key === prevKey ? run + 1 : 1;
    prevKey = key;

    if (run > CONSECUTIVE_LIMIT) {
      removedSentences += 1;
      removedChars += key.length;
      continue;
    }

    if (floodKeys.has(key)) {
      const seen = floodKept.get(key) ?? 0;
      if (seen >= 2) {
        removedSentences += 1;
        removedChars += key.length;
        continue;
      }
      floodKept.set(key, seen + 1);
    }

    kept.push(sentence);
  }

  const cleaned = kept.join("").replace(/\n{3,}/g, "\n\n").trim();
  const charsPerSec = durationSec > 0 ? normalize(cleaned).length / durationSec : 0;

  return {
    text: cleaned,
    removedSentences,
    removedChars,
    overGenerated: charsPerSec > MAX_CHARS_PER_SEC,
    charsPerSec,
  };
}
