import { guessVaultMime } from "@/lib/vault-file-icon";
import type { DevChangelogState } from "@/lib/changelog-store";
import type { AiUsageSummary } from "@/lib/stt/usage-store";
import type { VaultItemMeta, VaultUsage } from "@/lib/vault";
import { VAULT_QUOTA_BYTES } from "@/lib/vault";
import type { WorkspaceId } from "@/lib/workspaces";
import type { Meeting } from "@/types/meeting";
import type { AppNotification } from "@/types/notification";

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

let cachedVaultItemsFull: VaultItemMeta[] | null = null;
let cachedAiUsageFull: AiUsageSummary | null = null;
const cachedMeetingsFull = new Map<string, Meeting[]>();

/** UX 미리보기: 보관함 가득 찬 목록. */
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
  cachedVaultItemsFull = names.map((name, index) => ({
    id: `ux-vault-${index + 1}`,
    name,
    size: 120_000 + index * 85_000,
    mime: guessVaultMime(name),
    createdAt: daysAgoIso(index % 6),
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
    "주간 보안 싱크",
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
    tags: index % 2 === 0 ? ["보안", "일정"] : ["제품"],
    summaryTags: index % 2 === 0 ? ["보안", "일정"] : ["제품"],
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

/** UX 미리보기: AI 사용량 채워짐. */
export function fixtureAiUsageFull(): AiUsageSummary {
  if (cachedAiUsageFull) return cachedAiUsageFull;
  const days = Array.from({ length: 12 }, (_, index) => {
    const date = daysAgoIso(index).slice(0, 10);
    const sttUsd = 0.42 + index * 0.05;
    const structureUsd = 0.18 + index * 0.02;
    const usdKrw = 1380;
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
  const usdKrw = 1380;
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
    eventCount: 48,
    meetingCount: 16,
    audioMinutes: Math.round(
      days.reduce((sum, d) => sum + d.audioSec, 0) / 60,
    ),
    byDay: days,
    byModel: [
      {
        model: "gpt-4o-transcribe",
        stage: "stt",
        usd: sttUsd,
        krw: sttUsd * usdKrw,
        tokens: 120_000,
        count: 28,
      },
      {
        model: "gpt-4.1-mini",
        stage: "structure",
        usd: structureUsd,
        krw: structureUsd * usdKrw,
        tokens: 64_000,
        count: 20,
      },
    ],
    byUser: [
      {
        userId: "ux-user-1",
        usd: totalUsd * 0.55,
        krw: totalUsd * 0.55 * usdKrw,
        tokens: 110_000,
        jobs: 26,
        meetingCount: 9,
        audioSec: 12_000,
      },
      {
        userId: "ux-user-2",
        usd: totalUsd * 0.45,
        krw: totalUsd * 0.45 * usdKrw,
        tokens: 74_000,
        jobs: 22,
        meetingCount: 7,
        audioSec: 9_600,
      },
    ],
    recent: Array.from({ length: 10 }, (_, index) => {
      const inputTokens = 2_000 + index * 100;
      const outputTokens = 400 + index * 20;
      return {
        id: `ux-ai-${index + 1}`,
        at: daysAgoIso(index % 5),
        userId: index % 2 === 0 ? "ux-user-1" : "ux-user-2",
        meetingId: `ux-mtg-${(index % 6) + 1}`,
        title: `미리보기 작업 ${index + 1}`,
        stage: index % 3 === 0 ? ("stt" as const) : ("structure" as const),
        model: index % 3 === 0 ? "gpt-4o-transcribe" : "gpt-4.1-mini",
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

/** UX 미리보기: 알림 센터 채워짐 (초대·회의확인 액션 포함). */
export function fixtureNotificationsFull(): AppNotification[] {
  return [
    {
      id: "ux-n-invite",
      type: "invite",
      title: "팀 초대",
      body: "제품기획팀에서 초대했습니다.",
      time: "방금",
      unread: true,
      data: { inviteId: "ux-invite-1" },
    },
    {
      id: "ux-n-ack",
      type: "meeting",
      title: "회의 참석 확인",
      body: "내일 주간 싱크 참석을 확인해 주세요.",
      time: "12분 전",
      unread: true,
      data: { kind: "meeting_ack", meetingId: "ux-mtg-1" },
    },
    {
      id: "ux-n-mask",
      type: "masking",
      title: "마스킹 검증 필요",
      body: "미확정 개인정보 후보가 있습니다.",
      time: "1시간 전",
      unread: true,
    },
    {
      id: "ux-n-storage",
      type: "storage",
      title: "암호화 저장 정상",
      body: "최근 업로드분 검사가 완료되었습니다.",
      time: "어제",
      unread: false,
    },
  ];
}
