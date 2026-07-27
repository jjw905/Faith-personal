/**
 * E0 자리별 판정 헬퍼 합성 스모크.
 * API 호출 없음.
 */
import { judgeChange, type Verdict } from "./lib/change-verdict";

type Case = {
  name: string;
  hypothesis: string;
  start: number;
  end: number;
  replacement: string;
  reference: string;
  expect: Verdict;
};

const cases: Case[] = [
  {
    name: "표주화→표준화",
    hypothesis: "이번 사업은 표주화를 통해 품질을 높이고 수출 경쟁력을 확보한다",
    start: "이번 사업은 ".length,
    end: "이번 사업은 표주화".length,
    replacement: "표준화",
    reference: "이번 사업은 표준화를 통해 품질을 높이고 수출 경쟁력을 확보한다",
    expect: "improved",
  },
  {
    name: "난춘맛돈→난축맛돈",
    hypothesis: "신품종 난춘맛돈을 농가에 보급하기로 했다",
    start: "신품종 ".length,
    end: "신품종 난춘맛돈".length,
    replacement: "난축맛돈",
    reference: "신품종 난축맛돈을 농가에 보급하기로 했다",
    expect: "improved",
  },
  {
    name: "배생산자→생산자",
    hypothesis: "오늘 배생산자와 간담회를 열었다",
    start: "오늘 ".length,
    end: "오늘 배생산자".length,
    replacement: "생산자",
    reference: "오늘 배 생산자와 간담회를 열었다",
    expect: "worsened",
  },
  {
    name: "이런→1건",
    hypothesis: "이런 사례가 반복되면 대책이 필요하다",
    start: 0,
    end: "이런".length,
    replacement: "1건",
    reference: "이런 사례가 반복되면 대책이 필요하다",
    expect: "worsened",
  },
  {
    name: "보도자료는총→보도자료는",
    hypothesis: "자세한 내용은 보도자료는총 참고하시기 바랍니다",
    start: "자세한 내용은 ".length,
    end: "자세한 내용은 보도자료는총".length,
    replacement: "보도자료는",
    reference: "자세한 내용은 보도자료는 총 참고하시기 바랍니다",
    expect: "worsened",
  },
  {
    name: "방문해서→방문해",
    hypothesis: "현장에서 방문해서 의견을 들었다",
    start: "현장에서 ".length,
    end: "현장에서 방문해서".length,
    replacement: "방문해",
    reference: "현장에서 방문해서 의견을 들었다",
    expect: "worsened",
  },
  {
    name: "시방→씨마늘",
    hypothesis: "시방 파종하는 시기를 앞당긴다",
    start: 0,
    end: "시방".length,
    replacement: "씨마늘",
    reference: "씨마늘 파종하는 시기를 앞당긴다",
    expect: "improved",
  },
  {
    name: "정답지에없는자리",
    hypothesis: "우주정거장 궤도 수리가 완료되었다",
    start: 0,
    end: "우주정거장".length,
    replacement: "국제우주정거장",
    reference: "농촌진흥청은 씨마늘 표준화 사업을 추진한다",
    expect: "unmatched",
  },
];

let failed = 0;
const rows: Array<{ name: string; expect: Verdict; got: Verdict; ok: boolean }> = [];

for (const c of cases) {
  const got = judgeChange({
    hypothesis: c.hypothesis,
    start: c.start,
    end: c.end,
    replacement: c.replacement,
    reference: c.reference,
  }).verdict;
  const ok = got === c.expect;
  if (!ok) failed += 1;
  rows.push({ name: c.name, expect: c.expect, got, ok });
  console.log(`${ok ? "OK" : "FAIL"}  ${c.name}: expect=${c.expect} got=${got}`);
}

console.log(`\n${cases.length - failed}/${cases.length} passed`);
if (failed > 0) process.exit(1);
