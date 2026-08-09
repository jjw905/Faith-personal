/**
 * 회의 상세 섹션 가로선·제목 정렬 계약 + 환경별 기대값.
 * 실행: npx tsx --tsconfig tsconfig.json scripts/test-meeting-detail-section-align.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  MEETING_DETAIL_LAYOUT_ENVS,
  MEETING_SECTION_RULE_ROW,
  MEETING_SECTION_SEARCH_TOGGLE,
  sectionRulesAligned,
  titleChipCentersAligned,
} from "../src/lib/meeting-section-header";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

function scenario(name: string, fn: () => void) {
  fn();
  console.log(`ok — ${name}`);
}

scenario("공통 가로선 클래스가 요약·참석에 쓰인다", () => {
  const summary = read("src/components/meetings/meeting-summary-card.tsx");
  const people = read("src/components/meetings/meeting-participants.tsx");
  assert.match(summary, /MEETING_SECTION_RULE_ROW/);
  assert.match(people, /MEETING_SECTION_RULE_ROW/);
  assert.ok(MEETING_SECTION_RULE_ROW.includes("h-12"));
  assert.ok(MEETING_SECTION_RULE_ROW.includes("md:h-11"));
  assert.ok(MEETING_SECTION_RULE_ROW.includes("border-b"));
});

scenario("타임라인은 keepToolbarBorder + 검색 토글 높이 맞춤", () => {
  const timeline = read("src/components/meetings/meeting-timeline.tsx");
  const search = read("src/components/dashboard/meeting-search.tsx");
  assert.match(timeline, /keepToolbarBorder/);
  assert.match(timeline, /w-full min-w-0 flex-1 items-center/);
  assert.match(timeline, /ml-auto[\s\S]*whitespace-nowrap/);
  assert.match(search, /keepToolbarBorder/);
  assert.match(search, /md:h-11 md:w-11/);
  assert.match(search, /w-full flex-1 items-center/);
  assert.ok(MEETING_SECTION_SEARCH_TOGGLE.includes("md:h-11"));
});

scenario("1열에서 요약·참석 사이 중복 hr 없음", () => {
  const body = read("src/components/meetings/meeting-detail-body.tsx");
  assert.doesNotMatch(body, /showStackDivider/);
  assert.doesNotMatch(body, /border-0 border-t border-border lg:hidden/);
});

scenario("제목 칩은 items-center, 태그는 제목 시작선(pl-12)", () => {
  const header = read("src/components/meetings/meeting-detail-header.tsx");
  assert.match(header, /items-center gap-2/);
  assert.match(header, /pl-12/);
  assert.doesNotMatch(header, /mt-0\.5 shrink-0/);
});

scenario("lg 2열에서 가로선 Y 정렬 판정", () => {
  assert.equal(sectionRulesAligned(200, 200), true);
  assert.equal(sectionRulesAligned(200, 200.5), true);
  assert.equal(sectionRulesAligned(200, 202), false);
});

scenario("칩·제목 중심 정렬 판정", () => {
  assert.equal(titleChipCentersAligned(90, 90), true);
  assert.equal(titleChipCentersAligned(90, 91.5), true);
  assert.equal(titleChipCentersAligned(90, 96), false);
});

scenario("환경별 기대: 모바일도 타임라인 툴바 선 유지, lg+ 2열", () => {
  for (const env of MEETING_DETAIL_LAYOUT_ENVS) {
    assert.equal(env.expectTimelineToolbarBorder, true);
    assert.equal(env.expectSideBySide, env.viewportWidth >= 1024);
  }
  assert.ok(MEETING_DETAIL_LAYOUT_ENVS.length >= 6);
});

console.log(`\n${MEETING_DETAIL_LAYOUT_ENVS.length} envs covered.`);
