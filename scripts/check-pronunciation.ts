/**
 * 발음 유사도 확인. 보정 후보로 받아들일 임계값을 정하기 위한 점검.
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-pronunciation.ts
 */
import { pronunciationSimilarity, toJamo } from "../src/lib/stt/pronunciation";

const PAIRS: Array<[string, string, string]> = [
  ["803 국립공원", "팔공산 국립공원", "받아들여야 함"],
  ["803국립공원", "팔공산국립공원", "받아들여야 함"],
  ["대한 항공", "대한항공", "받아들여야 함"],
  ["환경부 차간", "환경부 차관", "받아들여야 함"],
  ["기후에너지환경부", "기후에너지환경부", "동일"],
  ["탄소중립기본법", "탄소중립기본법", "동일"],
  ["예산 심사", "결산 심사", "거절해야 함"],
  ["국립공원", "국회의원", "거절해야 함"],
  ["회의를 시작하겠습니다", "회의를 마치겠습니다", "거절해야 함"],
];

for (const [a, b, expect] of PAIRS) {
  const sim = pronunciationSimilarity(a, b);
  console.log(
    `${sim.toFixed(2)}  ${a} / ${b}  (${expect})\n      ${toJamo(a)} / ${toJamo(b)}`,
  );
}
