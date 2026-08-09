import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { MeetingAccessNotice } from "@/components/meetings/meeting-access-notice";
import { MeetingChatReplay } from "@/components/meetings/meeting-chat-replay";
import { canReadMeeting } from "@/lib/meeting-access";
import {
  getMeetingById,
  getMeetingTranscript,
} from "@/lib/meetings-data";
import { resolveMeetingReplayAudio } from "@/lib/meeting-replay-audio";
import { resolveMeetingShareMask } from "@/lib/meeting-share";
import { requireUser } from "@/lib/require-user";
import { maskTeamMeeting, maskTeamTranscript } from "@/lib/team/masked-meeting-content";
import { getUserMeeting } from "@/lib/user-meetings-store";

export default async function MeetingChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mask?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const session = await requireUser();
  if (!session) notFound();

  const access = await canReadMeeting(id, session.user.id);
  if (!access.allowed && access.acknowledgementRequired) {
    return (
      <PageContainer white hideFooter>
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
  const rawTranscript = await getMeetingTranscript(id);
  const transcript =
    displayMask && displayMask !== "off"
      ? maskTeamTranscript(rawTranscript, names, displayMask)
      : rawTranscript;
  const audio = access.maskedOnly
    ? null
    : await resolveMeetingReplayAudio({ meeting, transcript });
  const userRow = await getUserMeeting(id);
  const canEditTitle = Boolean(
    userRow && userRow.userId === session.user.id,
  );

  return (
    <PageContainer
      white
      hideFooter
      className="min-h-0 flex-1 pb-[max(0.25rem,env(safe-area-inset-bottom))]"
    >
      <Suspense fallback={null}>
        <MeetingChatReplay
          meeting={meeting}
          transcript={transcript}
          audioSrc={audio?.src}
          audioLabel={audio?.label}
          canEditTitle={canEditTitle}
        />
      </Suspense>
    </PageContainer>
  );
}
