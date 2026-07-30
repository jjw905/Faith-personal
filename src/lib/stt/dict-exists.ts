/**
 * 한국어 실재어 관문.
 *
 * MIT 낱말 목록을 먼저 보고, 없는 말만 우리말샘 boolean 캐시와 API로 보낸다.
 * 뜻풀이, 용례, 발음 파일은 읽거나 저장하지 않는다.
 */
import commonWords from "@/lib/stt/data/korean-common-words.json";
import {
  dictionaryLemmaCandidates,
  sourceInKoreanDictionary,
} from "@/lib/stt/korean-dictionary";

const OFFLINE_WORDS = new Set<string>(commonWords);

export function sourceInOfflineDictionary(word: string): boolean {
  return dictionaryLemmaCandidates(word).some((candidate) =>
    OFFLINE_WORDS.has(candidate),
  );
}

export async function sourceInDictionary(
  word: string,
  options?: { cacheOnly?: boolean },
): Promise<boolean | null> {
  if (sourceInOfflineDictionary(word)) return true;
  return sourceInKoreanDictionary(word, options);
}

export function offlineDictionarySize(): number {
  return OFFLINE_WORDS.size;
}

export { dictionaryLemmaCandidates };
