import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { MeetingChatReplay } from "@/components/meetings/meeting-chat-replay";
import {
  getMeetingById,
  getMeetingTranscript,
} from "@/lib/meetings-data";
import { resolveMeetingReplayAudio } from "@/lib/meeting-replay-audio";

export default async function MeetingChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meeting = getMeetingById(id);
  if (!meeting) notFound();

  const transcript = getMeetingTranscript(id);
  const audio = resolveMeetingReplayAudio({ meeting, transcript });

  return (
    <PageContainer>
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
