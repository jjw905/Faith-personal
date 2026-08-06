"use client";

import { AdminPageChrome } from "@/components/admin/admin-page-chrome";
import { OpsStatsDashboard } from "@/components/admin/ops-stats-dashboard";
import { TeamChatHub } from "@/components/team/team-chat-hub";
import {
  fixtureAiUsageEmpty,
  fixtureAiUsageFull,
  fixturePipelineEmpty,
  fixturePipelineFull,
  fixtureSurveyEmpty,
  fixtureSurveyFull,
} from "@/lib/page-ux-fixtures";

function noop() {}

/** 디자인 랩: 통계 카테고리 허브 (채워짐). */
export function SceneAdminStatsFull() {
  return (
    <AdminPageChrome title="통계">
      <OpsStatsDashboard
        initialUsage={fixtureAiUsageFull()}
        initialUsers={fixtureAiUsageFull().byUser.map((u) => ({
          id: u.userId,
          label: u.userId,
          usd: u.usd,
          krw: u.krw,
          jobs: u.jobs,
        }))}
        initialPipeline={fixturePipelineFull()}
        initialBlocked={[
          {
            id: "ux-mod-1",
            userId: "ux-user-1",
            meetingId: "ux-meet-1",
            categories: ["violence"],
            maxScore: 0.91,
            createdAt: new Date().toISOString(),
          },
        ]}
        initialSurvey={fixtureSurveyFull()}
        initialCategory="usage"
        previewLock
      />
    </AdminPageChrome>
  );
}

/** 디자인 랩: 통계 빈 화면. */
export function SceneAdminStatsEmpty() {
  return (
    <AdminPageChrome title="통계">
      <OpsStatsDashboard
        initialUsage={fixtureAiUsageEmpty()}
        initialUsers={[]}
        initialPipeline={fixturePipelineEmpty()}
        initialBlocked={[]}
        initialSurvey={fixtureSurveyEmpty()}
        initialCategory="usage"
        previewLock
      />
    </AdminPageChrome>
  );
}

/** 디자인 랩: 팀 채팅 허브. */
export function SceneTeamChatHub() {
  const upcoming = Array.from({ length: 4 }, (_, i) => ({
    id: `ux-up-${i + 1}`,
    title: `팀 회의 ${i + 1}`,
    scheduledStartAt: new Date(Date.now() + (i + 1) * 86400000).toISOString(),
    canJoin: true,
    status: "SCHEDULED",
  }));
  const announcements = Array.from({ length: 3 }, (_, i) => ({
    id: `ux-an-${i + 1}`,
    title: `공지 ${i + 1}`,
    body: "팀 운영 안내입니다.",
    pinned: i === 0,
    read: i > 0,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
  }));
  const records = Array.from({ length: 5 }, (_, i) => ({
    id: `ux-rec-${i + 1}`,
    title: `최근 기록 ${i + 1}`,
    endedAt: new Date(Date.now() - i * 7200000).toISOString(),
    state: "COMPLETED",
  }));

  return (
    <div className="min-h-full bg-background p-3">
      <TeamChatHub
        teamId="ux-team"
        currentUserId="ux-me"
        teamName="제품기획팀"
        upcoming={upcoming}
        announcements={announcements}
        records={records}
        canCreateMeeting
        canAnnounce
        onStartLive={noop}
        onSchedule={noop}
        onComposeAnnouncement={noop}
        onOpenRecord={noop}
        onOpenUpcoming={noop}
        onMarkAnnouncementRead={noop}
        previewLock
      />
    </div>
  );
}
