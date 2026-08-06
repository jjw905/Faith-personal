"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { MeetingMidPanel } from "@/components/dashboard/meeting-mid-panel";
import {
  MeetingsMobileActionBar,
  type MeetingsMobilePane,
} from "@/components/dashboard/meetings-mobile-action-bar";
import { ExpandableMeetingSearch } from "@/components/dashboard/meeting-search";
import { RecentMeetingsTable } from "@/components/dashboard/recent-meetings-table";
import { PageContainer } from "@/components/layout/page-container";
import { MeetingCreatePanel } from "@/components/meetings/meeting-create-page";
import { MeetingRecordHeaderRow } from "@/components/meetings/meeting-record-layout";
import { useAppContext } from "@/context/app-context";
import { usePageUxPreview } from "@/context/page-ux-preview-context";
import { FIXTURE_PROCESSING_MULTI } from "@/components/design/fixtures";
import { fixtureMeetingsFull } from "@/lib/page-ux-fixtures";
import { formatSeoulDateParts } from "@/lib/meeting-date";
import { getMeetingsByWorkspace } from "@/lib/meetings-mock";
import { getWorkspaceProfile } from "@/lib/workspaces";
import type { Meeting, MeetingProcessInfo } from "@/types/meeting";
import { cn } from "@/lib/utils";

/**
 * 회의 기록 상세 헤더 행만 재활용: 가운데 일자 + 우측 「회의록 생성」(포털).
 * 일자는 클라이언트에서만 채워 hydration 불일치(SSR vs 브라우저 시각)를 피한다.
 */
function DashboardPageHeader({
  onCreate,
}: {
  onCreate: () => void;
}) {
  const [headerDay, setHeaderDay] = useState<{
    iso: string;
    day: string;
  } | null>(null);

  useEffect(() => {
    const iso = new Date().toISOString();
    setHeaderDay({ iso, day: formatSeoulDateParts(iso).day });
  }, []);

  const createButtonClass =
    "inline-flex h-14 cursor-pointer items-center gap-2 rounded-[50px] bg-primary px-5 text-base font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-primary-hover";

  return (
    <div className="min-w-0">
      <MeetingRecordHeaderRow
        leading={
          <span
            className={cn(
              createButtonClass,
              "pointer-events-none invisible hidden md:inline-flex",
            )}
            aria-hidden
          >
            <Plus className="h-5 w-5 shrink-0" strokeWidth={2.25} />
            회의록 생성
          </span>
        }
        center={
          <time
            dateTime={headerDay?.iso}
            title={headerDay?.day}
            suppressHydrationWarning
            className="flex min-h-14 max-w-full items-center justify-center truncate text-center text-2xl font-bold leading-none tabular-nums tracking-tight text-foreground"
          >
            {headerDay?.day ?? "\u00a0"}
          </time>
        }
        trailing={
          <button
            type="button"
            onClick={onCreate}
            className={cn(createButtonClass, "hidden md:inline-flex")}
            aria-label="회의록 생성"
            title="회의록 생성"
          >
            <Plus className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden />
            회의록 생성
          </button>
        }
      />
    </div>
  );
}

type RecordsBarState = {
  onExitSelect: () => void;
};

function fixtureProcessingAsMeetings(
  workspaceId: Meeting["workspace"],
): Meeting[] {
  return FIXTURE_PROCESSING_MULTI.map((item, index) => {
    const phase =
      item.phase === "structuring" ? "structuring" : "transcribing";
    const process: MeetingProcessInfo = {
      phase,
      progressPercent: item.progressPercent ?? 0,
      stageLabel: item.stageLabel ?? null,
      waiting: item.waiting,
      jobStatus: item.jobStatus,
      queueAhead: item.queueAhead ?? null,
    };
    return {
      id: item.id,
      title: item.title,
      tags: [],
      summaryTags: [],
      date: new Date(Date.now() - index * 60_000).toISOString(),
      duration: "—",
      participants: [],
      status: "in_progress" as const,
      security: "protected" as const,
      workspace: workspaceId,
      capture: "upload" as const,
      process,
    };
  });
}

