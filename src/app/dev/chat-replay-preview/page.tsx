import { notFound } from "next/navigation";
import { Suspense } from "react";

import { MeetingChatReplay } from "@/components/meetings/meeting-chat-replay";
import {
  getMeetingById,
  getMeetingTranscript,
} from "@/lib/meetings-data";
import { resolveMeetingReplayAudio } from "@/lib/meeting-replay-audio";

/** 로컬 음성+대사 다시듣기 렌더 검수. */
export default function ChatReplayPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const meeting = getMeetingById("mtg-001");
  if (!meeting) notFound();
  const transcript = getMeetingTranscript("mtg-001");
  const audio = resolveMeetingReplayAudio({ meeting, transcript });

  return (
    <div className="min-h-screen bg-background p-4 sm:p-6">
      <Suspense fallback={null}>
        <MeetingChatReplay
          meeting={meeting}
          transcript={transcript}
          audioSrc={audio?.src}
          audioLabel={audio?.label}
        />
      </Suspense>
    </div>
  );
}
