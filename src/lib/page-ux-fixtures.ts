import { guessVaultMime } from "@/lib/vault-file-icon";
import type { DevChangelogState } from "@/lib/changelog-store";
import { defaultNotificationExamples } from "@/lib/notification-examples";
import type { PipelineStatsSummary } from "@/lib/stt/pipeline-stats-store";
import type { SurveyStatsSummary } from "@/lib/stt/survey-stats";
import type { AiUsageSummary } from "@/lib/stt/usage-store";
import type { VaultItemMeta, VaultUsage } from "@/lib/vault";
import { VAULT_QUOTA_BYTES } from "@/lib/vault";
import type { WorkspaceId } from "@/lib/workspaces";
import type { Meeting } from "@/types/meeting";
import type { AppNotification } from "@/types/notification";

export type FixtureTeamChatMessage = {
  id: string;
  body: string;
  attachmentType: "vault_file" | "team_meeting" | null;
  vaultFileId: string | null;
  teamMeetingId: string | null;
  attachmentMeta: {
    name?: string;
    size?: number;
    mime?: string;
    title?: string;
    state?: string;
    endedAt?: string | null;
  } | null;
  createdAt: string;
  author: {
    id: string;
    name: string | null;
    handle: string | null;
    image: string | null;
  };
};

/** 관리자 팀 목록 UX용 운영 메타 (본문·정책 제외). */
export type FixtureAdminTeam = {
  id: string;
  name: string;
  slug: string;
  plan: "TEAM";
  seatLimit: number;
  memberCount: number;
  adminCount: number;
  pendingInviteCount: number;
  meetingCount: number;
  lastMeetingAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: {
    id: string;
    name: string | null;
    handle: string | null;
    email: string | null;
    disabled: boolean;
  };
  managers: {
    id: string;
    role: "OWNER" | "ADMIN";
    name: string | null;
    handle: string | null;
    email: string | null;
    disabled: boolean;
  }[];
  pendingInvites: {
    email: string | null;
    name: string | null;
    handle: string | null;
  }[];
};

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

/** 같은 날 여러 파일을 시각·용량으로 구분할 수 있게 시각을 어긋낸다. */
function hoursAgoIso(hours: number) {
  return new Date(Date.now() - hours * 3600000).toISOString();
}

let cachedVaultItemsFull: VaultItemMeta[] | null = null;
let cachedAiUsageFull: AiUsageSummary | null = null;
const cachedMeetingsFull = new Map<string, Meeting[]>();

/**
 * UX 미리보기: 보관함 가득 찬 목록.
 * 앞쪽은 오늘/어제에 여러 개를 모아 같은 날짜 그룹을 재현한다.
 */
export function fixtureVaultItemsFull(): VaultItemMeta[] {
  if (cachedVaultItemsFull) return cachedVaultItemsFull;
  const names = [
    "주간회의-녹음.m4a",
    "보안검토.pdf",
    "예산안.docx",
    "현장사진.jpg",
    "발표자료.pptx",
    "계약서-초안.hwp",
    "음성메모.wav",
    "스크린샷.png",
    "일정표.xlsx",
    "회의요약.txt",
    "고객문의.webm",
    "로고.webp",
    "인터뷰.mp3",
    "기획서.docx",
    "첨부-스캔.pdf",
    "팀사진.heic",
    "데모영상.webm",
    "체크리스트.txt",
    "견적서.xlsx",
    "브리핑.pptx",
    "메모-추가.txt",
    "참고자료.pdf",
    "녹취2.m4a",
    "포스터.png",
  ];
  /** 오늘 4, 어제 3, 이후 하루씩 분산. */
  const hourOffsets = [
    1, 3, 5, 8, 26, 30, 34, 50, 74, 98, 122, 146, 170, 194, 218, 242, 266,
    290, 314, 338, 362, 386, 410, 434,
  ];
  cachedVaultItemsFull = names.map((name, index) => ({
    id: `ux-vault-${index + 1}`,
    name,
    size: 120_000 + index * 85_000,
    mime: guessVaultMime(name),
    createdAt: hoursAgoIso(hourOffsets[index] ?? index * 24 + 1),
    purpose: "VAULT" as const,
  }));
  return cachedVaultItemsFull;
}

