import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PersonalVoiceRoom } from "@/components/meetings/personal-voice-room";
import { Button } from "@/components/ui/button";
import {
  getPersonalRealtimeMeeting,
  isPersonalRealtimeParticipant,
} from "@/lib/personal-realtime";
import { requireUser } from "@/lib/require-user";

export const dynamic = "force-dynamic";

export default async function PersonalRealtimeMeetingPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const session = await requireUser();
  if (!session) notFound();
  const { meetingId } = await params;
  const meeting = await getPersonalRealtimeMeeting(meetingId);
  if (
    !meeting ||
    !isPersonalRealtimeParticipant({
      meeting,
      userId: session.user.id,
    })
  ) {
    notFound();
  }

  return (
    <PageContainer white>
      <div className="mx-auto w-full max-w-6xl">
        <Button asChild variant="ghost" className="-ml-2 mb-3 min-h-12">
          <Link href="/dashboard">
            <ArrowLeft className="h-5 w-5" />
            개인 공간으로
          </Link>
        </Button>
        {["LOBBY", "ACTIVE"].includes(meeting.state) ? (
          <PersonalVoiceRoom meetingId={meeting.id} />
        ) : (
          <section className="grid min-h-72 place-items-center rounded-3xl bg-card p-8 text-center shadow-soft">
            <div>
              <h1 className="text-xl font-semibold">{meeting.title}</h1>
              <p className="mt-2 text-base text-muted">
                이미 종료된 개인 실시간 회의입니다.
              </p>
              {meeting.legacyMeetingId ? (
                <Button asChild className="mt-5 min-h-12 rounded-full">
                  <Link href={`/meetings/${meeting.legacyMeetingId}`}>
                    기록 보기
                  </Link>
                </Button>
              ) : null}
            </div>
          </section>
        )}
      </div>
    </PageContainer>
  );
}
