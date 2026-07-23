"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { FIXTURE_MEETING } from "@/components/design/fixtures";
import {
  MeetingProcessLoader,
  type MeetingProcessPhase,
} from "@/components/meetings/meeting-process-banner";
import {
  MeetingDateTimeMeta,
  MeetingTitleHeading,
} from "@/components/meetings/meeting-record-actions";
import { MeetingCaptureChip } from "@/components/meetings/meeting-capture-label";
import { Button } from "@/components/ui/button";

function DetailChrome({
  phase,
  progressPercent,
  error,
}: {
  phase: MeetingProcessPhase;
  progressPercent?: number;
  error?: string | null;
}) {
  const meeting = FIXTURE_MEETING;
  const active = phase === "transcribing" || phase === "structuring";
  const failed = phase === "error";

  return (
    <div
      className={
        active || failed
          ? "mx-auto flex h-full min-h-full max-w-3xl flex-col px-4 py-6 sm:px-6"
          : "mx-auto h-full min-h-full max-w-3xl px-4 py-6 sm:px-6"
      }
    >
      <div className="shrink-0">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/dashboard">
            <ArrowLeft className="h-4 w-4" />
            회의로 돌아가기
          </Link>
        </Button>

        <MeetingCaptureChip meeting={meeting} className="mb-3" />
        <MeetingTitleHeading
          meetingId={meeting.id}
          title={meeting.title}
          canEdit={false}
        />

        <MeetingDateTimeMeta
          meetingId={meeting.id}
          date={meeting.date}
          duration={meeting.duration}
          canEdit={false}
        />
      </div>

      <section
        className={
          active || failed
            ? "flex flex-1 flex-col items-center justify-center"
            : undefined
        }
      >
        <MeetingProcessLoader
          phase={phase}
          progressPercent={progressPercent}
          error={error}
        />
      </section>
    </div>
  );
}

export function SceneMeetingTranscribing() {
  return (
    <DetailChrome phase="transcribing" progressPercent={36} />
  );
}

export function SceneMeetingStructuring() {
  return (
    <DetailChrome phase="structuring" progressPercent={72} />
  );
}

export function SceneMeetingError() {
  return (
    <DetailChrome
      phase="error"
      error="보관함 파일을 찾을 수 없습니다."
    />
  );
}
