export type PageUxScenario = {
  id: string;
  label: string;
};

const LIVE: PageUxScenario = { id: "live", label: "실제" };
const EMPTY: PageUxScenario = { id: "empty", label: "비어 있음" };
const FULL: PageUxScenario = { id: "full", label: "채워짐" };
const QUOTA_TIGHT: PageUxScenario = { id: "quota-tight", label: "용량 임박" };
const QUOTA_FULL: PageUxScenario = { id: "quota-full", label: "용량 가득" };
const LOADING: PageUxScenario = { id: "loading", label: "불러오는 중" };

const POPUP = {
  notificationsExpand: {
    id: "popup-notifications-expand",
    label: "알림 센터",
  },
  account: { id: "popup-account", label: "계정 메뉴" },
  upload: { id: "upload", label: "올리기 팝업" },
  uploadBusy: { id: "upload-busy", label: "올리는 중" },
  uploadQuota: { id: "upload-quota", label: "올리기, 용량 가득" },
  duplicate: { id: "popup-duplicate", label: "중복 파일명" },
  vaultPicker: { id: "popup-vault-picker", label: "보관함 고르기" },
  vaultPickerLoading: {
    id: "popup-vault-picker-loading",
    label: "보관함 불러오는 중",
  },
  vaultPickerEmpty: {
    id: "popup-vault-picker-empty",
    label: "보관함 비어 있음",
  },
  uploading: { id: "popup-uploading", label: "업로드 중" },
  recording: { id: "popup-recording", label: "녹음 중(펼침)" },
  startReady: { id: "popup-start-ready", label: "시작 대기" },
  starting: { id: "popup-starting", label: "회의 시작 중" },
  startError: { id: "popup-start-error", label: "시작 실패" },
  uploadFlow: { id: "anim-upload-flow", label: "선택→시작 흐름" },
  recordExpand: { id: "anim-record-expand", label: "녹음 펼침 흐름" },
  processing: { id: "anim-processing", label: "제작 중(기록)" },
  sort: { id: "popup-sort", label: "정렬 메뉴" },
  recordsDelete: { id: "popup-records-delete", label: "기록 삭제" },
  recordsDownload: { id: "popup-records-download", label: "기록 받기" },
  upcoming: { id: "popup-upcoming", label: "예정 상세" },
  upcomingCreate: { id: "popup-upcoming-create", label: "예정 작성" },
  composer: { id: "popup-composer", label: "팀 회의 바로시작" },
  composerSchedule: {
    id: "popup-composer-schedule",
    label: "팀 회의 예약",
  },
  announce: { id: "popup-announce", label: "공지 관리" },
  settings: { id: "popup-settings", label: "팀 설정" },
  alerts: { id: "banner-alerts", label: "미확인 알림" },
  invite: { id: "popup-invite", label: "구성원 초대" },
  inviteSearch: { id: "popup-invite-search", label: "초대 검색 중" },
  member: { id: "popup-member", label: "구성원 권한" },
  access: { id: "popup-access", label: "기록 접근" },
  createTeamFirst: {
    id: "popup-create-team-first",
    label: "팀 먼저 만들기",
  },
  teamSettingsOff: {
    id: "popup-team-settings-off",
    label: "팀 설정 준비중",
  },
} as const satisfies Record<string, PageUxScenario>;

const LIST_SCENARIOS: PageUxScenario[] = [LIVE, EMPTY, FULL];

/** 헤더 알림 + 사이드바 계정 메뉴 (대부분 대시보드 화면 공통). */
const CHROME_POPUPS: PageUxScenario[] = [
  POPUP.notificationsExpand,
  POPUP.account,
];

const DASHBOARD_SCENARIOS: PageUxScenario[] = [
  ...LIST_SCENARIOS,
  ...CHROME_POPUPS,
  POPUP.processing,
  POPUP.sort,
  POPUP.upcoming,
  POPUP.upcomingCreate,
  POPUP.recordsDelete,
  POPUP.recordsDownload,
];