export function fixtureVaultUsage(
  kind: "empty" | "full" | "tight" | "maxed",
): VaultUsage {
  if (kind === "empty") {
    return {
      used: 0,
      quota: VAULT_QUOTA_BYTES,
      remaining: VAULT_QUOTA_BYTES,
      count: 0,
    };
  }
  if (kind === "tight") {
    const used = Math.round(VAULT_QUOTA_BYTES * 0.93);
    return {
      used,
      quota: VAULT_QUOTA_BYTES,
      remaining: Math.max(0, VAULT_QUOTA_BYTES - used),
      count: 18,
    };
  }
  if (kind === "maxed") {
    return {
      used: VAULT_QUOTA_BYTES,
      quota: VAULT_QUOTA_BYTES,
      remaining: 0,
      count: 24,
    };
  }
  const used = Math.round(VAULT_QUOTA_BYTES * 0.72);
  return {
    used,
    quota: VAULT_QUOTA_BYTES,
    remaining: Math.max(0, VAULT_QUOTA_BYTES - used),
    count: 24,
  };
}

/** UX 미리보기: 회의 기록 채워짐. */
export function fixtureMeetingsFull(
  workspace: WorkspaceId = "personal",
): Meeting[] {
  const hit = cachedMeetingsFull.get(workspace);
  if (hit) return hit;
  const titles = [
    "주간 마케팅 싱크",
    "제품 로드맵 리뷰",
    "고객 인터뷰 정리",
    "스프린트 계획",
    "법무 검토 회의",
    "디자인 크리틱",
    "운영 이슈 공유",
    "온보딩 피드백",
    "분기 목표 점검",
    "파트너 미팅",
    "내부 교육",
    "출시 준비",
  ];
  const list = titles.map((title, index) => ({
    id: `ux-mtg-${index + 1}`,
    title,
    tags: index % 2 === 0 ? ["마케팅", "일정"] : ["제품"],
    summaryTags: index % 2 === 0 ? ["마케팅", "일정"] : ["제품"],
    date: daysAgoIso(index),
    duration: `${20 + (index % 5) * 8}분`,
    participants: [
      {
        id: `ux-p-${index}-1`,
        name: "김서연",
        initials: "김",
        color: "bg-sky-500",
        isMember: true,
      },
      {
        id: `ux-p-${index}-2`,
        name: "최민준",
        initials: "최",
        color: "bg-emerald-500",
        isMember: true,
      },
    ],
    status: "completed" as const,
    security: "protected" as const,
    workspace,
    capture: index % 3 === 0 ? ("live" as const) : ("upload" as const),
  }));
  cachedMeetingsFull.set(workspace, list);
  return list;
}

export function fixtureAiUsageEmpty(): AiUsageSummary {
  return {
    totalUsd: 0,
    sttUsd: 0,
    structureUsd: 0,
    totalKrw: 0,
    sttKrw: 0,
    structureKrw: 0,
    fx: null,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    eventCount: 0,
    meetingCount: 0,
    audioMinutes: 0,
    byDay: [],
    byModel: [],
    byUser: [],
    recent: [],
  };
}

