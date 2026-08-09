"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { MeetingDetailMobileRail } from "@/components/meetings/meeting-detail-mobile-rail";
import { MeetingParticipants } from "@/components/meetings/meeting-participants";
import { MeetingSummaryCard } from "@/components/meetings/meeting-summary-card";
import { MeetingTimelineView } from "@/components/meetings/meeting-timeline";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import { cn } from "@/lib/utils";

/**
 * 1열(~lg 미만): 요약 → 참석 → 타임라인 (섹션 헤더 가로선만 사용).
 * 2열(lg+): 요약+참석 | 타임라인.
 */
export function MeetingDetailBody({
  meeting,
  timeline,
  canEditParticipants = false,
  backHref = "/dashboard",
  editMode = false,
  draftTimeline,
  onDraftTimelineChange,
  editBusy = false,
}: {
  meeting: Meeting;
  timeline: MeetingTimeline;
  canEditParticipants?: boolean;
  backHref?: string;
  editMode?: boolean;
  draftTimeline?: MeetingTimeline;
  onDraftTimelineChange?: (next: MeetingTimeline) => void;
  editBusy?: boolean;
}) {
  const router = useRouter();
  const [speakerFilter, setSpeakerFilter] = useState<string | null>(null);
  const chatHref = `/meetings/${meeting.id}/chat`;
  const viewTimeline = editMode && draftTimeline ? draftTimeline : timeline;
  const hasSummary = Boolean(
    editMode ||
      viewTimeline.overallSummary?.trim() ||
      viewTimeline.decisions?.length ||
      viewTimeline.actions?.length,
  );

  function toggleSpeaker(name: string) {
    setSpeakerFilter((prev) => (prev === name ? null : name));
  }

  return (
    <>
      <div
        className={cn(
          "space-y-5 pb-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] md:pb-0",
          "lg:grid lg:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)] lg:items-start lg:gap-x-10 lg:gap-y-8 lg:space-y-0",
        )}
      >
        {hasSummary ? (
          <div
            id="meeting-summary"
            className="scroll-mt-4 lg:col-start-1 lg:row-start-1"
          >
            <MeetingSummaryCard
              timeline={viewTimeline}
              editMode={editMode}
              disabled={editBusy}
              onChange={onDraftTimelineChange}
            />
          </div>
        ) : null}

        <aside
          id="meeting-people"
          className={cn(
            "scroll-mt-4 lg:col-start-1 lg:sticky lg:top-4 lg:max-h-[min(70dvh,40rem)] lg:overflow-y-auto lg:overscroll-contain",
            hasSummary ? "lg:row-start-2" : "lg:row-start-1",
          )}
        >
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
        </aside>

        <div
          id="meeting-records"
          className={cn(
            "min-w-0 scroll-mt-4 lg:col-start-2",
            hasSummary
              ? "lg:row-start-1 lg:row-span-2"
              : "lg:row-start-1",
          )}
        >
          <MeetingTimelineView
            timeline={viewTimeline}
            participants={meeting.participants}
            speakerFilter={speakerFilter}
            onClearSpeakerFilter={() => setSpeakerFilter(null)}
            chatHref={chatHref}
            editMode={editMode}
            disabled={editBusy}
            onChange={onDraftTimelineChange}
            onSegmentSelect={
              editMode
                ? undefined
                : (segmentId) => {
                    router.push(`${chatHref}?segment=${segmentId}`);
                  }
            }
          />
        </div>
      </div>

      <MeetingDetailMobileRail chatHref={chatHref} backHref={backHref} />
    </>
  );
}
