import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { TeamVoiceRoom } from "@/components/meetings/team-voice-room";
import { Button } from "@/components/ui/button";
import { canReadMeeting } from "@/lib/meeting-access";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";
import { deriveMeetingState } from "@/lib/team/meeting-lifecycle";
import { reconcileTeamMeeting } from "@/lib/team/reconcile-meeting";

export default async function TeamMeetingPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const session = await requireUser();
  if (!session) notFound();
  const { meetingId } = await params;
  await reconcileTeamMeeting(meetingId);
  const access = await canReadMeeting(meetingId, session.user.id);
  if (!access.allowed) notFound();
  const meeting =
    access.teamMeeting ??
    (await prisma.teamMeeting.findUnique({ where: { id: meetingId } }));
  if (!meeting) notFound();

  const participant = await prisma.teamMeetingAccess.findUnique({
    where: {
      meetingId_userId: { meetingId: meeting.id, userId: session.user.id },
    },
  });
  const derived = deriveMeetingState(meeting);
  const canJoin =
    meeting.mode === "ONLINE" &&
    meeting.state !== "CANCELED" &&
    meeting.state !== "ENDED" &&
    derived.canJoin &&
    (meeting.organizerId === session.user.id ||
      meeting.createdById === session.user.id ||
      participant?.isParticipant);

  const waitingBeforeJoin =
    derived.phase === "scheduled" &&
    (meeting.organizerId === session.user.id ||
      meeting.createdById === session.user.id ||
      participant?.isParticipant);

  return (
    <PageContainer white>
      <div className="mx-auto w-full max-w-6xl">
        <Button asChild variant="ghost" className="-ml-2 mb-3 min-h-12">
          <Link href="/team">
            <ArrowLeft className="h-5 w-5" />팀 공간으로
          </Link>
        </Button>
        {canJoin ? (
          <TeamVoiceRoom
            teamMeetingId={meeting.id}
            title={meeting.title}
            initialPhase={derived.phase}
          />
        ) : waitingBeforeJoin ? (
          <section className="rounded-2xl bg-card p-6 shadow-soft sm:p-8">
            <span className="inline-flex min-h-10 items-center rounded-full bg-surface px-3 text-sm font-semibold text-muted">
              대기
            </span>
            <h1 className="mt-3 text-xl font-semibold">{meeting.title}</h1>
            <p className="mt-2 text-base text-muted">
              입장 가능 시각 전입니다.
            </p>
          </section>
        ) : (
          <section className="grid min-h-72 place-items-center rounded-2xl bg-card p-8 text-center shadow-soft">
            <div>
              <h1 className="text-xl font-semibold">{meeting.title}</h1>
              <p className="mt-2 text-base text-muted">
                {meeting.state === "CANCELED"
                  ? "취소된 회의입니다."
                  : meeting.endReason === "ORGANIZER_ABSENT"
                    ? "주최자 부재로 종료"
                    : meeting.state === "ENDED"
                      ? "종료된 회의입니다."
                      : "회의 참가 권한이 없습니다."}
              </p>
            </div>
          </section>
        )}
      </div>
    </PageContainer>
  );
}