/** UX 미리보기: AI 사용량 채워짐 (긴 목록/더 보기 검수용). */
export function fixtureAiUsageFull(): AiUsageSummary {
  if (cachedAiUsageFull) return cachedAiUsageFull;
  const usdKrw = 1380;
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = daysAgoIso(index).slice(0, 10);
    const sttUsd = 0.42 + index * 0.05;
    const structureUsd = 0.18 + index * 0.02;
    return {
      date,
      sttUsd,
      structureUsd,
      totalUsd: sttUsd + structureUsd,
      sttKrw: sttUsd * usdKrw,
      structureKrw: structureUsd * usdKrw,
      totalKrw: (sttUsd + structureUsd) * usdKrw,
      usdKrw,
      inputTokens: 18_000 + index * 1200,
      outputTokens: 4_200 + index * 280,
      totalTokens: 22_200 + index * 1480,
      audioSec: 900 + index * 120,
      jobs: 3 + (index % 4),
    };
  });
  const totalUsd = days.reduce((sum, d) => sum + d.totalUsd, 0);
  const sttUsd = days.reduce((sum, d) => sum + d.sttUsd, 0);
  const structureUsd = days.reduce((sum, d) => sum + d.structureUsd, 0);
  const userWeights = [
    0.18, 0.14, 0.11, 0.09, 0.08, 0.07, 0.06, 0.05, 0.05, 0.04, 0.04, 0.03,
    0.03, 0.03,
  ];
  const byUser = userWeights.map((weight, index) => {
    const usd = totalUsd * weight;
    return {
      userId: `ux-user-${index + 1}`,
      usd,
      krw: usd * usdKrw,
      tokens: Math.round(184_000 * weight),
      jobs: Math.max(2, Math.round(48 * weight)),
      meetingCount: Math.max(1, Math.round(16 * weight)),
      audioSec: Math.round(21_600 * weight),
    };
  });
  const modelRows = [
    {
      model: "gpt-4o-transcribe",
      stage: "stt" as const,
      share: 0.42,
      tokens: 120_000,
      count: 28,
    },
    {
      model: "gpt-4o-mini-transcribe",
      stage: "stt" as const,
      share: 0.12,
      tokens: 36_000,
      count: 10,
    },
    {
      model: "gpt-4.1-mini",
      stage: "structure" as const,
      share: 0.22,
      tokens: 64_000,
      count: 20,
    },
    {
      model: "gpt-4.1",
      stage: "structure" as const,
      share: 0.1,
      tokens: 28_000,
      count: 8,
    },
    {
      model: "gpt-4o",
      stage: "structure" as const,
      share: 0.08,
      tokens: 22_000,
      count: 6,
    },
    {
      model: "o4-mini",
      stage: "structure" as const,
      share: 0.06,
      tokens: 18_000,
      count: 5,
    },
  ];
  cachedAiUsageFull = {
    totalUsd,
    sttUsd,
    structureUsd,
    totalKrw: totalUsd * usdKrw,
    sttKrw: sttUsd * usdKrw,
    structureKrw: structureUsd * usdKrw,
    fx: {
      latestRate: usdKrw,
      latestAsOf: daysAgoIso(0),
      source: "ux-preview",
    },
    inputTokens: days.reduce((sum, d) => sum + d.inputTokens, 0),
    outputTokens: days.reduce((sum, d) => sum + d.outputTokens, 0),
    totalTokens: days.reduce((sum, d) => sum + d.totalTokens, 0),
    eventCount: 40,
    meetingCount: 16,
    audioMinutes: Math.round(
      days.reduce((sum, d) => sum + d.audioSec, 0) / 60,
    ),
    byDay: days,
    byModel: modelRows.map((row) => {
      const usd = totalUsd * row.share;
      return {
        model: row.model,
        stage: row.stage,
        usd,
        krw: usd * usdKrw,
        tokens: row.tokens,
        count: row.count,
      };
    }),
    byUser,
    recent: Array.from({ length: 40 }, (_, index) => {
      const inputTokens = 2_000 + index * 100;
      const outputTokens = 400 + index * 20;
      const userIndex = (index % byUser.length) + 1;
      return {
        id: `ux-ai-${index + 1}`,
        at: daysAgoIso(index % 14),
        userId: `ux-user-${userIndex}`,
        meetingId: `ux-mtg-${(index % 12) + 1}`,
        title: `미리보기 작업 ${index + 1}`,
        stage: index % 3 === 0 ? ("stt" as const) : ("structure" as const),
        model:
          index % 3 === 0
            ? index % 6 === 0
              ? "gpt-4o-mini-transcribe"
              : "gpt-4o-transcribe"
            : modelRows[2 + (index % 4)].model,
        estimatedUsd: 0.12 + index * 0.01,
        estimatedKrw: (0.12 + index * 0.01) * usdKrw,
        usdKrw,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        billSource: "tokens" as const,
      };
    }),
  };
  return cachedAiUsageFull;
}

