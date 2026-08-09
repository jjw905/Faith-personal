export type WorkspaceId = "personal" | "team";

export type Workspace = {
  id: WorkspaceId;
  title: string;
  subtitle: string;
};

/** M3 컨텍스트 스위치용 카피·밀도 프로필. UI는 이 값만 참조한다. */
export type WorkspaceProfile = Workspace & {
  /** 헤딩 headline */
  meetingHeadline: string;
  ctaStart: string;
  ctaUpload: string;
  upcomingTitle: string;
  upcomingEmpty: string;
  upcomingAddLabel: string;
  recordsTitle: string;
  recordsEmpty: string;
  searchPlaceholder: string;
  /** 사이드바 들여쓰기 메뉴 라벨 */
  settingsNavTitle: string;
  /** 설정 페이지 제목 */
  settingsTitle: string;
  settingsDescription: string;
};

const PROFILES: Record<WorkspaceId, WorkspaceProfile> = {
  team: {
    id: "team",
    title: "팀",
    subtitle: "공유 회의, 권한 공간",
    meetingHeadline: "팀 회의",
    ctaStart: "팀 회의 시작",
    ctaUpload: "파일 업로드",
    upcomingTitle: "예정 회의",
    upcomingEmpty: "공유할 예정 회의가 없습니다.",
    upcomingAddLabel: "예정 회의 추가",
    recordsTitle: "회의 기록",
    recordsEmpty: "이 기간에 해당하는 팀 회의 기록이 없습니다.",
    searchPlaceholder: "회의, 참석자 검색",
    settingsNavTitle: "팀 설정",
    settingsTitle: "팀 설정",
    settingsDescription:
      "구성원, 보안, 기록 접근 등 팀 운영 설정을 관리합니다.",
  },
  personal: {
    id: "personal",
    title: "개인",
    subtitle: "개인 회의 공간",
    meetingHeadline: "개인 회의",
    ctaStart: "새 회의 시작",
    ctaUpload: "파일 올리기",
    upcomingTitle: "일정",
    upcomingEmpty: "잡혀 있는 개인 일정이 없습니다.",
    upcomingAddLabel: "일정 추가",
    recordsTitle: "기록",
    recordsEmpty: "이 기간에 해당하는 기록이 없습니다.",
    searchPlaceholder: "일정, 회의 검색",
    settingsNavTitle: "개인 설정",
    settingsTitle: "개인 설정",
    settingsDescription:
      "개인 기록에 적용할 마스킹, 요약 등 기본 설정을 관리합니다.",
  },
};

export const WORKSPACES: Workspace[] = [
  PROFILES.team,
  PROFILES.personal,
];

export function getWorkspaceProfile(id: WorkspaceId): WorkspaceProfile {
  return PROFILES[id];
}