export default function DashboardPage() {
  const { workspaceId } = useAppContext();
  const { scenarioId } = usePageUxPreview();
  const profile = getWorkspaceProfile(workspaceId);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobilePane, setMobilePane] =
    useState<MeetingsMobilePane>("records");
  const [meetings, setMeetings] = useState<Meeting[]>(() =>
    getMeetingsByWorkspace(workspaceId),
  );
  const [recordsBar, setRecordsBar] = useState<RecordsBarState | null>(null);
  const [purgeNotice, setPurgeNotice] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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
        const next = data.meetings.filter((m) => !hidden.has(m.id));
        setMeetings((prev) => {
          if (
            prev.length === next.length &&
            prev.every(
              (m, i) =>
                m.id === next[i]?.id &&
                m.status === next[i]?.status &&
                m.title === next[i]?.title &&
                m.date === next[i]?.date &&
                m.duration === next[i]?.duration &&
                m.process?.progressPercent ===
                  next[i]?.process?.progressPercent &&
                m.process?.waiting === next[i]?.process?.waiting &&
                m.process?.queueAhead === next[i]?.process?.queueAhead &&
                m.process?.stageLabel === next[i]?.process?.stageLabel,
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
        (m) => !hidden.has(m.id),
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

  const hasProcessing = meetings.some((m) => m.status === "in_progress");
  useEffect(() => {
    if (!hasProcessing || scenarioId === "anim-processing") return;
    const id = window.setInterval(() => void refreshMeetings(), 1000);
    return () => window.clearInterval(id);
  }, [hasProcessing, refreshMeetings, scenarioId]);

  useEffect(() => {
    setSearchQuery("");
    setMobilePane("records");
  }, [workspaceId]);

  const viewMeetings =
    scenarioId === "empty"
      ? []
      : scenarioId === "anim-processing"
        ? [
            ...fixtureProcessingAsMeetings(workspaceId),
            ...fixtureMeetingsFull(workspaceId).slice(0, 4),
          ]
        : scenarioId === "full" ||
            scenarioId === "popup-records-delete" ||
            scenarioId === "popup-records-download"
          ? fixtureMeetingsFull(workspaceId)
          : meetings;

  const paneTabs = [
    { id: "records" as const, label: profile.recordsTitle },
    { id: "upcoming" as const, label: profile.upcomingTitle },
  ];

  return (
    <PageContainer soft>
      <div className="flex flex-col gap-8 pb-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] md:pb-0">
        <DashboardPageHeader onCreate={() => setCreateOpen(true)} />

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

        <section id="meetings" className="min-w-0">
          {/* 탭+검색 같은 가로선. 펼침은 선 아래 — 겹침·섹션 배경 없음 */}
          <div className="mb-3 min-w-0">
            <ExpandableMeetingSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder={profile.searchPlaceholder}
              label={`${mobilePane === "records" ? profile.recordsTitle : profile.upcomingTitle} 검색`}
              toolbar={
                <>
                  <div
                    role="tablist"
                    aria-label="기록과 일정"
                    className="flex min-w-0 gap-2 md:hidden"
                  >
                    {paneTabs.map((item) => {
                      const isSelected = mobilePane === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          onClick={() => {
                            if (item.id !== "records") recordsBar?.onExitSelect();
                            setMobilePane(item.id);
                          }}
                          className={cn(
                            "min-h-12 flex-1 rounded-xl px-3 text-base font-semibold transition-colors",
                            isSelected
                              ? "bg-foreground text-background"
                              : "bg-surface text-muted hover:text-foreground",
                          )}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                  <div
                    role="tablist"
                    aria-label="기록과 일정"
                    className="hidden min-w-0 items-end gap-1 md:flex"
                  >
                    {paneTabs.map((item) => {
                      const isSelected = mobilePane === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={isSelected}
                          onClick={() => {
                            if (item.id !== "records") recordsBar?.onExitSelect();
                            setMobilePane(item.id);
                          }}
                          className={cn(
                            "-mb-px inline-flex min-h-12 items-center border-b-2 px-3 text-base font-semibold transition-colors",
                            isSelected
                              ? "border-foreground text-foreground"
                              : "border-transparent text-muted hover:text-foreground",
                          )}
                        >
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              }
            />
          </div>

          {mobilePane === "records" ? (
            <RecentMeetingsTable
              meetings={viewMeetings}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              hideTitle
              hideSearch
              onMeetingRemoved={(id) =>
                setMeetings((prev) => prev.filter((m) => m.id !== id))
              }
              onMobileBarChange={setRecordsBar}
            />
          ) : (
            <MeetingMidPanel
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              hideTitle
              hideSearch
            />
          )}
        </section>
      </div>

      <MeetingsMobileActionBar
        pane={mobilePane}
        onPaneChange={(pane) => {
          if (pane !== "records") recordsBar?.onExitSelect();
          setMobilePane(pane);
        }}
        hidePaneSwitch
        onStart={() => setCreateOpen(true)}
        createLabel="회의록 생성"
        onLeaveRecords={recordsBar?.onExitSelect}
      />

      <MeetingCreatePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </PageContainer>
  );
}
