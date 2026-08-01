import type { ProcessItem } from "@/lib/workspace-data";
import type { Meeting } from "@/types/meeting";

/** 디자인 랩 픽스처. UI 마크업 없음. */

export const FIXTURE_PROCESSING_TRANSCRIBING = [
  {
    id: "design-mtg-transcribing",
    title: "assembly2-envlabor-20250704",
    status: "transcribing",
    phase: "transcribing",
    progressPercent: 36,
    workspace: "personal",
  },
];

export const FIXTURE_PROCESSING_STRUCTURING = [
  {
    id: "design-mtg-structuring",
    title: "assembly2-envlabor-20250704",
    status: "structuring",
    phase: "structuring",
    progressPercent: 72,
    workspace: "personal",
  },
];

export const FIXTURE_PROCESSING_MULTI = [
  {
    id: "design-mtg-transcribing",
    title: "assembly2-envlabor-20250704",
    status: "transcribing",
    phase: "transcribing",
    progressPercent: 36,
    workspace: "personal",
  },
  {
    id: "design-mtg-structuring",
    title: "주간-보안-싱크",
    status: "structuring",
    phase: "structuring",
    progressPercent: 72,
    workspace: "personal",
  },
];

export const FIXTURE_ACTIVITY_ACTIVE: ProcessItem[] = [
  {
    id: "design-act-active",
    title: "assembly2-envlabor-20250704",
    status: "structuring",
    phase: "structuring",
    progressPercent: 72,
    detail: "정리하는 중이에요",
    time: "방금",
    href: "/meetings/design-act-active",
    workspace: "personal",
  },
];

export const FIXTURE_ACTIVITY_EMPTY: ProcessItem[] = [];

export const FIXTURE_ACTIVITY_ERROR: ProcessItem[] = [
  {
    id: "design-act-error",
    title: "assembly2-envlabor-20250704",
    status: "error",
    phase: "error",
    progressPercent: 40,
    detail: "보관함 파일을 찾을 수 없습니다.",
    time: "1분 전",
    href: "/meetings/design-act-error",
    workspace: "personal",
  },
  {
    id: "design-act-done",
    title: "주간 보안 싱크",
    status: "done",
    phase: "done",
    progressPercent: 100,
    detail: "완료",
    time: "어제",
    href: "/meetings/design-act-done",
    workspace: "personal",
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

export const FIXTURE_PARTICIPANTS: Meeting["participants"] = [
  {
    id: "p1",
    name: "김서연",
    initials: "김",
    color: "bg-sky-500",
    isMember: true,
    tags: ["디자인팀"],
  },
  {
    id: "p2",
    name: "최민준",
    initials: "최",
    color: "bg-emerald-500",
    isMember: true,
    tags: ["개발팀"],
  },
  {
    id: "p3",
    name: "이도현",
    initials: "이",
    color: "bg-amber-500",
    isMember: false,
    tags: ["기획팀"],
  },
  {
    id: "p4",
    name: "박지우",
    initials: "박",
    color: "bg-violet-500",
    isMember: true,
    tags: ["기획팀"],
  },
];
