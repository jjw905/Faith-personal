import { notFound } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { MeetingChatReplay } from "@/components/meetings/meeting-chat-replay";
import {
  getMeetingTranscript,
  getRecentMeetings,
} from "@/lib/mock-loader";

export default async function MeetingChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const meeting = getRecentMeetings().find((m) => m.id === id);
  if (!meeting) notFound();

  const transcript = getMeetingTranscript(id);

  return (
    <PageContainer>
      <Suspense fallback={null}>
        <MeetingChatReplay meeting={meeting} transcript={transcript} />
      </Suspense>
    </PageContainer>
  );
}
