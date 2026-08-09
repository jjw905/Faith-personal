/**
 * 캠페인성 킬 스위치 모음. 기능을 지우지 않고 배포 환경값으로 진입점만 잠근다.
 * NEXT_PUBLIC 값은 빌드 결과에 포함되므로 변경 후 다시 배포해야 한다.
 */

function publicBoolean(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}

/**
 * 팀 기능은 관리자에게만 먼저 공개한다. 일반 사용자 공개 전까지는 이 플래그와
 * 관리자 전용 스위치를 함께 서버에서 검사한다. 클라이언트의 메뉴 숨김은 편의용이고,
 * 실제 접근 통제는 각 페이지·API에서 동일한 판정을 다시 수행한다.
 */
export const TEAM_FEATURE_ENABLED = publicBoolean(
  process.env.NEXT_PUBLIC_TEAM_FEATURE_ENABLED,
  true,
);
export const TEAM_FEATURE_ADMIN_ONLY = publicBoolean(
  process.env.NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY,
  true,
);

export function isTeamFeatureEnabledForRole(role?: string | null) {
  if (!TEAM_FEATURE_ENABLED) return false;
  if (role !== "ADMIN" && role !== "USER") return false;
  return !TEAM_FEATURE_ADMIN_ONLY || role === "ADMIN";
}

/**
 * 수요 설문 캠페인(설문 유도·최초 진입 고지·설문으로 무료 한도 해금 CTA) on/off.
 * 플랜별 월간 잔여 시간 표시·차감은 이 값과 무관하게 항상 적용한다.
 */
export const DEMAND_SURVEY_ACTIVE = false;

/**
 * 오픈 준비 기간 동안 실시간 회화(음성) 기록은 검증 범위 밖이다(업로드
 * 분석만 검증). 세션 발급 API(진입 지점)와 녹음 버튼만 잠그고, 훅·저장소·
 * 처리 코드는 그대로 둔다. 다시 열 때는 배포 스위치만 true로 바꾼다.
 */
export const REALTIME_FEATURE_ENABLED = publicBoolean(
  process.env.NEXT_PUBLIC_REALTIME_FEATURE_ENABLED,
  false,
);

/**
 * 오픈 준비 기간 동안 Pro/Team 유료 플랜 가입 유도는 하지 않는다(설문
 * 자체가 결제 의향을 묻는 절차라 실제 결제 전환 CTA와 병행하면 신호가 섞인다).
 * 요금 카탈로그·문의 메일 유틸은 그대로 두고, 마케팅/플랜 페이지 CTA는
 * 정상 라벨로 보이되 클릭·호버 반응 없이 둔다. 오픈 준비가 끝나면 이 값만
 * true로 되돌리면 된다.
 */
export const PAID_PLANS_ENABLED = false;
