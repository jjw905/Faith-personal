/**
 * Faith 요금 플랜 카탈로그. 마케팅 `/pricing` 과 대시보드 `/plan` 이 동일 수치를 쓴다.
 *
 * 분당 과금 구조의 이력·원가 근거는
 * Faith-office/02_사업_요금_마케팅/Faith_사업_요금_마케팅_통합_2026-08-03.md 참고.
 * Team은 2026-08-02부터 좌석당 과금을 폐지하고 인원 무관 고정가로 전환했다.
 * 포함 분은 팀 전체가 나눠 쓰는 단일 풀이며, 인원이 늘어도 요금이 바뀌지 않는다.
 * 근거: 위 통합 문서의 현재 카탈로그와 Team 전환 이력.
 */

export type CatalogPlanId = "FREE" | "PRO" | "TEAM";

export type PlanOverage = {
  /** 업로드 분석 초과 분당 단가(원). null이면 이 플랜은 초과 판매 없이 업그레이드/팩만 안내. */
  upload: number | null;
  /** 실시간 회의 초과 분당 단가(원). 실시간은 오픈 전이라 참고용으로만 표기. */
  realtime: number | null;
};

export type PlanCatalogEntry = {
  id: CatalogPlanId;
  name: string;
  tagline: string;
  /** 월 정가(원). null이면 문의. */
  monthlyPrice: number | null;
  /** 연간 결제 시 월 환산가. */
  yearlyMonthlyPrice?: number | null;
  yearlyTotal?: number | null;
  priceUnit?: string;
  badges?: string[];
  /**
   * 월 포함 분.
   * Team은 인원 수와 무관한 팀 전체 단일 풀이다.
   * 팀 회의는 누가 시작하든 이 풀에서만 차감한다.
   */
  includedMinutes: number;
  overage: PlanOverage;
  storageLabel: string;
  features: string[];
  featured?: boolean;
};

export const PLAN_CATALOG: Record<CatalogPlanId, PlanCatalogEntry> = {
  FREE: {
    id: "FREE",
    name: "Free",
    tagline: "회의 정리를 시작하는 기본 플랜",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    yearlyTotal: 0,
    includedMinutes: 60,
    overage: { upload: 20, realtime: 30 },
    storageLabel: "500MB",
    features: [
      "사용 시간 60분",
      "보관함 500MB",
      "요약, 타임라인",
      "개인정보 마스킹",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "개인 생산성을 위한 플랜",
    monthlyPrice: 19_000,
    yearlyMonthlyPrice: 15_833,
    yearlyTotal: 190_000,
    badges: ["추천"],
    includedMinutes: 1_000,
    overage: { upload: 20, realtime: 30 },
    storageLabel: "20GB",
    features: [
      "사용 시간 1,000분",
      "보관함 20GB",
      "요약, 타임라인",
      "화자 구분",
      "단어 단위 마스킹",
      "개인정보 마스킹",
    ],
    featured: true,
  },
  TEAM: {
    id: "TEAM",
    name: "Team",
    tagline: "협업을 위한 팀 플랜",
    monthlyPrice: 99_000,
    yearlyMonthlyPrice: 82_500,
    yearlyTotal: 990_000,
    badges: ["인원 무관 고정가"],
    includedMinutes: 5_000,
    overage: { upload: 20, realtime: 30 },
    storageLabel: "100GB",
    features: [
      "사용 시간 5,000분",
      "보관함 100GB",
      "요약, 타임라인, 화자 구분",
      "단어 단위 마스킹, 개인정보 마스킹",
      "팀 워크스페이스, 초대, 역할",
      "온라인 회의, 일정, 공지",
      "감사 로그, 보안 정책",
    ],
  },
};

/** 추가 시간. 포함 시간을 다 썼을 때 업그레이드 대신 고를 수 있는 소액 결제. */
export type TopupPack = {
  id: string;
  minutes: number;
  priceWon: number;
  badge?: string;
};

export const TOPUP_PACKS: TopupPack[] = [
  { id: "pack-30", minutes: 30, priceWon: 600 },
  { id: "pack-120", minutes: 120, priceWon: 2_400, badge: "추천" },
  { id: "pack-360", minutes: 360, priceWon: 7_200 },
];

export function formatPlanWon(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}

export function formatPlanMinutes(entry: PlanCatalogEntry) {
  const minutes = entry.includedMinutes.toLocaleString("ko-KR");
  return `사용 시간 ${minutes}분`;
}

export function planMonthlyFeeLabel(entry: PlanCatalogEntry) {
  if (entry.monthlyPrice == null) return "문의";
  if (entry.monthlyPrice === 0) return "월 ₩0";
  if (entry.priceUnit) {
    return `${formatPlanWon(entry.monthlyPrice)} ${entry.priceUnit}`;
  }
  return `월 ${formatPlanWon(entry.monthlyPrice)}`;
}

/** 제품 분석 모드의 서버·클라이언트 공통 판정 결과. */
export type EntitledAnalysisMode = "standard" | "precision";

/**
 * Free는 빠른 정리가 기본이고, Pro/Team/Admin과 팀 워크스페이스는
 * 빠른 정리 선택 없이 화자 구분을 자동 적용한다.
 *
 * `TEAM`은 현재 User.plan enum에 없는 카탈로그/이전 데이터 값도 안전하게
 * 처리하기 위해 문자열로 비교한다. 팀 워크스페이스는 계정 플랜과 별도로
 * 팀 권한을 부여받은 경우를 포함한다.
 */
export function planIncludesSpeakerSplit(
  plan?: string | null,
  role?: string | null,
  workspace?: string | null,
) {
  if (role === "ADMIN") return true;
  return plan === "PRO" || plan === "TEAM" || workspace === "team";
}

export function resolveAnalysisModeForEntitlement(
  plan?: string | null,
  role?: string | null,
  workspace?: string | null,
): EntitledAnalysisMode {
  return planIncludesSpeakerSplit(plan, role, workspace)
    ? "precision"
    : "standard";
}
