import Link from "next/link";
import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { MeetingAccessNotice } from "@/components/meetings/meeting-access-notice";
import { LiveMaskingTranscript } from "@/components/meetings/live-masking-transcript";
import { MeetingDetailHeader } from "@/components/meetings/meeting-detail-header";
import { MeetingProcessBanner } from "@/components/meetings/meeting-process-banner";
import { requireAdmin } from "@/lib/admin";
import { canReadMeeting } from "@/lib/meeting-access";
import { meetingTopicKeywords } from "@/lib/meeting-keywords";
import { resolveMeetingShareMask } from "@/lib/meeting-share";
import {
  getMeetingById,
  getMeetingTimeline,
  getMeetingTranscript,
} from "@/lib/meetings-data";
import {
  maskTeamMeeting,
  maskTeamTimeline,
  maskTeamTranscript,
} from "@/lib/team/masked-meeting-content";
import { getUserMeeting } from "@/lib/user-meetings-store";
import { requireUser } from "@/lib/require-user";

export default async function MeetingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mask?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;

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
  if (!access.allowed && access.acknowledgementRequired) {
    return (
      <PageContainer white>
        <MeetingAccessNotice />
      </PageContainer>
    );
  }
  if (!access.allowed) notFound();

  const rawMeeting = await getMeetingById(id);
  if (!rawMeeting) notFound();
  const names = rawMeeting.participants.map((participant) => participant.name);
  const requestedMask = resolveMeetingShareMask(query.mask);
  const displayMask = access.maskedOnly ? "partial" : requestedMask;
  const meeting =
    displayMask && displayMask !== "off"
      ? maskTeamMeeting(rawMeeting, names, displayMask)
      : rawMeeting;
  const rawTimeline = await getMeetingTimeline(id);
  const rawTranscript = await getMeetingTranscript(id);
  const timeline =
    displayMask && displayMask !== "off"
      ? maskTeamTimeline(rawTimeline, names, displayMask)
      : rawTimeline;
  const transcript =
    displayMask && displayMask !== "off"
      ? maskTeamTranscript(rawTranscript, names, displayMask)
      : rawTranscript;
  const userRow = await getUserMeeting(id);
  const keywords = meetingTopicKeywords(
    meeting.summaryTags,
    meeting.tags,
    4,
  );
  const processing =
    userRow &&
    (userRow.phase === "transcribing" || userRow.phase === "structuring");
  const failed = userRow?.phase === "error" || userRow?.phase === "empty";
  const showProcessBanner = Boolean(
    userRow && userRow.phase !== "done",
  );
  const showDetailBody = !processing && !failed;
  const canEditMeta = Boolean(
    userRow && userRow.userId === session.user.id,
  );
  const fillHeight = Boolean(processing || failed);

  return (
    <MeetingDetailHeader
      meetingId={id}
      meeting={meeting}
      timeline={timeline}
      transcript={transcript}
      canEdit={canEditMeta}
      processing={Boolean(processing)}
      keywords={keywords}
      fillHeight={fillHeight}
      wide={!fillHeight && showDetailBody}
      showDetailBody={showDetailBody}
      canEditParticipants={canEditMeta}
    >
      {showProcessBanner ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <MeetingProcessBanner
            meetingId={id}
            initialPhase={userRow!.phase}
            initialProgressPercent={userRow!.progressPercent}
            initialErrorMessage={userRow!.errorMessage}
            initialStageLabel={userRow!.stageLabel}
          />
        </div>
      ) : null}
    </MeetingDetailHeader>
  );
}
