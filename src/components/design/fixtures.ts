import type { Meeting } from "@/types/meeting";

/** 디자인 랩·페이지 UX 픽스처. UI 마크업 없음. */

/** 대시보드 기록 목록 「제작 중」 시나리오 (`anim-processing`) */
export const FIXTURE_PROCESSING_MULTI = [
  {
    id: "design-mtg-structuring",
    title: "주간-마케팅-싱크",
    status: "structuring",
    phase: "structuring",
    progressPercent: 78,
    workspace: "personal",
    waiting: false,
    jobStatus: "running" as const,
  },
  {
    id: "design-mtg-transcribing",
    title: "신제품-출시-일정-조율",
    status: "transcribing",
    phase: "transcribing",
    progressPercent: 0,
    workspace: "personal",
    stageLabel: "잠시 기다리는 중이에요",
    waiting: true,
    jobStatus: "queued" as const,
    queueAhead: 1,
  },
  {
    id: "design-mtg-waiting-2",
    title: "고객지원-프로세스-개선",
    status: "transcribing",
    phase: "transcribing",
    progressPercent: 0,
    workspace: "personal",
    stageLabel: "잠시 기다리는 중이에요",
    waiting: true,
    jobStatus: "queued" as const,
    queueAhead: 2,
  },
];

export const FIXTURE_MEETING: Meeting = {
  id: "design-mtg-detail",
  title: "3분기 마케팅 캠페인 킥오프",
  tags: [],
  summaryTags: [],
  date: new Date().toISOString(),
  duration: "—",
  participants: [
    {
      id: "spk-voice",
      name: "발화",
      initials: "발",
      color: "bg-slate-500",
      isMember: false,
    },
  ],
  status: "in_progress",
  security: "protected",
  workspace: "personal",
  capture: "upload",
};

export const FIXTURE_MEETING_DONE: Meeting = {
  ...FIXTURE_MEETING,
  id: "design-mtg-done",
  status: "completed",
  duration: "42분",
  tags: ["캠페인", "일정"],
  summaryTags: ["캠페인", "일정"],
};
