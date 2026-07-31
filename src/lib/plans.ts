/**
 * Faith 요금 플랜 카탈로그. 마케팅 `/pricing` 과 대시보드 `/plan` 이 동일 수치를 쓴다.
 *
 * 분당 과금 구조 (2026-07-31 반영). 원가 근거는
 * Faith-office/Faith_요금제_분당과금_반영_2026-07-31.md 참고.
 * Team 포함 분은 좌석당 부여 후 팀 워크스페이스 합산 풀로 쓴다.
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
   * Team은 좌석당 분이지만 개인 지갑이 아니라 팀 워크스페이스 합산 풀이다.
   * 팀 회의는 누가 시작하든 팀 풀에서만 차감한다.
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
    tagline: "개인 시작",
    monthlyPrice: 0,
    yearlyMonthlyPrice: 0,
    yearlyTotal: 0,
    includedMinutes: 60,
    overage: { upload: 20, realtime: 30 },
    storageLabel: "500MB",
    features: [
      "보관함 500MB",
      "음성 텍스트 추출",
      "정밀 화자·대화추적 선택(1.5배 차감)",
      "개인정보 자동 마스킹",
    ],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "개인 회의록",
    monthlyPrice: 19_000,
    yearlyMonthlyPrice: 15_833,
    yearlyTotal: 190_000,
    badges: ["연 결제 시 2개월 무료", "추천"],
    includedMinutes: 1_000,
    overage: { upload: 20, realtime: 30 },
    storageLabel: "20GB",
    features: [
      "보관함 20GB",
      "고급 요약, 타임라인",
      "단어 단위 재생 하이라이트",
      "정밀 화자·대화추적 선택(1.5배 차감)",
      "개인 워크스페이스",
    ],
    featured: true,
  },
  TEAM: {
    id: "TEAM",
    name: "Team",
    tagline: "팀 2명 이상",
    monthlyPrice: 15_200,
    yearlyMonthlyPrice: 15_200,
    priceUnit: "/ 인 / 월",
    badges: ["Pro 월간 대비 20% 할인"],
    includedMinutes: 300,
    overage: { upload: 20, realtime: 30 },
    storageLabel: "좌석당 20GB",
    features: [
      "보관함 좌석당 20GB",
      "팀 워크스페이스, 초대",
      "역할, 기록 열람 권한",
      "온라인 팀 회의",
      "정밀 화자·대화추적 선택(1.5배 차감)",
      "팀 분은 좌석 합산 풀에서 차감",
      "예정 회의, 알림, 팀 공지",
      "감사 로그, 팀 보안 정책",
    ],
  },
};

/** 추가 분 팩. 포함 분을 다 썼을 때 업그레이드 대신 고를 수 있는 소액 결제. */
export type TopupPack = {
  id: string;
  minutes: number;
  priceWon: number;
  badge?: string;
};

export const TOPUP_PACKS: TopupPack[] = [
  { id: "pack-30", minutes: 30, priceWon: 600 },
  { id: "pack-120", minutes: 120, priceWon: 2_400, badge: "가장 많이 선택" },
  { id: "pack-360", minutes: 360, priceWon: 7_200, badge: "가장 알차게" },
];

export function formatPlanWon(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}

export function formatPlanMinutes(entry: PlanCatalogEntry) {
  const minutes = entry.includedMinutes.toLocaleString("ko-KR");
  if (entry.id === "TEAM") return `좌석당 ${minutes}차감분 합산`;
  return `월 ${minutes}차감분`;
}

export function planMonthlyFeeLabel(entry: PlanCatalogEntry) {
  if (entry.monthlyPrice == null) return "문의";
  if (entry.monthlyPrice === 0) return "월 ₩0";
  if (entry.priceUnit) {
    return `${formatPlanWon(entry.monthlyPrice)} ${entry.priceUnit}`;
  }
  return `월 ${formatPlanWon(entry.monthlyPrice)}`;
}

/** 포함 분을 다 썼을 때 안내하는 공통 문구. 분당 단가는 노출하지 않는다. */
export const PLAN_OVERAGE_NOTE =
  "일반 분석 1분은 1차감분, 정밀 분석 1분은 1.5차감분입니다";
