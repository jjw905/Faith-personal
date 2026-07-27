import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { LiveMaskingTranscript } from "@/components/meetings/live-masking-transcript";
import { MeetingDetailBody } from "@/components/meetings/meeting-detail-body";
import { MeetingProcessBanner } from "@/components/meetings/meeting-process-banner";
import {
  MeetingDateTimeMeta,
  MeetingRecordActions,
  MeetingTitleHeading,
} from "@/components/meetings/meeting-record-actions";
import { MeetingCaptureChip } from "@/components/meetings/meeting-capture-label";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { canReadMeeting } from "@/lib/meeting-access";
import { meetingTopicKeywords } from "@/lib/meeting-keywords";
import {
  getMeetingById,
  getMeetingTimeline,
  getMeetingTranscript,
} from "@/lib/meetings-data";
import { getUserMeeting } from "@/lib/user-meetings-store";
import { requireUser } from "@/lib/require-user";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id === "live-mask") {
    await requireAdmin();
    return (
      <PageContainer white>
        <LiveMaskingTranscript />
      </PageContainer>
    );
  }

  const session = await requireUser();
  if (!session) notFound();
  const access = await canReadMeeting(id, session.user.id);
  if (!access.allowed) notFound();

  const meeting = getMeetingById(id);
  if (!meeting) notFound();

  const timeline = getMeetingTimeline(id);
  const transcript = getMeetingTranscript(id);
  const userRow = getUserMeeting(id);
  const keywords = meetingTopicKeywords(
    meeting.summaryTags,
    meeting.tags,
    4,
  );
  const processing =
    userRow &&
    (userRow.phase === "transcribing" || userRow.phase === "structuring");
  const failed = userRow?.phase === "error";
  const showProcessBanner = Boolean(
    userRow && userRow.phase !== "done",
  );
  const showDetailBody = !processing && !failed;
  const canEditMeta = Boolean(userRow);

  return (
    <PageContainer white>
      <div
        className={
          processing || failed
            ? "mx-auto flex min-h-[calc(100dvh-7rem)] max-w-3xl flex-col"
            : "mx-auto max-w-3xl space-y-5"
        }
      >
        <div className={processing || failed ? "shrink-0" : undefined}>
          <Button
            asChild
            variant="ghost"
            className="-ml-2 mb-3 h-12 gap-1.5 px-2 text-base font-semibold md:h-9 md:px-2.5 md:text-sm"
          >
            <Link href="/dashboard">
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
              돌아가기
            </Link>
          </Button>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <MeetingCaptureChip meeting={meeting} className="mb-3" />
              <MeetingTitleHeading
                meetingId={id}
                title={meeting.title}
                canEdit={canEditMeta}
              />
            </div>
            <MeetingRecordActions
              meetingId={id}
              tags={meeting.tags}
              meeting={meeting}
              timeline={timeline}
              transcript={transcript}
              summary={timeline.overallSummary}
            />
          </div>

          <MeetingDateTimeMeta
            meetingId={id}
            date={meeting.date}
            duration={meeting.duration}
            canEdit={canEditMeta}
          />
          {keywords.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-md bg-surface-2 px-2.5 py-1 text-base font-medium leading-5 text-muted"
                >
                  {kw}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {showProcessBanner ? (
          <MeetingProcessBanner
            meetingId={id}
            initialPhase={userRow!.phase}
            initialProgressPercent={userRow!.progressPercent}
          />
        ) : null}

        {showDetailBody ? (
          <div className="mt-5 space-y-5">
            <MeetingDetailBody
              meeting={meeting}
              timeline={timeline}
              transcript={transcript}
              canEditParticipants={canEditMeta}
            />
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
