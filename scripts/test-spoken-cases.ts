import { maskPii } from "@/lib/masking";
import { normalizeWithMap } from "@/lib/masking/korean-digits";

const cases: string[] = [
  "차번호는 일구이사영육팔삼",
  "차량번호 구이허이영구사",
  "경기 육칠다칠육이오 (차량)",
  "번호판는 오팔사영이구칠",
  "차량번호는 일이사사이팔사",
  "송금: 사삼구팔영 사삼 팔칠공오영일 IBK",
  "칠일이제로영륙이오육칠사오 이고 카뱅 입니다 (계좌번호)",
  "우체국은행 육삼삼 공칠 사사팔구오일 (계좌)",
  "건보: 삼삼오육제로사제로륙",
  "건강보험 구사륙일칠팔구칠일",
  "가입자번호는 팔육영영사구구육",
  "차번호: 이육사일이일칠",
];

for (const c of cases) {
  const norm = normalizeWithMap(c);
  const r = maskPii(c);
  console.log("입력:", c);
  console.log("정규:", norm.out);
  console.log("출력:", r.masked);
  console.log("─".repeat(70));
}
