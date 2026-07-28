/** Faith 요금 플랜 카탈로그. 마케팅 `/pricing` 과 대시보드 `/plan` 이 동일 수치를 쓴다. */

export type CatalogPlanId = "FREE" | "PRO" | "TEAM";

export type PlanLimits = {
  meetings: string;
  storage: string;
  masking: string;
  summary: string;
  workspace: string;
  team: string;
  priority: string;
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
  features: string[];
  limits: PlanLimits;
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
    features: [
      "회의 월 5회",
      "보관함 500MB",
      "음성 텍스트 추출",
      "개인정보 자동 마스킹",
    ],
    limits: {
      meetings: "월 5회",
      storage: "500MB",
      masking: "자동 마스킹",
      summary: "기본 요약",
      workspace: "개인",
      team: "팀 없음",
      priority: "일반",
    },
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    tagline: "개인 회의록",
    monthlyPrice: 19_000,
    yearlyMonthlyPrice: 15_833,
    yearlyTotal: 190_000,
    badges: ["연 결제 시 2개월 무료", "추천"],
    features: [
      "회의 무제한",
      "보관함 20GB",
      "고급 요약, 타임라인",
      "우선 처리 대기열",
      "개인 워크스페이스",
    ],
    limits: {
      meetings: "무제한",
      storage: "20GB",
      masking: "자동 마스킹",
      summary: "고급 요약, 타임라인",
      workspace: "개인",
      team: "팀 없음",
      priority: "우선",
    },
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
    features: [
      "팀 워크스페이스, 초대",
      "역할, 기록 열람 권한",
      "온라인 팀 회의",
      "예정 회의, 알림, 팀 공지",
      "감사 로그",
      "팀 보안 정책",
    ],
    limits: {
      meetings: "무제한",
      storage: "팀 정책",
      masking: "팀 보안 정책",
      summary: "고급 요약, 타임라인",
      workspace: "팀",
      team: "2명 이상",
      priority: "우선",
    },
  },
};

export const PLAN_COMPARE_ROWS: {
  key: keyof PlanLimits;
  label: string;
}[] = [
  { key: "meetings", label: "회의" },
  { key: "storage", label: "보관함" },
  { key: "masking", label: "마스킹" },
  { key: "summary", label: "요약" },
  { key: "workspace", label: "워크스페이스" },
  { key: "team", label: "팀" },
  { key: "priority", label: "처리" },
];

export function formatPlanWon(n: number) {
  return `₩${n.toLocaleString("ko-KR")}`;
}

export function planMonthlyFeeLabel(entry: PlanCatalogEntry) {
  if (entry.monthlyPrice == null) return "문의";
  if (entry.monthlyPrice === 0) return "월 ₩0";
  if (entry.priceUnit) {
    return `${formatPlanWon(entry.monthlyPrice)} ${entry.priceUnit}`;
  }
  return `월 ${formatPlanWon(entry.monthlyPrice)}`;
}
