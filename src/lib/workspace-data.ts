import type { MeetingPlatform } from "@/lib/meeting-platform";
import type { WorkspaceId } from "@/lib/workspaces";

export type UpcomingItem = {
  id: string;
  title: string;
  when: string;
  dateLabel: string;
  timeLabel: string;
  duration: string;
  location: string;
  /** 화상 플랫폼. 없으면 location 문자열로 추정. */
  platform?: MeetingPlatform;
  organizer: string;
  participants: string[];
  agenda: string[];
  notes: string;
  href: string;
  workspace: WorkspaceId;
};

export type ProcessStatus = "masking" | "transcribing" | "done";

export type ProcessItem = {
  id: string;
  title: string;
  status: ProcessStatus;
  detail: string;
  time: string;
  href: string;
  workspace: WorkspaceId;
};

const UPCOMING: UpcomingItem[] = [
  {
    id: "up-1",
    title: "주간 보안 싱크",
    when: "오늘 16:00, 40분",
    dateLabel: "오늘",
    timeLabel: "16:00",
    duration: "40분",
    location: "Google Meet",
    platform: "meet",
    organizer: "김보안",
    participants: ["김보안", "이정책", "박감사", "최개발"],
    agenda: [
      "지난주 마스킹 오탐 리뷰",
      "접근 로그 이상 징후 공유",
      "다음 주 감사 대응 체크리스트",
    ],
    notes: "외부 자료는 공유 전 마스킹 검수 필수. 회의록은 팀 워크스페이스에 자동 저장됩니다.",
    href: "/meetings/new",
    workspace: "team",
  },
  {
    id: "up-2",
    title: "외부 파트너 킥오프",
    when: "내일 10:30, 1시간",
    dateLabel: "내일",
    timeLabel: "10:30",
    duration: "1시간",
    location: "본사 3층 미팅룸 B",
    platform: "custom",
    organizer: "박감사",
    participants: ["박감사", "김보안", "외부 파트너 2명"],
    agenda: [
      "프로젝트 범위와 일정 합의",
      "개인정보 처리 원칙 안내",
      "공동 작업 채널/권한 설정",
    ],
    notes: "파트너 측 참석자 명단은 입장 전 확인. 민감 데모는 마스킹된 샘플만 사용합니다.",
    href: "/meetings/new",
    workspace: "team",
  },
  {
    id: "up-5",
    title: "접근 권한 점검 회의",
    when: "수요일 14:00, 45분",
    dateLabel: "수요일",
    timeLabel: "14:00",
    duration: "45분",
    location: "Zoom",
    platform: "zoom",
    organizer: "이정책",
    participants: ["이정책", "최개발", "정운영"],
    agenda: [
      "역할별 권한 매트릭스 검토",
      "퇴사자 계정 정리 현황",
      "감사 로그 보관 주기 확인",
    ],
    notes: "결정 사항은 사용자 관리 메뉴에 반영하고, 변경 이력은 감사 로그에 남깁니다.",
    href: "/meetings/new",
    workspace: "team",
  },
  {
    id: "up-6",
    title: "분기 회고",
    when: "금요일 11:00, 1시간 30분",
    dateLabel: "금요일",
    timeLabel: "11:00",
    duration: "1시간 30분",
    location: "본사 2층 대회의실",
    platform: "custom",
    organizer: "김보안",
    participants: ["김보안", "이정책", "박감사", "최개발", "정운영", "한기획"],
    agenda: [
      "분기 KPI 및 이슈 회고",
      "다음 분기 우선순위",
      "개선 액션 아이템 배정",
    ],
    notes: "발표 자료는 전날 18시까지 공유. 개인 성과 언급 시 민감정보는 제외합니다.",
    href: "/meetings/new",
    workspace: "team",
  },
  {
    id: "up-3",
    title: "발표 연습 리허설",
    when: "오늘 20:00, 30분",
    dateLabel: "오늘",
    timeLabel: "20:00",
    duration: "30분",
    location: "Discord",
    platform: "discord",
    organizer: "나",
    participants: ["나"],
    agenda: ["발표 흐름 점검", "시간 배분 측정", "질문 대비 메모"],
    notes: "개인 워크스페이스에만 저장됩니다. 필요 시 팀으로 복사할 수 있습니다.",
    href: "/meetings/new",
    workspace: "personal",
  },
  {
    id: "up-4",
    title: "메모용 짧은 녹음",
    when: "내일 09:00, 15분",
    dateLabel: "내일",
    timeLabel: "09:00",
    duration: "15분",
    location: "모바일 녹음",
    platform: "custom",
    organizer: "나",
    participants: ["나"],
    agenda: ["아이디어 메모", "할 일 정리"],
    notes: "짧은 음성 메모용입니다. 종료 후 자동 요약만 생성합니다.",
    href: "/meetings/new",
    workspace: "personal",
  },
  {
    id: "up-7",
    title: "주간 개인 리뷰",
    when: "목요일 18:30, 25분",
    dateLabel: "목요일",
    timeLabel: "18:30",
    duration: "25분",
    location: "Google Meet",
    platform: "meet",
    organizer: "나",
    participants: ["나"],
    agenda: ["이번 주 완료 항목", "막힌 이슈", "다음 주 우선순위"],
    notes: "혼자 진행하는 점검 회의입니다. 마스킹은 기본 규칙만 적용됩니다.",
    href: "/meetings/new",
    workspace: "personal",
  },
];