/** 회의록 생성(`/meetings/new`) — 보관함·업로드·녹음 → 분석 */
const MEETING_CREATE_SCENARIOS: PageUxScenario[] = [
  LIVE,
  POPUP.vaultPicker,
  POPUP.vaultPickerLoading,
  POPUP.vaultPickerEmpty,
  POPUP.uploading,
  POPUP.recording,
  POPUP.startReady,
  POPUP.starting,
  POPUP.startError,
  POPUP.uploadFlow,
  POPUP.recordExpand,
  POPUP.duplicate,
  ...CHROME_POPUPS,
];

const VAULT_SCENARIOS: PageUxScenario[] = [
  ...LIST_SCENARIOS,
  QUOTA_TIGHT,
  QUOTA_FULL,
  POPUP.upload,
  POPUP.uploadBusy,
  POPUP.uploadQuota,
  POPUP.duplicate,
  ...CHROME_POPUPS,
];

const PLAN_SCENARIOS: PageUxScenario[] = [
  ...LIST_SCENARIOS,
  QUOTA_TIGHT,
  QUOTA_FULL,
  ...CHROME_POPUPS,
];

const TEAM_SCENARIOS: PageUxScenario[] = [
  ...LIST_SCENARIOS,
  LOADING,
  POPUP.alerts,
  POPUP.composer,
  POPUP.composerSchedule,
  POPUP.announce,
  POPUP.settings,
  ...CHROME_POPUPS,
];

const TEAM_MEMBERS_SCENARIOS: PageUxScenario[] = [
  ...LIST_SCENARIOS,
  LOADING,
  POPUP.invite,
  POPUP.inviteSearch,
  POPUP.member,
  ...CHROME_POPUPS,
];

const TEAM_RECORDS_SCENARIOS: PageUxScenario[] = [
  ...LIST_SCENARIOS,
  LOADING,
  POPUP.access,
  ...CHROME_POPUPS,
];

const TEAM_SECURITY_SCENARIOS: PageUxScenario[] = [
  LIVE,
  LOADING,
  { id: "security-key-ready", label: "보안 키 연결됨" },
  { id: "security-key-attention", label: "보안 키 설정 필요" },
  ...CHROME_POPUPS,
];

const TEAM_INVITE_SCENARIOS: PageUxScenario[] = [
  LIVE,
  LOADING,
  POPUP.invite,
  POPUP.inviteSearch,
  ...CHROME_POPUPS,
];

const TEAM_MEETING_SETUP_SCENARIOS: PageUxScenario[] = [
  LIVE,
  EMPTY,
  LOADING,
  ...CHROME_POPUPS,
];

const WITH_CHROME: PageUxScenario[] = [...LIST_SCENARIOS, ...CHROME_POPUPS];

const AUDIT_SCENARIOS: PageUxScenario[] = [
  ...LIST_SCENARIOS,
  LOADING,
  ...CHROME_POPUPS,
];

const ADMIN_LIST_SCENARIOS: PageUxScenario[] = [
  ...LIST_SCENARIOS,
  LOADING,
  ...CHROME_POPUPS,
];

/** 로그인/회원가입/비번찾기 — 로컬 제품 화면만. */
const AUTH_SCENARIOS = {
  login: { id: "login", label: "로그인" },
  loginRegistered: { id: "login-registered", label: "로그인, 가입 완료" },
  loginError: { id: "login-error", label: "로그인, 자격 오류" },
  signupSocial: { id: "signup-social", label: "회원가입, 소셜" },
  email: { id: "signup-email-verify", label: "이메일 인증" },
  code: { id: "signup-email-code", label: "이메일 인증 확인" },
  confirmed: {
    id: "signup-email-confirmed",
    label: "이메일 인증 완료",
  },
  account: { id: "signup-account", label: "계정 정보 입력" },
  forgot: { id: "forgot-password", label: "비밀번호 찾기" },
  forgotSent: {
    id: "forgot-password-sent",
    label: "비밀번호 찾기, 발송",
  },
  reset: { id: "reset-password", label: "비밀번호 재설정" },
  resetInvalid: {
    id: "reset-password-invalid",
    label: "재설정, 링크 무효",
  },
} as const satisfies Record<string, PageUxScenario>;