export function fixtureDevChangelogEmpty(): DevChangelogState {
  return {
    agenda: { date: daysAgoIso(0).slice(0, 10), items: [] },
    entries: [],
  };
}

export function fixtureDevChangelogFull(
  seed: DevChangelogState,
): DevChangelogState {
  if (seed.entries.length > 0 || seed.agenda.items.length > 0) return seed;
  return {
    agenda: {
      date: daysAgoIso(0).slice(0, 10),
      items: [
        { label: "보관함 업로드 검증", done: true },
        { label: "팀 권한 미리보기", done: false },
        { label: "AI 사용량 빈 상태", done: false },
      ],
    },
    entries: [
      {
        version: "0.9.2",
        date: daysAgoIso(1).slice(0, 10),
        title: "UX 미리보기",
        summary: "빈 상태와 채워진 상태 점검",
        sections: [
          {
            title: "개선",
            items: ["UX 미리보기 시나리오 추가", "보관함 용량 안내 강화"],
          },
        ],
      },
      {
        version: "0.9.1",
        date: daysAgoIso(4).slice(0, 10),
        title: "도움말",
        summary: "빈 문서 상태",
        sections: [
          {
            title: "수정",
            items: ["도움말 빈 문서 상태 표시"],
          },
        ],
      },
    ],
  };
}

/**
 * 알림 UX 미리보기 (클릭 펼침).
 * 왼쪽 메뉴 알림 센터와 동일 예시 — `defaultNotificationExamples`.
 */
export function fixtureNotificationsExpand(): AppNotification[] {
  return defaultNotificationExamples();
}

const ADMIN_TEAM_FIXTURE_SEED: Omit<
  FixtureAdminTeam,
  | "id"
  | "slug"
  | "plan"
  | "createdAt"
  | "updatedAt"
  | "lastMeetingAt"
  | "managers"
  | "pendingInvites"
>[] = [
  {
    name: "제품기획팀",
    seatLimit: 10,
    memberCount: 7,
    adminCount: 2,
    pendingInviteCount: 1,
    meetingCount: 24,
    owner: {
      id: "ux-owner-plan",
      name: "김기획",
      handle: "plan-kim",
      email: "plan@example.com",
      disabled: false,
    },
  },
  {
    name: "보안운영팀",
    seatLimit: 5,
    memberCount: 5,
    adminCount: 1,
    pendingInviteCount: 0,
    meetingCount: 12,
    owner: {
      id: "ux-owner-sec",
      name: "이보안",
      handle: "sec-lee",
      email: "sec@example.com",
      disabled: false,
    },
  },
  {
    name: "스타트업팀",
    seatLimit: 2,
    memberCount: 1,
    adminCount: 1,
    pendingInviteCount: 2,
    meetingCount: 0,
    owner: {
      id: "ux-owner-start",
      name: "박스타",
      handle: "startup",
      email: "start@example.com",
      disabled: false,
    },
  },
  {
    name: "정지대표팀",
    seatLimit: 8,
    memberCount: 3,
    adminCount: 1,
    pendingInviteCount: 0,
    meetingCount: 5,
    owner: {
      id: "ux-owner-paused",
      name: "최정지",
      handle: "paused-choi",
      email: "paused@example.com",
      disabled: true,
    },
  },
  {
    name: "성장마케팅",
    seatLimit: 15,
    memberCount: 11,
    adminCount: 3,
    pendingInviteCount: 4,
    meetingCount: 48,
    owner: {
      id: "ux-owner-mkt",
      name: "정성장",
      handle: "growth",
      email: "growth@example.com",
      disabled: false,
    },
  },
  {
    name: "고객성공",
    seatLimit: 6,
    memberCount: 4,
    adminCount: 2,
    pendingInviteCount: 0,
    meetingCount: 9,
    owner: {
      id: "ux-owner-cs",
      name: "한성공",
      handle: "cs-han",
      email: "cs@example.com",
      disabled: false,
    },
  },
  {
    name: "연구개발",
    seatLimit: 20,
    memberCount: 18,
    adminCount: 4,
    pendingInviteCount: 1,
    meetingCount: 61,
    owner: {
      id: "ux-owner-rd",
      name: "오연구",
      handle: "rd-oh",
      email: "rd@example.com",
      disabled: false,
    },
  },
  {
    name: "신규온보딩",
    seatLimit: 3,
    memberCount: 2,
    adminCount: 1,
    pendingInviteCount: 3,
    meetingCount: 1,
    owner: {
      id: "ux-owner-onb",
      name: "윤온보",
      handle: "onboard",
      email: "onboard@example.com",
      disabled: false,
    },
  },
  {
    name: "파트너얼라이언스",
    seatLimit: 12,
    memberCount: 6,
    adminCount: 2,
    pendingInviteCount: 0,
    meetingCount: 15,
    owner: {
      id: "ux-owner-pt",
      name: "서파트너",
      handle: "partner",
      email: "partner@example.com",
      disabled: false,
    },
  },
];