const PROCESSING: ProcessItem[] = [
  {
    id: "pr-1",
    title: "Q3 보안 정책 검토.wav",
    status: "masking",
    detail: "안건, 개인정보 후보 검수",
    time: "방금",
    href: "/meetings/mtg-001",
    workspace: "team",
  },
  {
    id: "pr-2",
    title: "RBAC 개편 회의 녹음",
    status: "transcribing",
    detail: "논의 구간 받아쓰기 62%",
    time: "3분 전",
    href: "/meetings/mtg-003",
    workspace: "team",
  },
  {
    id: "pr-3",
    title: "발표 연습 녹음",
    status: "masking",
    detail: "피드백, 개인정보 후보 검수",
    time: "방금",
    href: "/meetings/mtg-006",
    workspace: "personal",
  },
  {
    id: "pr-4",
    title: "마스킹 규칙 혼자 점검",
    status: "done",
    detail: "논의, 미결, 예외",
    time: "오늘 11:20",
    href: "/meetings/mtg-002",
    workspace: "personal",
  },
  {
    id: "pr-5",
    title: "주간 팀 스탠드업",
    status: "done",
    detail: "블로커, 후속, 일정",
    time: "어제",
    href: "/meetings/mtg-004",
    workspace: "team",
  },
];

/** 예정 회의 참석자/주최 빠른 선택용 디렉터리 (목 데이터). */
export type WorkspacePerson = {
  name: string;
  initials: string;
  color: string;
};

export const WORKSPACE_PEOPLE: WorkspacePerson[] = [
  { name: "김보안", initials: "김", color: "bg-teal-600" },
  { name: "이정책", initials: "이", color: "bg-violet-600" },
  { name: "박감사", initials: "박", color: "bg-sky-600" },
  { name: "최개발", initials: "최", color: "bg-amber-600" },
  { name: "정운영", initials: "정", color: "bg-rose-600" },
  { name: "한기획", initials: "한", color: "bg-indigo-600" },
  { name: "나", initials: "나", color: "bg-slate-600" },
];

/** 오프라인/기타 장소 빠른 선택. */
export const PLACE_PRESETS = [
  "본사 3층 미팅룸 B",
  "본사 2층 대회의실",
  "모바일 녹음",
] as const;

export function resolveWorkspacePerson(name: string): WorkspacePerson {
  const found = WORKSPACE_PEOPLE.find((p) => p.name === name);
  if (found) return found;
  const initials = name.trim().slice(0, 1) || "?";
  const palette = [
    "bg-teal-600",
    "bg-violet-600",
    "bg-sky-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-indigo-600",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash + name.charCodeAt(i)) % palette.length;
  return {
    name,
    initials,
    color: palette[hash] ?? "bg-slate-600",
  };
}

export function getUpcomingByWorkspace(workspaceId: WorkspaceId): UpcomingItem[] {
  return UPCOMING.filter((item) => item.workspace === workspaceId);
}

export function getUpcomingById(id: string): UpcomingItem | undefined {
  return UPCOMING.find((item) => item.id === id);
}

export function getProcessingByWorkspace(
  workspaceId: WorkspaceId,
): ProcessItem[] {
  return PROCESSING.filter((item) => item.workspace === workspaceId);
}
