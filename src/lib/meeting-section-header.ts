/**
 * 회의 상세 섹션(요약·참석·타임라인) 공통 가로선 헤더.
 * 높이·보더를 맞추면 lg 2열에서 선이 한 가로로 이어진다.
 */

/** 섹션 타이틀 행 — 고정 높이 + 하단 가로선 */
export const MEETING_SECTION_RULE_ROW =
  "flex h-12 items-center border-b border-border md:h-11";

/** 타임라인 검색 토글 — 같은 행 높이에 맞춤 */
export const MEETING_SECTION_SEARCH_TOGGLE =
  "inline-flex h-12 w-12 shrink-0 items-center justify-center md:h-11 md:w-11";

/** 가로선 Y 허용 오차(px). 서브픽셀·보더 반올림 */
export const MEETING_SECTION_RULE_ALIGN_TOLERANCE_PX = 1;

/** 칩·제목 중심 Y 허용 오차 */
export const MEETING_TITLE_CHIP_ALIGN_TOLERANCE_PX = 2;

export type MeetingDetailLayoutEnv = {
  id: string;
  viewportWidth: number;
  /** lg(1024) 이상이면 요약|타임라인 2열 */
  expectSideBySide: boolean;
  /** md 미만 컨테이너에서 타임라인 툴바 가로선 유지 여부 */
  expectTimelineToolbarBorder: boolean;
};

export const MEETING_DETAIL_LAYOUT_ENVS: MeetingDetailLayoutEnv[] = [
  {
    id: "mobile-375",
    viewportWidth: 375,
    expectSideBySide: false,
    expectTimelineToolbarBorder: true,
  },
  {
    id: "mobile-390",
    viewportWidth: 390,
    expectSideBySide: false,
    expectTimelineToolbarBorder: true,
  },
  {
    id: "tablet-768",
    viewportWidth: 768,
    expectSideBySide: false,
    expectTimelineToolbarBorder: true,
  },
  {
    id: "laptop-1024",
    viewportWidth: 1024,
    expectSideBySide: true,
    expectTimelineToolbarBorder: true,
  },
  {
    id: "desktop-1280",
    viewportWidth: 1280,
    expectSideBySide: true,
    expectTimelineToolbarBorder: true,
  },
  {
    id: "desktop-1440",
    viewportWidth: 1440,
    expectSideBySide: true,
    expectTimelineToolbarBorder: true,
  },
];

export function sectionRulesAligned(
  summaryBorderY: number,
  timelineBorderY: number,
  tolerance = MEETING_SECTION_RULE_ALIGN_TOLERANCE_PX,
): boolean {
  return Math.abs(summaryBorderY - timelineBorderY) <= tolerance;
}

export function titleChipCentersAligned(
  chipCenterY: number,
  titleCenterY: number,
  tolerance = MEETING_TITLE_CHIP_ALIGN_TOLERANCE_PX,
): boolean {
  return Math.abs(chipCenterY - titleCenterY) <= tolerance;
}
