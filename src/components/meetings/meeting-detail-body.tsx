"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { MessagesSquare } from "lucide-react";

import { MeetingAttachmentsList, collectTranscriptFiles } from "@/components/meetings/meeting-attachments";
import { MeetingDetailMobileRail } from "@/components/meetings/meeting-detail-mobile-rail";
import { MeetingParticipants } from "@/components/meetings/meeting-participants";
import { MeetingSummaryCard } from "@/components/meetings/meeting-summary-card";
import { MeetingTimelineView } from "@/components/meetings/meeting-timeline";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";
import { cn } from "@/lib/utils";

type DetailTab = "timeline" | "files";

const TABS: { id: DetailTab; label: string }[] = [
  { id: "timeline", label: "타임라인" },
  { id: "files", label: "첨부" },
];

/** 타임라인 / 첨부. 대화기록은 별도 채팅 다시보기로 이동. */
export function MeetingDetailBody({
  meeting,
  timeline,
  transcript,
  canEditParticipants = false,
  backHref = "/dashboard",
}: {
  meeting: Meeting;
  timeline: MeetingTimeline;
  transcript: MeetingTranscript;
  canEditParticipants?: boolean;
  backHref?: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<DetailTab>("timeline");
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const chatHref = `/meetings/${meeting.id}/chat`;
  const hasAttachments = collectTranscriptFiles(transcript).length > 0;
  const hasSummary = Boolean(
    timeline.overallSummary?.trim() ||
      timeline.decisions?.length ||
      timeline.actions?.length,
  );

  function toggleSpeaker(name: string) {
    setSpeakerFilter((prev) => (prev === name ? null : name));
    setTab("timeline");
  }

  return (
    <>
      <div className="space-y-5 pb-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] md:pb-0">
        <div id="meeting-summary" className="scroll-mt-4">
          {hasSummary ? <MeetingSummaryCard timeline={timeline} /> : null}
        </div>

        <div id="meeting-people" className="scroll-mt-4">
          <MeetingParticipants
            participants={meeting.participants}
            selectedName={speakerFilter}
            onSelectName={toggleSpeaker}
            meetingId={meeting.id}
            canEdit={canEditParticipants}
            onParticipantRenamed={(from, to) => {
              setSpeakerFilter((prev) => (prev === from ? to : prev));
            }}
          />
        </div>

        <div id="meeting-records" className="scroll-mt-4">
          {/* 모바일: 첨부가 있을 때만 탭 전환 노출. 터치 타깃 48, 간격 8px 이상. */}
          {hasAttachments ? (
            <div
              role="tablist"
              aria-label="회의 기록 분류"
              className="mb-3 flex min-w-0 gap-2 md:hidden"
            >
              {TABS.map((item) => {
                const isSelected = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => setTab(item.id)}
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
          ) : null}

          <div className="hidden flex-col gap-2 md:flex md:flex-row md:items-end md:justify-between md:gap-3">
            <div
              role="tablist"
              aria-label="회의 기록 분류"
              className="flex min-w-0 flex-wrap gap-x-5 gap-y-1"
            >
              {TABS.map((item) => {
                const isFilesEmpty = item.id === "files" && !hasAttachments;
                const isSelected = tab === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    disabled={isFilesEmpty}
                    onClick={() => {
                      if (isFilesEmpty) return;
                      setTab(item.id);
                    }}
                    className={cn(
                      "min-h-0 shrink-0 border-b-2 px-0.5 pb-2 pt-0.5 text-sm transition-colors",
                      isFilesEmpty
                        ? "cursor-not-allowed border-transparent font-medium text-muted opacity-40"
                        : isSelected
                          ? "border-foreground font-semibold text-foreground"
                          : "border-transparent font-semibold text-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <Link
              href={chatHref}
              className="mb-1.5 inline-flex min-h-0 shrink-0 items-center justify-start gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-soft"
            >
              <MessagesSquare className="h-3.5 w-3.5" strokeWidth={1.75} />
              대화, 다시듣기
            </Link>
          </div>

          <div
            className="panel-surface mt-0 rounded-2xl px-4 py-4 md:mt-3 sm:px-5"
            role="tabpanel"
          >
            {tab === "timeline" ? (
              <MeetingTimelineView
                timeline={timeline}
                participants={meeting.participants}
                speakerFilter={speakerFilter}
                onClearSpeakerFilter={() => setSpeakerFilter(null)}
                onSegmentSelect={(segmentId) => {
                  router.push(`${chatHref}?segment=${segmentId}`);
                }}
              />
            ) : null}
            {tab === "files" ? (
              <MeetingAttachmentsList
                transcript={transcript}
                onSelectLine={(lineId) => {
                  router.push(`${chatHref}?line=${lineId}`);
                }}
              />
            ) : null}
          </div>
        </div>
      </div>

      <MeetingDetailMobileRail chatHref={chatHref} backHref={backHref} />
    </>
  );
}
