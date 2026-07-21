import {
  Archive,
  CircleHelp,
  EyeOff,
  History,
  Mic,
  Palette,
  ScrollText,
  UserCog,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

export const APP_NAME = "Faith";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

/** 공통 메뉴. 감사·팀 관리는 팀 워크스페이스 하위로만 노출. */
export const NAV_ITEMS: NavItem[] = [
  {
    title: "회의",
    href: "/dashboard",
    icon: Mic,
  },
  {
    title: "보관함",
    href: "/vault",
    icon: Archive,
  },
  {
    title: "Changelog",
    href: "/changelog",
    icon: History,
  },
  {
    title: "도움말",
    href: "/help",
    icon: CircleHelp,
  },
];

/** 팀 워크스페이스 전용 하위 메뉴. */
export const TEAM_NAV_ITEMS: NavItem[] = [
  {
    title: "감사 로그",
    href: "/audit",
    icon: ScrollText,
  },
  {
    title: "팀 관리",
    href: "/team",
    icon: UsersRound,
  },
];

/** 관리자만 사이드바 개발전용에 노출. 공통 메뉴와 화면/경로를 섞지 않음. */
export const DEV_NAV_ITEMS: NavItem[] = [
  {
    title: "Changelog",
    href: "/changelog/dev",
    icon: History,
  },
  {
    title: "디자인",
    href: "/design",
    icon: Palette,
  },
  {
    title: "사용자 관리",
    href: "/users",
    icon: UserCog,
  },
  {
    title: "개인정보 마스킹",
    href: "/meetings/live-mask",
    icon: EyeOff,
  },
  {
    title: "새 회의",
    href: "/meetings/new",
    icon: Mic,
  },
];

export const PAGE_TITLES: Record<string, { title: string; description: string }> =
  {
    "/dashboard": {
      title: "회의",
      description: "새 회의를 기록하고 목록을 관리합니다.",
    },
    "/meetings": {
      title: "회의",
      description: "새 회의를 기록하고 목록을 관리합니다.",
    },
    "/meetings/live-mask": {
      title: "개인정보 마스킹",
      description: "원문과 마스킹 결과를 비교하며 R-08을 검증합니다.",
    },
    "/meetings/new": {
      title: "새 회의",
      description: "개발전용, 실시간 인식·채팅 레이아웃을 검증합니다.",
    },
    "/audit": {
      title: "감사 로그",
      description:
        "팀 워크스페이스, 접근 기록, 보안 이벤트, 회의, 보안 추이를 확인합니다.",
    },
    "/team": {
      title: "팀 관리",
      description: "팀에 속한 멤버와 팀 운영 설정을 관리합니다.",
    },
    "/users": {
      title: "사용자 관리",
      description: "서비스를 이용하는 계정, 역할, 활성 상태를 관리합니다.",
    },
    "/settings": {
      title: "시스템 설정",
      description: "",
    },
    "/account": {
      title: "계정 설정",
      description: "프로필, 알림 센터, 언어 등 개인 계정 환경을 관리합니다.",
    },
    "/help": {
      title: "도움말",
      description: "",
    },
    "/changelog": {
      title: "Changelog",
      description: "새로 쓸 수 있게 된 Faith 기능을 확인합니다.",
    },
    "/changelog/dev": {
      title: "Changelog",
      description: "개발전용, 개발안건과 내부 변경 이력을 확인합니다.",
    },
    "/design": {
      title: "디자인",
      description: "개발전용, 화면 패턴을 미리봅니다.",
    },
    "/vault": {
      title: "보관함",
      description: "계정별 500MB 저장 공간, 회의 첨부에서도 사용합니다.",
    },
  };
