import type { Meeting } from "@/types/meeting";

/** 디자인 랩·페이지 UX 픽스처. UI 마크업 없음. */

/** 대시보드 기록 목록 「제작 중」 시나리오 (`anim-processing`) */
export const FIXTURE_PROCESSING_MULTI = [
  {
    id: "design-mtg-structuring",
    title: "주간-보안-싱크",
    status: "structuring",
    phase: "structuring",
    progressPercent: 78,
    workspace: "personal",
    waiting: false,
    jobStatus: "running" as const,
  },
  {
    id: "design-mtg-transcribing",
    title: "assembly2-envlabor-20250704",
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
    title: "brief-ailab (1)",
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
  title: "assembly2-envlabor-20250704",
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
  tags: ["예산", "심사"],
  summaryTags: ["예산", "심사"],
};
