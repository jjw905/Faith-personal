import {
  ClipboardList,
  EyeOff,
  LayoutDashboard,
  ScrollText,
  Users,
  type LucideIcon,
} from "lucide-react";

export const APP_NAME = "Faith";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

export const NAV_ITEMS: NavItem[] = [
  {
    title: "대시보드",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    title: "회의 목록",
    href: "/meetings",
    icon: ClipboardList,
    badge: 12,
  },
  {
    title: "감사 로그",
    href: "/audit",
    icon: ScrollText,
  },
  {
    title: "사용자 관리",
    href: "/users",
    icon: Users,
  },
];

export const DEV_NAV_ITEMS: NavItem[] = [
  {
    title: "개인정보 마스킹",
    href: "/meetings/live-mask",
    icon: EyeOff,
  },
];

export const PAGE_TITLES: Record<string, { title: string; description: string }> =
  {
    "/": {
      title: "대시보드",
      description: "회의 현황과 보안 지표를 한눈에 확인하세요.",
    },
    "/meetings": {
      title: "회의 목록",
      description: "등록된 회의를 검색하고 관리합니다.",
    },
    "/meetings/live-mask": {
      title: "개인정보 마스킹",
      description: "원문과 마스킹 결과를 비교하며 R-08을 검증합니다.",
    },
    "/analysis": {
      title: "분석",
      description: "회의 데이터와 보안 트렌드를 분석합니다.",
    },
    "/security": {
      title: "보안 설정",
      description: "암호화, RBAC 정책을 구성합니다.",
    },
    "/audit": {
      title: "감사 로그",
      description: "시스템 접근 및 보안 이벤트 기록을 조회합니다.",
    },
    "/users": {
      title: "사용자 관리",
      description: "사용자 계정과 권한 레벨을 관리합니다.",
    },
    "/settings": {
      title: "시스템 설정",
      description: "워크스페이스, 보존 정책 등 시스템 환경을 구성합니다.",
    },
    "/account": {
      title: "계정 설정",
      description: "프로필, 알림, 언어 등 개인 계정 환경을 관리합니다.",
    },
  };