/** UX: 관리자 팀 목록 비움 */
export function fixtureAdminTeamsEmpty(): FixtureAdminTeam[] {
  return [];
}

/** UX: 관리자 팀 목록 채워짐 (운영 메타만, count개) */
export function fixtureAdminTeamsFull(count = 2): FixtureAdminTeam[] {
  const n = Math.max(1, count);
  return Array.from({ length: n }, (_, i) => {
    const seed = ADMIN_TEAM_FIXTURE_SEED[i % ADMIN_TEAM_FIXTURE_SEED.length]!;
    const day = i + 1;
    const ownerId = `${seed.owner.id}-${i + 1}`;
    const managers: FixtureAdminTeam["managers"] = [
      {
        id: ownerId,
        role: "OWNER",
        name: seed.owner.name,
        handle: seed.owner.handle,
        email: seed.owner.email,
        disabled: seed.owner.disabled,
      },
    ];
    if (seed.adminCount > 1) {
      managers.push({
        id: `ux-admin-${i + 1}`,
        role: "ADMIN",
        name: `팀장 ${i + 1}`,
        handle: `lead${i + 1}`,
        email: `lead${i + 1}@example.com`,
        disabled: false,
      });
    }
    const pendingInvites: FixtureAdminTeam["pendingInvites"] = Array.from(
      { length: seed.pendingInviteCount },
      (_, j) => ({
        email: `invite${i + 1}-${j + 1}@example.com`,
        name: `초대 ${j + 1}`,
        handle: `inv${i + 1}${j + 1}`,
      }),
    );
    return {
      ...seed,
      id: `ux-admin-team-${i + 1}`,
      plan: "TEAM" as const,
      name:
        i < ADMIN_TEAM_FIXTURE_SEED.length ? seed.name : `${seed.name} ${i + 1}`,
      slug: `ux-team-${i + 1}`,
      createdAt: daysAgoIso(day + 10),
      updatedAt: daysAgoIso(Math.max(0, day - 1)),
      lastMeetingAt:
        seed.meetingCount > 0 ? daysAgoIso(Math.max(0, day - 2)) : null,
      owner: {
        ...seed.owner,
        id: ownerId,
      },
      managers,
      pendingInvites,
    };
  });
}

/** UX 미리보기: 회원가입 이메일 인증. */
export type SignupEmailVerifyFixture = {
  email: string;
  otp: string;
  message: string;
};

export const FIXTURE_SIGNUP_VERIFY_EMAIL = "preview@faith.local";
export const FIXTURE_SIGNUP_VERIFY_CODE = "123456";

export function fixtureSignupEmailVerify(): SignupEmailVerifyFixture {
  return {
    email: FIXTURE_SIGNUP_VERIFY_EMAIL,
    otp: FIXTURE_SIGNUP_VERIFY_CODE,
    message: "메일을 확인해 주세요.",
  };
}

