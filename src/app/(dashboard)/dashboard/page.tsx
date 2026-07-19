"use client";

import { useState } from "react";

import { AudioUploadZone } from "@/components/dashboard/audio-upload-zone";
import { MeetingMidPanel } from "@/components/dashboard/meeting-mid-panel";
import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { RecentMeetingsTable } from "@/components/dashboard/recent-meetings-table";
import { PageContainer } from "@/components/layout/page-container";
import { useAppContext } from "@/context/app-context";
import { getMeetingsByWorkspace } from "@/lib/mock-loader";
import { getWorkspaceProfile } from "@/lib/workspaces";

function TodayHeading({ meetingHeadline }: { meetingHeadline: string }) {
  const now = new Date();
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const weekdayLabel = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    weekday: "long",
  }).format(now);

  return (
    <div className="min-w-0">
      <p className="text-sm font-medium leading-none text-muted">
        {dateLabel} {weekdayLabel}
      </p>
      <h1 className="mt-2 text-2xl font-bold leading-none tracking-tight text-foreground">
        {meetingHeadline}
      </h1>
    </div>
  );
}

export default function DashboardPage() {
  const { workspaceId } = useAppContext();
  const profile = getWorkspaceProfile(workspaceId);
  const meetings = getMeetingsByWorkspace(workspaceId);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <PageContainer className="!pb-10">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TodayHeading meetingHeadline={profile.meetingHeadline} />
          <div className="w-full min-w-0 sm:max-w-sm sm:flex-1">
            <MeetingSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={profile.searchPlaceholder}
            />
          </div>
        </div>

        <section>
          <AudioUploadZone
            ctaStart={profile.ctaStart}
            ctaUpload={profile.ctaUpload}
          />
        </section>

        <section>
          <MeetingMidPanel searchQuery={searchQuery} />
        </section>

        <section id="meetings">
          <RecentMeetingsTable meetings={meetings} searchQuery={searchQuery} />
        </section>
      </div>
    </PageContainer>
  );
}
