"use client";

import { useState, type ReactNode } from "react";

import { MeetingCaptureChip } from "@/components/meetings/meeting-capture-label";
import {
  MeetingDateTimeMeta,
  MeetingRecordActions,
  MeetingTitleHeading,
} from "@/components/meetings/meeting-record-actions";
import { MeetingRecordLayout } from "@/components/meetings/meeting-record-layout";
import { MeetingTopicTags } from "@/components/meetings/meeting-topic-tags";
import type { Meeting } from "@/types/meeting";
import type { MeetingTimeline } from "@/types/timeline";
import type { MeetingTranscript } from "@/types/transcript";

/**
 * 상세 상단 + 기록 레이아웃.
 * Server Component에서 render-prop children을 넘기면 RSC가 깨지므로
 * 레이아웃을 여기서 감싸고 본문만 ReactNode로 받는다.
 */
export function MeetingDetailHeader({
  meetingId,
  meeting,
  timeline,
  transcript,
  canEdit,
  processing,
  keywords,
  fillHeight = false,
  wide = false,
  children,
}: {
  meetingId: string;
  meeting: Meeting;
  timeline: MeetingTimeline;
  transcript: MeetingTranscript;
  canEdit: boolean;
  processing: boolean;
  keywords: string[];
  fillHeight?: boolean;
  wide?: boolean;
  children?: ReactNode;
}) {
  const [titleEditNonce, setTitleEditNonce] = useState(0);

  return (
    <MeetingRecordLayout
      fillHeight={fillHeight}
      wide={wide}
      headerCenter={
        <MeetingDateTimeMeta
          meetingId={meetingId}
          date={meeting.date}
          duration={meeting.duration}
          canEdit={canEdit}
          variant="header"
        />
      }
      trailing={
        <MeetingRecordActions
          meetingId={meetingId}
          tags={meeting.tags}
          meeting={meeting}
          timeline={timeline}
          transcript={transcript}
          summary={timeline.overallSummary}
          processing={processing}
          canEdit={canEdit}
          onEdit={() => setTitleEditNonce((n) => n + 1)}
        />
      }
      title={
        <>
          <div className="flex min-w-0 items-center gap-3">
            <MeetingTitleHeading
              meetingId={meetingId}
              title={meeting.title}
              canEdit={canEdit}
              editNonce={titleEditNonce}
              className="min-w-0 flex-1"
            />
            <MeetingCaptureChip meeting={meeting} className="shrink-0" />
          </div>
          {keywords.length > 0 ? (
            <MeetingTopicTags
              tags={keywords}
              className="mt-3"
            />
          ) : null}
        </>
      }
    >
      {children}
    </MeetingRecordLayout>
  );
}