const DESIGN_AUTH_SCENARIOS: PageUxScenario[] = [
  LIVE,
  AUTH_SCENARIOS.login,
  AUTH_SCENARIOS.loginRegistered,
  AUTH_SCENARIOS.loginError,
  AUTH_SCENARIOS.signupSocial,
  AUTH_SCENARIOS.email,
  AUTH_SCENARIOS.code,
  AUTH_SCENARIOS.confirmed,
  AUTH_SCENARIOS.account,
  AUTH_SCENARIOS.forgot,
  AUTH_SCENARIOS.forgotSent,
  AUTH_SCENARIOS.reset,
  AUTH_SCENARIOS.resetInvalid,
];

export type PageUxSurface = {
  /** 기억/구분용. 실제 앱 경로·쿼리에 대응 (가짜 /team/desk 없음). */
  id: string;
  /** 관리자 미리보기 라벨 */
  label: string;
  scenarios: PageUxScenario[];
};

type SurfaceRule = PageUxSurface & {
  /** 더 구체적인 규칙이 앞에 오도록 나열. */
  match: (
    pathname: string,
    manage: string | null,
    cat: string | null,
  ) => boolean;
};

/**
 * 현 기능 화면 단위 UX 미리보기.
 * 목록 상태 + 그 페이지에서 뜨는 팝업/시트 + 로딩 애니메이션까지 포함.
 */
const SURFACE_RULES: SurfaceRule[] = [
  {
    id: "design.auth",
    label: "인증",
    scenarios: DESIGN_AUTH_SCENARIOS,
    match: (pathname, _manage, cat) =>
      pathname === "/design" && cat === "auth",
  },
  {
    id: "team.live",
    label: "팀 실시간 회의",
    scenarios: TEAM_MEETING_SETUP_SCENARIOS,
    match: (pathname) => pathname === "/team/live",
  },
  {
    id: "team.schedule",
    label: "팀 일정 만들기",
    scenarios: TEAM_MEETING_SETUP_SCENARIOS,
    match: (pathname) => pathname === "/team/schedule",
  },
  {
    id: "team.members",
    label: "팀 구성원",
    scenarios: TEAM_MEMBERS_SCENARIOS,
    match: (pathname, manage) => pathname === "/team" && manage === "members",
  },
  {
    id: "team.invite",
    label: "팀 초대",
    scenarios: TEAM_INVITE_SCENARIOS,
    match: (pathname, manage) => pathname === "/team" && manage === "invite",
  },
  {
    id: "team.records",
    label: "팀 기록 접근",
    scenarios: TEAM_RECORDS_SCENARIOS,
    match: (pathname, manage) => pathname === "/team" && manage === "records",
  },
  {
    id: "team.security",
    label: "팀 보안",
    scenarios: TEAM_SECURITY_SCENARIOS,
    match: (pathname, manage) => pathname === "/team" && manage === "security",
  },
  {
    id: "team",
    label: "팀",
    scenarios: TEAM_SCENARIOS,
    match: (pathname, manage) =>
      pathname === "/team" && (manage == null || manage === "announcements"),
  },
  {
    id: "meetings.new",
    label: "회의록 생성",
    scenarios: MEETING_CREATE_SCENARIOS,
    match: (pathname) =>
      pathname === "/meetings/new" || pathname.startsWith("/meetings/new/"),
  },
  {
    id: "dashboard",
    label: "회의",
    scenarios: DASHBOARD_SCENARIOS,
    match: (pathname) =>
      pathname === "/dashboard" || pathname === "/meetings",
  },
  {
    id: "vault",
    label: "보관함",
    scenarios: VAULT_SCENARIOS,
    match: (pathname) => pathname === "/vault",
  },
  {
    id: "plan",
    label: "플랜",
    scenarios: PLAN_SCENARIOS,
    match: (pathname) => pathname === "/plan",
  },
  {
    id: "changelog",
    label: "Changelog",
    scenarios: WITH_CHROME,
    match: (pathname) => pathname === "/changelog",
  },
  {
    id: "changelog.dev",
    label: "Changelog 개발",
    scenarios: LIST_SCENARIOS,
    match: (pathname) => pathname === "/changelog/dev",
  },
  {
    id: "help",
    label: "도움말",
    scenarios: WITH_CHROME,
    match: (pathname) => pathname === "/help",
  },
  {
    id: "settings",
    label: "시스템 설정",
    scenarios: [
      LIVE,
      POPUP.createTeamFirst,
      POPUP.teamSettingsOff,
      ...CHROME_POPUPS,
    ],
    match: (pathname) => pathname === "/settings",
  },
  {
    id: "audit",
    label: "감사 로그",
    scenarios: AUDIT_SCENARIOS,
    match: (pathname) =>
      pathname === "/audit" || pathname.startsWith("/audit/"),
  },
  {
    id: "users",
    label: "사용자",
    scenarios: ADMIN_LIST_SCENARIOS,
    match: (pathname) => pathname === "/users",
  },
  {
    id: "ai-usage",
    label: "통계",
    scenarios: ADMIN_LIST_SCENARIOS,
    match: (pathname) =>
      pathname === "/stats" ||
      pathname === "/ai-usage" ||
      pathname === "/pipeline-stats" ||
      pathname === "/survey-stats",
  },
];
const UNSUPPORTED: PageUxSurface = {
  id: "none",
  label: "",
  scenarios: [LIVE],
};

