/**
 * 터치 타깃 토큰.
 *
 * Material 3 / Android 접근성: 터치 타깃 48x48dp, 인접 타깃 간 8dp 이상.
 * 데스크탑은 포인터 정밀도가 높아 같은 마크업을 유지한 채 크기만 줄인다.
 *
 * Button 기본 스타일의 `[&_svg]:size-4` 는 자식 선택자라 특이도가 높다.
 * 아이콘 크기는 이 토큰처럼 버튼 쪽에서 지정해야 적용된다.
 */

/** 아이콘 전용 버튼. 모바일 48, 데스크탑 36. */
export const TOUCH_ICON_BUTTON =
  "min-h-12 min-w-12 md:min-h-9 md:min-w-9 [&_svg]:size-6 md:[&_svg]:size-5";

/** 라벨이 있는 버튼. 모바일 48 높이. */
export const TOUCH_BUTTON =
  "min-h-12 md:min-h-10 [&_svg]:size-5 md:[&_svg]:size-4";

/** 목록 행 전체가 타깃인 경우. */
export const TOUCH_ROW = "min-h-14 md:min-h-11";

/** 인접 아이콘 타깃 묶음. 8dp 간격 확보. */
export const TOUCH_GROUP = "flex items-center gap-2 md:gap-0.5";
