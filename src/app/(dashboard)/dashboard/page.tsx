"use client";

import { useState } from "react";

import { AudioUploadZone } from "@/components/dashboard/audio-upload-zone";
import { MeetingMidPanel } from "@/components/dashboard/meeting-mid-panel";
import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { RecentMeetingsTable } from "@/components/dashboard/recent-meetings-table";
import { PageContainer } from "@/components/layout/page-container";
import { useAppContext } from "@/context/app-context";
import { getMeetingsByWorkspace } from "@/lib/mock-loader";

function TodayHeading() {
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
      <p className="text-sm font-medium leading-none text-muted">{dateLabel}</p>
      <div className="mt-2 flex items-center gap-2.5">
        <p className="text-2xl font-bold leading-none tracking-tight text-foreground">
          {weekdayLabel}
        </p>
        <h1 className="text-2xl font-bold leading-none tracking-tight text-foreground">
          회의
        </h1>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { workspaceId } = useAppContext();
  const meetings = getMeetingsByWorkspace(workspaceId);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <PageContainer className="!pb-10">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TodayHeading />
          <div className="w-full min-w-0 sm:max-w-sm sm:flex-1">
            <MeetingSearch value={searchQuery} onChange={setSearchQuery} />
          </div>
        </div>

        <section>
          <AudioUploadZone />
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