function manageFromSearch(search: string): string | null {
  if (!search) return null;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(raw).get("manage");
  return value && value.length > 0 ? value : null;
}

function catFromSearch(search: string): string | null {
  if (!search) return null;
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const value = new URLSearchParams(raw).get("cat");
  return value && value.length > 0 ? value : null;
}

/** pathname + ?manage= / ?cat= 기준 현재 화면. */
export function resolvePageUxSurface(
  pathname: string,
  search = "",
): PageUxSurface {
  const path = pathname.replace(/\/+$/, "") || "/";
  const manage = manageFromSearch(search);
  const cat = catFromSearch(search);
  for (const rule of SURFACE_RULES) {
    if (rule.match(path, manage, cat)) {
      return {
        id: rule.id,
        label: rule.label,
        scenarios: rule.scenarios,
      };
    }
  }
  return UNSUPPORTED;
}

export function pageUxPreviewSupported(surface: PageUxSurface): boolean {
  return surface.id !== "none" && surface.scenarios.length > 1;
}

export function isPageUxPopupScenario(scenarioId: string): boolean {
  return (
    scenarioId === "upload" ||
    scenarioId === "upload-busy" ||
    scenarioId === "upload-quota" ||
    scenarioId === "banner-alerts" ||
    scenarioId.startsWith("popup-")
  );
}

/** 로딩·진행 애니메이션이 재생되어야 하는 시나리오. */
export function isPageUxAnimScenario(scenarioId: string): boolean {
  return (
    scenarioId === "loading" ||
    scenarioId === "upload-busy" ||
    scenarioId === "popup-uploading" ||
    scenarioId === "popup-starting" ||
    scenarioId === "popup-start-ready" ||
    scenarioId === "popup-start-error" ||
    scenarioId === "anim-upload-flow" ||
    scenarioId === "anim-record-expand" ||
    scenarioId === "popup-recording" ||
    scenarioId === "popup-vault-picker-loading" ||
    scenarioId === "popup-invite-search" ||
    scenarioId === "anim-processing"
  );
}

export function isPageUxNotificationScenario(scenarioId: string): boolean {
  return scenarioId === "popup-notifications-expand";
}

/** 페이지 UX 시나리오 또는 디자인 랩 알림 씬 — 사이드바 알림 센터에 예시 고정. */
export function isNotificationChromePreview(options: {
  scenarioId: string;
  pathname: string;
  search?: string;
}): boolean {
  if (isPageUxNotificationScenario(options.scenarioId)) return true;
  if (options.pathname !== "/design") return false;
  const q = new URLSearchParams(
    (options.search ?? "").replace(/^\?/, ""),
  );
  return q.get("cat") === "popups" && q.get("scene") === "notifications";
}

export const DEFAULT_PAGE_UX_SCENARIOS = LIST_SCENARIOS;
export const PAGE_UX_LIVE_SCENARIO = LIVE;
export const PAGE_UX_POPUPS = POPUP;
export const PAGE_UX_AUTH_SCENARIOS = AUTH_SCENARIOS;
/** @deprecated PAGE_UX_AUTH_SCENARIOS 사용 */
export const PAGE_UX_AUTH_SIGNUP_VERIFY = AUTH_SCENARIOS;
