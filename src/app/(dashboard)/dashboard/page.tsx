"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  AudioUploadZone,
  type AudioUploadZoneHandle,
} from "@/components/dashboard/audio-upload-zone";
import { MeetingMidPanel } from "@/components/dashboard/meeting-mid-panel";
import {
  MeetingsMobileActionBar,
  type MeetingsMobilePane,
} from "@/components/dashboard/meetings-mobile-action-bar";
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
import { cn } from "@/lib/utils";

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
      <p className="text-base font-medium leading-tight text-muted">
        {dateLabel} {weekdayLabel}
      </p>
      <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-foreground">
        {meetingHeadline}
      </h1>
    </div>
  );
}

type RecordsBarState = {
  onExitSelect: () => void;
};

export default function DashboardPage() {
  const { workspaceId } = useAppContext();
  const { scenarioId } = usePageUxPreview();
  const profile = getWorkspaceProfile(workspaceId);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobilePane, setMobilePane] =
    useState<MeetingsMobilePane>("upcoming");
  const [meetings, setMeetings] = useState<Meeting[]>(() =>
    getMeetingsByWorkspace(workspaceId),
  );
  const [recordsBar, setRecordsBar] = useState<RecordsBarState | null>(null);
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);
  const uploadZoneRef = useRef<AudioUploadZoneHandle>(null);

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
        purgedCount?: number;
      };
      if (
        typeof data.purgedCount === "number" &&
        data.purgedCount > 0 &&
        !sessionStorage.getItem("faith.purge.notice.shown")
      ) {
        sessionStorage.setItem("faith.purge.notice.shown", "1");
        setPurgeNotice(
          `보존 기간이 지난 회의 기록 ${data.purgedCount}개를 정리했습니다.`,
        );
      }
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

  useEffect(() => {
    setSearchQuery("");
    setMobilePane("upcoming");
  }, [workspaceId]);

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
    <PageContainer soft>
      <div className="flex flex-col gap-4 pb-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] md:pb-0">
        <TodayHeading meetingHeadline={profile.meetingHeadline} />

        {purgeNotice ? (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-base text-foreground"
          >
            <p className="min-w-0 flex-1 leading-snug">{purgeNotice}</p>
            <button
              type="button"
              className="shrink-0 min-h-12 min-w-12 rounded-lg text-base text-muted hover:bg-muted/20 hover:text-foreground"
              onClick={() => setPurgeNotice(null)}
              aria-label="닫기"
            >
              닫기
            </button>
          </div>
        ) : null}

        <section className="space-y-3">
          <AudioUploadZone
            ref={uploadZoneRef}
            ctaStart={profile.ctaStart}
            ctaUpload={profile.ctaUpload}
            hideMobileCtas
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

        <section className={cn(mobilePane !== "upcoming" && "max-md:hidden")}>
          <MeetingMidPanel
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </section>

        <section
          id="meetings"
          className={cn(mobilePane !== "records" && "max-md:hidden")}
        >
          <RecentMeetingsTable
            meetings={viewMeetings}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onMeetingRemoved={(id) =>
              setMeetings((prev) => prev.filter((m) => m.id !== id))
            }
            onMobileBarChange={setRecordsBar}
          />
        </section>
      </div>

      <MeetingsMobileActionBar
        pane={mobilePane}
        onPaneChange={setMobilePane}
        startHref={`/meetings/new?workspace=${workspaceId}`}
        startLabel={profile.ctaStart}
        onUpload={() => uploadZoneRef.current?.openUpload()}
        uploadLabel={profile.ctaUpload}
        createLabel="기록 추가"
        onLeaveRecords={recordsBar?.onExitSelect}
      />
    </PageContainer>
  );
}
