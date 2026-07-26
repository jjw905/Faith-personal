"use client";

import { useCallback, useEffect, useState } from "react";

import { AudioUploadZone } from "@/components/dashboard/audio-upload-zone";
import { MeetingMidPanel } from "@/components/dashboard/meeting-mid-panel";
import { MeetingSearch } from "@/components/dashboard/meeting-search";
import { ProcessingNowSection } from "@/components/dashboard/processing-now";
import { RecentMeetingsTable } from "@/components/dashboard/recent-meetings-table";
import { PageContainer } from "@/components/layout/page-container";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { FIXTURE_PROCESSING_MULTI } from "@/components/design/fixtures";
import { fixtureMeetingsFull } from "@/lib/page-ux-fixtures";
import { getMeetingsByWorkspace } from "@/lib/meetings-mock";
import { getWorkspaceProfile } from "@/lib/workspaces";
import type { Meeting } from "@/types/meeting";

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
      <p className="text-base font-medium leading-none text-muted">
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
  const { scenarioId } = usePageUxPreview();
  const profile = getWorkspaceProfile(workspaceId);
  const [searchQuery, setSearchQuery] = useState("");
  const [meetings, setMeetings] = useState<Meeting[]>(() =>
    getMeetingsByWorkspace(workspaceId),
  );

  const refreshMeetings = useCallback(async () => {
    let hidden = new Set<string>();
    try {
      const raw = window.localStorage.getItem("faith.records.hidden");
      if (raw) {
        const ids = JSON.parse(raw) as string[];
        if (Array.isArray(ids)) hidden = new Set(ids);
      }
    } catch {
      // ignore
    }

    try {
      const res = await fetch(
        `/api/meetings?workspace=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      const data = (await res.json()) as {
        ok?: boolean;
        meetings?: Meeting[];
      };
      if (data.ok && Array.isArray(data.meetings)) {
        const next = data.meetings.filter(
          (m) => !hidden.has(m.id) && m.status !== "in_progress",
        );
        setMeetings((prev) => {
          if (
            prev.length === next.length &&
            prev.every(
              (m, i) =>
                m.id === next[i]?.id &&
                m.status === next[i]?.status &&
                m.title === next[i]?.title &&
                m.date === next[i]?.date &&
                m.duration === next[i]?.duration,
            )
          ) {
            return prev;
          }
          return next;
        });
        return;
      }
    } catch {
      // fall through to mock
    }
    setMeetings((prev) => {
      const next = getMeetingsByWorkspace(workspaceId).filter(
        (m) => !hidden.has(m.id) && m.status !== "in_progress",
      );
      if (
        prev.length === next.length &&
        prev.every((m, i) => m.id === next[i]?.id)
      ) {
        return prev;
      }
      return next;
    });
  }, [workspaceId]);

  useEffect(() => {
    void refreshMeetings();
  }, [refreshMeetings]);

  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === "visible") void refreshMeetings();
    };
    window.addEventListener("focus", onShow);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      window.removeEventListener("focus", onShow);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [refreshMeetings]);

  const handleProcessingActiveChange = useCallback(() => {
    void refreshMeetings();
  }, [refreshMeetings]);

  const viewMeetings =
    scenarioId === "empty"
      ? []
      : scenarioId === "full" ||
          scenarioId === "popup-participants" ||
          scenarioId === "popup-records-delete" ||
          scenarioId === "popup-records-download"
        ? fixtureMeetingsFull(workspaceId)
        : meetings;

  return (
    <PageContainer>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TodayHeading meetingHeadline={profile.meetingHeadline} />
          <div className="w-full min-w-0 sm:max-w-sm sm:flex-1">
            <MeetingSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={profile.searchPlaceholder}
              className="bg-card ring-1 ring-border"
            />
          </div>
        </div>

        <section className="space-y-3">
          <AudioUploadZone
            ctaStart={profile.ctaStart}
            ctaUpload={profile.ctaUpload}
            onMeetingStarted={() => void refreshMeetings()}
          />
          {scenarioId === "anim-processing" ? (
            <ProcessingNowSection
              demoItems={FIXTURE_PROCESSING_MULTI}
              animateDemo
            />
          ) : (
            <ProcessingNowSection
              onActiveChange={handleProcessingActiveChange}
            />
          )}
        </section>

        <section>
          <MeetingMidPanel searchQuery={searchQuery} />
        </section>

        <section id="meetings">
          <RecentMeetingsTable
            meetings={viewMeetings}
            onMeetingRemoved={(id) =>
              setMeetings((prev) => prev.filter((m) => m.id !== id))
            }
          />
        </section>
      </div>
    </PageContainer>
  );
}
