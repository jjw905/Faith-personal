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
import { requireUser } from "@/lib/require-user";
import { maskTeamMeeting, maskTeamTranscript } from "@/lib/team/masked-meeting-content";
import { getUserMeeting } from "@/lib/user-meetings-store";

export default async function MeetingChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const rawMeeting = getMeetingById(id);
  if (!rawMeeting) notFound();
  const names = rawMeeting.participants.map((participant) => participant.name);
  const meeting = access.maskedOnly
    ? maskTeamMeeting(rawMeeting, names)
    : rawMeeting;
  const rawTranscript = getMeetingTranscript(id);
  const transcript = access.maskedOnly
    ? maskTeamTranscript(rawTranscript, names)
    : rawTranscript;
  const audio = access.maskedOnly
    ? null
    : resolveMeetingReplayAudio({ meeting, transcript });
  const userRow = getUserMeeting(id);
  const canEditTitle = Boolean(
    userRow && userRow.userId === session.user.id,
  );

  return (
    <PageContainer
      white
      hideFooter
      className="min-h-0 flex-1 px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:px-3 lg:px-4 lg:pr-2"
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
