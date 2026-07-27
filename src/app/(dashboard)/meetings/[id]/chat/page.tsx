import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { MeetingChatReplay } from "@/components/meetings/meeting-chat-replay";
import { canReadMeeting } from "@/lib/meeting-access";
import {
  getMeetingById,
  getMeetingTranscript,
} from "@/lib/meetings-data";
import { resolveMeetingReplayAudio } from "@/lib/meeting-replay-audio";
import { requireUser } from "@/lib/require-user";

export default async function MeetingChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireUser();
  if (!session) notFound();

  const access = await canReadMeeting(id, session.user.id);
  if (!access.allowed) notFound();

  const meeting = getMeetingById(id);
  if (!meeting) notFound();

  const transcript = getMeetingTranscript(id);
  const audio = resolveMeetingReplayAudio({ meeting, transcript });

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
        />
      </Suspense>
    </PageContainer>
  );
}
