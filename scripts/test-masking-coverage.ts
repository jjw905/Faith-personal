/**
 * 규칙 마스킹 실측. 회의에서 실제로 나올 법한 말투로 검사한다.
 *
 * NER 서버(127.0.0.1:8765)는 배포 이미지에 없다. 여기서는 규칙만으로
 * 어디까지 가려지는지를 본다.
 *
 * npx tsx --tsconfig tsconfig.json scripts/test-masking-coverage.ts
 */
import { maskPii } from "../src/lib/masking/mask";
import type { PiiType } from "../src/lib/masking/types";

type Case = {
  type: PiiType;
  text: string;
  /** 반드시 가려져야 하는 조각. */
  secret: string;
};

const CASES: Case[] = [
  { type: "phone", text: "제 번호는 010-1234-5678입니다.", secret: "010-1234-5678" },
  { type: "phone", text: "연락처 01012345678로 주세요.", secret: "01012345678" },
  {
    type: "phone",
    text: "공일공에 일이삼사에 오육칠팔로 전화 주시면 됩니다.",
    secret: "일이삼사",
  },
  { type: "email", text: "메일은 hong.gildong@faith.co.kr 로 보내주세요.", secret: "hong.gildong@faith.co.kr" },
  { type: "email", text: "지메일 hong 골뱅이 gmail 점 com 입니다.", secret: "hong" },
  { type: "rrn", text: "주민번호 900101-1234567 확인 부탁드립니다.", secret: "900101-1234567" },
  { type: "card", text: "카드는 4111-1111-1111-1111 씁니다.", secret: "4111-1111-1111-1111" },
  { type: "account", text: "국민은행 123456-04-123456으로 입금해 주세요.", secret: "123456-04-123456" },
  { type: "account", text: "신한 110 123 456789 계좌입니다.", secret: "110 123 456789" },
  { type: "biz_no", text: "사업자등록번호는 123-45-67890입니다.", secret: "123-45-67890" },
  { type: "corp_no", text: "법인등록번호 110111-1234567 입니다.", secret: "110111-1234567" },
  { type: "passport", text: "여권번호 M12345678 로 예약했습니다.", secret: "M12345678" },
  { type: "driver_license", text: "운전면허 11-12-345678-90 입니다.", secret: "11-12-345678-90" },
  { type: "foreign_id", text: "외국인등록번호 900101-5234567 입니다.", secret: "900101-5234567" },
  { type: "vehicle", text: "차량은 12가 3456 입니다.", secret: "12가 3456" },
  { type: "ip", text: "서버 아이피는 192.168.10.25 입니다.", secret: "192.168.10.25" },
  { type: "address", text: "주소는 서울특별시 강남구 테헤란로 123 입니다.", secret: "테헤란로 123" },
  { type: "name", text: "이번 건은 김영록 과장님이 맡기로 했습니다.", secret: "김영록" },
  { type: "name", text: "홍길동입니다. 잘 부탁드립니다.", secret: "홍길동" },
  { type: "secret", text: "키는 sk-proj-abcdefghijklmnopqrstuvwxyz1234 입니다.", secret: "sk-proj-abcdefghijklmnopqrstuvwxyz1234" },
];

/** 회의록에서 가려지면 안 되는 말. 과잉 마스킹 확인용. */
const FALSE_POSITIVE_CASES: string[] = [
  "2026년 1월 15일 오후 3시에 회의를 시작하겠습니다.",
  "예산은 1억 2천만 원 규모입니다.",
  "47개 부처를 대상으로 확대합니다.",
  "국무회의 안건 3-1번을 보겠습니다.",
  "작년 대비 12.5퍼센트 증가했습니다.",
  "회의실은 3층 대회의실입니다.",
];

function main() {
  console.log("=== 가려져야 할 것 ===");
  const missed: Case[] = [];
  for (const item of CASES) {
    const result = maskPii(item.text, { style: "label" });
    const hidden = !result.masked.includes(item.secret);
    if (!hidden) missed.push(item);
    console.log(
      `${hidden ? "가림" : "노출"}  ${item.type.padEnd(15)} ${result.masked}`,
    );
  }

  console.log("\n=== 가리면 안 되는 것 ===");
  const overMasked: string[] = [];
  for (const text of FALSE_POSITIVE_CASES) {
    const result = maskPii(text, { style: "label" });
    const changed = result.masked !== text;
    if (changed) overMasked.push(text);
    console.log(`${changed ? "과잉" : "정상"}  ${result.masked}`);
  }

  const hit = CASES.length - missed.length;
  console.log(
    `\n탐지 ${hit}/${CASES.length} (${((hit / CASES.length) * 100).toFixed(0)}%) · 과잉 ${overMasked.length}/${FALSE_POSITIVE_CASES.length}`,
  );
  if (missed.length > 0) {
    console.log("\n놓친 항목:");
    for (const item of missed) console.log(`  ${item.type}: ${item.secret}`);
  }
}

main();
