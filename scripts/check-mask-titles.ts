/**
 * 직함, 일반 호칭이 개인정보로 잘못 가려지는지 점검.
 *
 * npx tsx --tsconfig tsconfig.json scripts/check-mask-titles.ts
 */
import { maskPii } from "../src/lib/masking/mask";

const CASES = [
  // 424회 환노위 녹음을 듣고 사용자가 짚은 오탐
  "원안대로 의결하고자 하는데 위원님 여러분 이의 없으십니까",
  "노동자에게 돌아가는 몫",
  "걱정하는 환노위 위원들에게",
  "우리 차관님께 여쭙겠습니다",
  "존경하는 위원장님",
  "이번 위원회 안건입니다",
  "우재준 위원님 발언하실 게 있습니까",
  "정혜경 위원이 지적한 부분",
  "환경부 금한승 차관님",
  "위원장님 안녕하세요",
  "위원장",
  "우재준 위원님 발언하실 게 있습니까?",
  "금한승 차관님 축하드립니다",
  "김성환 환경부 장관 후보자",
  "노조위원장이 참석했습니다",
  "고객님 문의 주셨습니다",
  "팀장님께 보고했습니다",
  "본부장님 지시사항",
  "이재명 정부가 추진하는",
  "팔공산국립공원 생태탐방원",
  "제 번호는 010-1234-5678입니다",
  "담당자는 김민수입니다",
];

let bad = 0;
for (const text of CASES) {
  const r = maskPii(text);
  const changed = r.masked !== text;
  console.log(
    `${changed ? "가림" : "유지"} | ${text}` +
      (changed
        ? `\n      -> ${r.masked}  [${r.matches.map((m) => `${m.type}:${m.value}`).join(", ")}]`
        : ""),
  );
  if (changed) bad += 1;
}
console.log(`\n변경된 문장 ${bad}/${CASES.length}`);
