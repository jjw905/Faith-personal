"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { MeetingCaptureChip } from "@/components/meetings/meeting-capture-label";
import { MeetingDetailBody } from "@/components/meetings/meeting-detail-body";
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
 * Server Component에서 render-prop을 넘기면 RSC가 깨지므로
 * editMode는 여기서 들고 본문(MeetingDetailBody)을 직접 렌더한다.
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
  showDetailBody = false,
  canEditParticipants = false,
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
  showDetailBody?: boolean;
  canEditParticipants?: boolean;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [editMode, setEditMode] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [draftTitle, setDraftTitle] = useState(meeting.title);
  const [draftTimeline, setDraftTimeline] = useState(timeline);

  useEffect(() => {
    if (editMode) return;
    setDraftTitle(meeting.title);
    setDraftTimeline(timeline);
  }, [meeting.title, timeline, editMode]);

  useEffect(() => {
    if (!editMode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape" || editBusy) return;
      setDraftTitle(meeting.title);
      setDraftTimeline(timeline);
      setEditMode(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [editMode, editBusy, meeting.title, timeline]);

  async function handleEditToggle() {
    if (!canEdit || processing || editBusy) return;
    if (!editMode) {
      setDraftTitle(meeting.title);
      setDraftTimeline(timeline);
      setEditMode(true);
      return;
    }

    const nextTitle = draftTitle.trim();
    if (!nextTitle) return;

    setEditBusy(true);
    try {
      const titleChanged = nextTitle !== meeting.title;
      const timelineChanged =
        JSON.stringify({
          overallSummary: draftTimeline.overallSummary,
          decisions: draftTimeline.decisions ?? [],
          actions: draftTimeline.actions ?? [],
          segments: draftTimeline.segments.map((s) => ({
            id: s.id,
            title: s.title,
            summary: s.summary,
          })),
        }) !==
        JSON.stringify({
          overallSummary: timeline.overallSummary,
          decisions: timeline.decisions ?? [],
          actions: timeline.actions ?? [],
          segments: timeline.segments.map((s) => ({
            id: s.id,
            title: s.title,
            summary: s.summary,
          })),
        });

      if (titleChanged) {
        const res = await fetch(`/api/meetings/${meetingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: nextTitle }),
        });
        const data = (await res.json()) as { ok?: boolean; message?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.message ?? "제목 저장 실패");
        }
      }

      if (timelineChanged) {
        const res = await fetch(`/api/meetings/${meetingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            timelinePatch: {
              overallSummary: draftTimeline.overallSummary,
              decisions: draftTimeline.decisions ?? [],
              actions: draftTimeline.actions ?? [],
              segments: draftTimeline.segments.map((s) => ({
                id: s.id,
                title: s.title,
                summary: s.summary,
              })),
            },
          }),
        });
        const data = (await res.json()) as { ok?: boolean; message?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.message ?? "요약·타임라인 저장 실패");
        }
      }

      setEditMode(false);
      router.refresh();
    } catch {
      // 편집 모드 유지 — 사용자가 다시 시도
    } finally {
      setEditBusy(false);
    }
  }

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
          editMode={editMode}
          editBusy={editBusy}
          onEdit={() => void handleEditToggle()}
        />
      }
      title={
        <div className="min-w-0 max-w-full">
          <div className="flex min-w-0 items-center gap-2">
            <MeetingCaptureChip meeting={meeting} className="shrink-0" />
            <MeetingTitleHeading
              title={editMode ? draftTitle : meeting.title}
              editMode={editMode}
              draftTitle={draftTitle}
              onDraftTitleChange={setDraftTitle}
              disabled={editBusy}
              className="min-w-0 flex-1 truncate"
            />
          </div>
          {keywords.length > 0 ? (
            <MeetingTopicTags
              tags={keywords}
              className="mt-3 pl-12"
            />
          ) : null}
        </div>
      }
    >
      {children}
      {showDetailBody ? (
        <div className="mt-5 space-y-5">
          <MeetingDetailBody
            meeting={meeting}
            timeline={timeline}
            canEditParticipants={canEditParticipants}
            editMode={editMode}
            draftTimeline={draftTimeline}
            onDraftTimelineChange={setDraftTimeline}
            editBusy={editBusy}
          />
        </div>
      ) : null}
    </MeetingRecordLayout>
  );
}
