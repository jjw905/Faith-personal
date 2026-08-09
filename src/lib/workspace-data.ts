import {
  dateLabelToIso,
  formatUpcomingDateLabel,
  formatUpcomingScheduleSummary,
  isoToUpcomingDateLabel,
  seoulDateKey,
} from "@/lib/meeting-date";
import type { MeetingPlatform } from "@/lib/meeting-platform";
import type { WorkspaceId } from "@/lib/workspaces";

/** 일반 일정 | 회의 일정(부가). */
export type ScheduleKind = "event" | "meeting";

export type UpcomingItem = {
  id: string;
  title: string;
  when: string;
  dateLabel: string;
  /** Asia/Seoul YYYY-MM-DD. 없으면 dateLabel에서 유도. */
  dateIso?: string;
  /** 없으면 meeting으로 간주 (localStorage 호환). */
  kind?: ScheduleKind;
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

export function scheduleKindOf(item: UpcomingItem): ScheduleKind {
  return item.kind === "event" ? "event" : "meeting";
}

export function scheduleIsoOf(
  item: UpcomingItem,
  now: Date = new Date(),
): string {
  if (item.dateIso && /^\d{4}-\d{2}-\d{2}$/.test(item.dateIso)) {
    return item.dateIso;
  }
  return dateLabelToIso(item.dateLabel, now) ?? seoulDateKey(now);
}

/** 저장·시드 항목을 kind/dateIso 포함 형태로 맞춤. */
export function normalizeUpcomingItem(
  item: UpcomingItem,
  now: Date = new Date(),
): UpcomingItem {
  const kind = scheduleKindOf(item);
  const dateIso = scheduleIsoOf(item, now);
  const dateLabel =
    item.dateLabel.trim() || isoToUpcomingDateLabel(dateIso, now);
  const timeLabel = item.timeLabel.trim() || "16:00";
  const duration = item.duration.trim() || "30분";
  return {
    ...item,
    kind,
    dateIso,
    dateLabel,
    timeLabel,
    duration,
    when:
      item.when.trim() ||
      formatUpcomingScheduleSummary(dateLabel, timeLabel, duration, now),
  };
}

type SeedTemplate = Omit<
  UpcomingItem,
  "dateLabel" | "dateIso" | "when" | "kind"
> & {
  dayOffset: number;
  kind: ScheduleKind;
};

const SEED_TEMPLATES: SeedTemplate[] = [
  {
    id: "up-1",
    title: "주간 마케팅 싱크",
    dayOffset: 0,
    kind: "meeting",
    timeLabel: "16:00",
    duration: "45분",
    location: "Google Meet",
    platform: "meet",
    organizer: "김서연",
    participants: ["김서연", "이준호", "박민재", "최지원"],
    agenda: [
      "지난주 캠페인 성과 리뷰",
      "이번 주 콘텐츠·광고 일정",
      "론칭 체크리스트 점검",
    ],
    notes:
      "발표 자료는 회의 전에 공유해 주세요. 회의록은 팀 워크스페이스에 자동 저장됩니다.",
    href: "/meetings/new",
    workspace: "team",
  },
  {
    id: "up-2",
    title: "한빛커머스 공동마케팅 킥오프",
    dayOffset: 1,
    kind: "meeting",
    timeLabel: "10:30",
    duration: "1시간",
    location: "Zoom",
    platform: "zoom",
    organizer: "박민재",
    participants: ["박민재", "김서연", "외부 파트너 2명"],
    agenda: [
      "공동 캠페인 목표와 일정 합의",
      "역할·비용 분담 확인",
      "주간 KPI 공유 방식",
    ],
    notes: "파트너 측 참석자 명단은 입장 전 확인해 주세요.",
    href: "/meetings/new",
    workspace: "team",
  },
  {
    id: "up-5",
    title: "고객지원 프로세스 점검",
    dayOffset: 3,
    kind: "meeting",
    timeLabel: "14:00",
    duration: "45분",
    location: "Zoom",
    platform: "zoom",
    organizer: "이준호",
    participants: ["이준호", "최지원", "정하늘"],
    agenda: [
      "티켓 분류·SLA 운영 현황",
      "핸드오프 오분류 사례",
      "교육·가이드 업데이트",
    ],
    notes:
      "결정 사항은 지원 가이드에 반영하고, 변경 이력은 팀 채널에 남깁니다.",
    href: "/meetings/new",
    workspace: "team",
  },
  {
    id: "up-6",
    title: "분기 회고",
    dayOffset: 5,
    kind: "meeting",
    timeLabel: "11:00",
    duration: "1시간 30분",
    location: "Google Meet",
    platform: "meet",
    organizer: "김서연",
    participants: ["김서연", "이준호", "박민재", "최지원", "정하늘", "한서연"],
    agenda: [
      "분기 KPI 및 이슈 회고",
      "다음 분기 우선순위",
      "개선 액션 아이템 배정",
    ],
    notes: "발표 자료는 전날 18시까지 공유해 주세요.",
    href: "/meetings/new",
    workspace: "team",
  },
  {
    id: "up-3",
    title: "이사회 보고 리허설",
    dayOffset: 0,
    kind: "meeting",
    timeLabel: "20:00",
    duration: "30분",
    location: "Discord",
    platform: "discord",
    organizer: "나",
    participants: ["나", "김동료", "이멘토", "박피드백"],
    agenda: ["보고 흐름 점검", "시간 배분 측정", "예상 질문 대비"],
    notes:
      "개인 워크스페이스에만 저장됩니다. 필요 시 팀으로 복사할 수 있습니다.",
    href: "/meetings/new",
    workspace: "personal",
  },
  {
    id: "up-8",
    title: "자료 정리·메일 회신",
    dayOffset: 0,
    kind: "event",
    timeLabel: "11:00",
    duration: "45분",
    location: "",
    platform: "custom",
    organizer: "나",
    participants: ["나"],
    agenda: [],
    notes: "오전에 미처리 메일과 공유 폴더만 정리합니다.",
    href: "/meetings/new",
    workspace: "personal",
  },
  {
    id: "up-4",
    title: "메모용 짧은 녹음",
    dayOffset: 1,
    kind: "meeting",
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
    id: "up-9",
    title: "도서관 반납",
    dayOffset: 2,
    kind: "event",
    timeLabel: "18:00",
    duration: "30분",
    location: "",
    platform: "custom",
    organizer: "나",
    participants: ["나"],
    agenda: [],
    notes: "대출 만기 도서 반납.",
    href: "/meetings/new",
    workspace: "personal",
  },
  {
    id: "up-7",
    title: "주간 개인 리뷰",
    dayOffset: 4,
    kind: "meeting",
    timeLabel: "18:30",
    duration: "30분",
    location: "Google Meet",
    platform: "meet",
    organizer: "나",
    participants: [
      "나",
      "김동료",
      "이멘토",
      "박피드백",
      "최리뷰",
      "정운영",
      "한기획",
    ],
    agenda: ["이번 주 완료 항목", "막힌 이슈", "다음 주 우선순위"],
    notes: "동료·멘토와 함께 진행하는 점검 회의입니다.",
    href: "/meetings/new",
    workspace: "personal",
  },
  {
    id: "up-10",
    title: "운동·스트레칭",
    dayOffset: 4,
    kind: "event",
    timeLabel: "07:30",
    duration: "40분",
    location: "",
    platform: "custom",
    organizer: "나",
    participants: ["나"],
    agenda: [],
    notes: "",
    href: "/meetings/new",
    workspace: "personal",
  },
];

function materializeSeed(
  template: SeedTemplate,
  now: Date = new Date(),
): UpcomingItem {
  const dateLabel = formatUpcomingDateLabel(template.dayOffset, now);
  const dateIso = dateLabelToIso(dateLabel, now) ?? seoulDateKey(now);
  return normalizeUpcomingItem(
    {
      ...template,
      dateLabel,
      dateIso,
      when: formatUpcomingScheduleSummary(
        dateLabel,
        template.timeLabel,
        template.duration,
        now,
      ),
    },
    now,
  );
}

/** 예정 회의 참석자/주최 빠른 선택용 디렉터리 (목 데이터). */
export type WorkspacePerson = {
  name: string;
  initials: string;
  color: string;
};

export const WORKSPACE_PEOPLE: WorkspacePerson[] = [
  { name: "김서연", initials: "김", color: "bg-teal-600" },
  { name: "이준호", initials: "이", color: "bg-violet-600" },
  { name: "박민재", initials: "박", color: "bg-sky-600" },
  { name: "최지원", initials: "최", color: "bg-amber-600" },
  { name: "정하늘", initials: "정", color: "bg-rose-600" },
  { name: "한서연", initials: "한", color: "bg-indigo-600" },
  { name: "나", initials: "나", color: "bg-slate-600" },
];

/** 개인 워크스페이스용 장소 빠른 선택. 팀 회의는 온라인만 지원. */
export const PLACE_PRESETS = ["모바일 녹음"] as const;

/** 팀 워크스페이스 온라인 위치 표시용. */
export const TEAM_ONLINE_LOCATION_PRESETS = [
  "Google Meet",
  "Zoom",
  "Discord",
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
  for (let i = 0; i < name.length; i += 1)
    hash = (hash + name.charCodeAt(i)) % palette.length;
  return {
    name,
    initials,
    color: palette[hash] ?? "bg-slate-600",
  };
}

export function getUpcomingByWorkspace(
  workspaceId: WorkspaceId,
  now: Date = new Date(),
): UpcomingItem[] {
  return SEED_TEMPLATES.filter((item) => item.workspace === workspaceId).map(
    (item) => materializeSeed(item, now),
  );
}

export function getUpcomingById(
  id: string,
  now: Date = new Date(),
): UpcomingItem | undefined {
  const found = SEED_TEMPLATES.find((item) => item.id === id);
  return found ? materializeSeed(found, now) : undefined;
}

/** 일정 추가용 초안 (로컬 상태용). */
export function createUpcomingDraft(
  workspaceId: WorkspaceId,
  organizer: string,
  options?: {
    kind?: ScheduleKind;
    dateIso?: string;
  },
): UpcomingItem {
  const host = organizer.trim() || "나";
  const kind = options?.kind ?? "meeting";
  const dateIso = options?.dateIso ?? seoulDateKey();
  const dateLabel = isoToUpcomingDateLabel(dateIso);
  const timeLabel = "16:00";
  const duration = "30분";
  return normalizeUpcomingItem({
    id: `up-${Date.now()}`,
    title: "",
    when: formatUpcomingScheduleSummary(dateLabel, timeLabel, duration),
    dateLabel,
    dateIso,
    kind,
    timeLabel,
    duration,
    location: kind === "meeting" ? "Google Meet" : "",
    platform: kind === "meeting" ? "meet" : "custom",
    organizer: host,
    participants: kind === "meeting" ? [host] : [host],
    agenda: [],
    notes: "",
    href: "/meetings/new",
    workspace: workspaceId,
  });
}