export function fixturePipelineEmpty(): PipelineStatsSummary {
  return {
    total: 0,
    done: 0,
    error: 0,
    moderationBlocked: 0,
    quotaBlocked: 0,
    failureRate: 0,
    byFailedStage: {},
    byModel: {},
    byDurationBucket: {},
    bySpeakerBucket: {},
    byTopicBucket: {},
    byModelAndStage: {},
    byDurationAndStage: {},
  };
}

export function fixturePipelineFull(): PipelineStatsSummary {
  return {
    total: 120,
    done: 98,
    error: 14,
    moderationBlocked: 8,
    quotaBlocked: 0,
    failureRate: 14 / 120,
    byFailedStage: { stt: 5, structure: 6, moderation: 3 },
    byModel: { "gpt-4o-transcribe": 70, "gpt-4.1-mini": 50 },
    byDurationBucket: { "0-10": 40, "10-30": 55, "30-60": 20, "60+": 5 },
    bySpeakerBucket: { "1": 20, "2-3": 50, "4-6": 30, "7+": 20 },
    byTopicBucket: {
      business: 40,
      tech_dev: 35,
      education: 20,
      other: 25,
    },
    byModelAndStage: {},
    byDurationAndStage: {},
  };
}

export function fixtureSurveyEmpty(): SurveyStatsSummary {
  return {
    total: 0,
    totalUsers: 40,
    responseRate: 0,
    willingRate: 0,
    avgSatisfaction: 0,
    byPaymentIntent: {},
    byPricePreference: {},
    byFeature: {},
    satisfactionCounts: {},
  };
}

export function fixtureSurveyFull(): SurveyStatsSummary {
  return {
    total: 28,
    totalUsers: 40,
    responseRate: 0.7,
    willingRate: 0.55,
    avgSatisfaction: 4.1,
    byPaymentIntent: {
      willing: 15,
      free_only: 8,
      unsure: 5,
    },
    byPricePreference: {
      under_5000: 6,
      "5000_15000": 10,
      "15000_30000": 7,
      over_30000: 2,
    },
    byFeature: {
      diarization: 18,
      summary_timeline: 22,
      memo: 9,
      playback_sync: 14,
    },
    satisfactionCounts: { "3": 4, "4": 12, "5": 12 },
  };
}

export function fixtureTeamChatEmpty(): FixtureTeamChatMessage[] {
  return [];
}

export function fixtureTeamChatFull(
  currentUserId = "ux-me",
): FixtureTeamChatMessage[] {
  const now = Date.now();
  return [
    {
      id: "ux-tcm-1",
      body: "오늘 싱크 자료 공유합니다.",
      attachmentType: "vault_file",
      vaultFileId: "ux-vault-1",
      teamMeetingId: null,
      attachmentMeta: {
        name: "주간싱크.pdf",
        size: 240_000,
        mime: "application/pdf",
      },
      createdAt: new Date(now - 3_600_000).toISOString(),
      author: {
        id: "ux-peer-1",
        name: "김동료",
        handle: "kim",
        image: null,
      },
    },
    {
      id: "ux-tcm-2",
      body: "회의록도 같이 올려 둘게요.",
      attachmentType: "team_meeting",
      vaultFileId: null,
      teamMeetingId: "ux-rec-1",
      attachmentMeta: {
        title: "최근 기록 1",
        state: "COMPLETED",
        endedAt: new Date(now - 86_400_000).toISOString(),
      },
      createdAt: new Date(now - 1_800_000).toISOString(),
      author: {
        id: currentUserId,
        name: "나",
        handle: "me",
        image: null,
      },
    },
    {
      id: "ux-tcm-3",
      body: "확인했습니다. 내일까지 피드백 남길게요.",
      attachmentType: null,
      vaultFileId: null,
      teamMeetingId: null,
      attachmentMeta: null,
      createdAt: new Date(now - 600_000).toISOString(),
      author: {
        id: "ux-peer-2",
        name: "이팀원",
        handle: "lee",
        image: null,
      },
    },
  ];
}
