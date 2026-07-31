import {
  Activity,
  Archive,
  AudioLines,
  CalendarClock,
  CircleHelp,
  ClipboardList,
  EyeOff,
  Gauge,
  Gem,
  History,
  KeyRound,
  Mic,
  Palette,
  ScrollText,
  ShieldCheck,
  UserCog,
  UserRoundPlus,
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

/** 공통 메뉴. 감사, 팀 관리는 팀 워크스페이스 하위로만 노출. */
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
    title: "플랜",
    href: "/plan",
    icon: Gem,
  },
  {
    title: "도움말",
    href: "/help",
    icon: CircleHelp,
  },
];

export type TeamNavCapability =
  | "owner"
  | "manageTeam"
  | "invite"
  | "createMeeting"
  | "manageRecordAccess"
  | "viewAudit";

export type TeamNavItem = NavItem & {
  capability: TeamNavCapability;
};

/** 팀 기능 메뉴. 실제 노출은 멤버 역할과 세부 권한을 함께 판정한다. */
export const TEAM_NAV_ITEMS: TeamNavItem[] = [
  {
    title: "실시간 회의",
    href: "/team/live",
    icon: AudioLines,
    capability: "createMeeting",
  },
  {
    title: "일정 만들기",
    href: "/team/schedule",
    icon: CalendarClock,
    capability: "createMeeting",
  },
  {
    title: "공지 관리",
    href: "/team?manage=announcements",
    icon: UserCog,
    capability: "manageTeam",
  },
  {
    title: "멤버 초대",
    href: "/team?manage=invite",
    icon: UserRoundPlus,
    capability: "invite",
  },
  {
    title: "구성원과 권한",
    href: "/team?manage=members",
    icon: UsersRound,
    capability: "owner",
  },
  {
    title: "보안 정책",
    href: "/team?manage=security",
    icon: ShieldCheck,
    capability: "owner",
  },
  {
    title: "기록 열람",
    href: "/team?manage=records",
    icon: KeyRound,
    capability: "manageRecordAccess",
  },
  {
    title: "감사 로그",
    href: "/audit",
    icon: ScrollText,
    capability: "viewAudit",
  },
];

/** 관리자만 사이드바 운영 메뉴에 노출. 계정·사용량 등. */
export const OPS_NAV_ITEMS: NavItem[] = [
  {
    title: "운영 상태",
    href: "/operations",
    icon: ShieldCheck,
  },
  {
    title: "사용자 관리",
    href: "/users",
    icon: UserCog,
  },
  {
    title: "AI 사용량",
    href: "/ai-usage",
    icon: Gauge,
  },
  {
    title: "파이프라인 통계",
    href: "/pipeline-stats",
    icon: Activity,
  },
  {
    title: "설문 통계",
    href: "/survey-stats",
    icon: ClipboardList,
  },
];

/** 관리자만 사이드바 개발자 메뉴에 노출. 공통 메뉴와 화면/경로를 섞지 않음. */
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

export const PAGE_TITLES: Record<
  string,
  { title: string; description: string }
> = {
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
    title: "팀",
    description: "팀 회의, 공지, 기록을 확인합니다.",
  },
  "/ai-usage": {
    title: "AI 사용량",
    description: "받아쓰기, 정리 비용과 토큰을 확인합니다.",
  },
  "/pipeline-stats": {
    title: "파이프라인 통계",
    description: "업로드 처리 실패율과 단계별, 모델별 분포를 확인합니다.",
  },
  "/survey-stats": {
    title: "설문 통계",
    description: "결제 의향, 성능 만족도 설문 참여 현황을 확인합니다.",
  },
  "/users": {
    title: "사용자 관리",
    description: "서비스를 이용하는 계정, 역할, 활성 상태를 관리합니다.",
  },
  "/operations": {
    title: "운영 상태",
    description: "서비스 연결, 정책, 보존 작업 상태를 확인합니다.",
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
    description: "개발전용, 트리거·조건부 UI를 재현합니다.",
  },
  "/vault": {
    title: "보관함",
    description: "계정별 500MB 저장 공간, 회의 첨부에서도 사용합니다.",
  },
  "/plan": {
    title: "플랜",
    description: "현재 플랜, 포함 기능, 한도를 확인합니다.",
  },
};
