import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { LiveMaskingTranscript } from "@/components/meetings/live-masking-transcript";
import { MeetingDetailBody } from "@/components/meetings/meeting-detail-body";
import { Button } from "@/components/ui/button";
import { formatSeoulDateParts } from "@/lib/meeting-date";
import { meetingTopicKeywords } from "@/lib/meeting-keywords";
import {
  getMeetingTimeline,
  getMeetingTranscript,
  getRecentMeetings,
} from "@/lib/mock-loader";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (id === "live-mask") {
    return (
      <PageContainer>
        <LiveMaskingTranscript />
      </PageContainer>
    );
  }

  const meeting = getRecentMeetings().find((m) => m.id === id);
  if (!meeting) notFound();

  const timeline = getMeetingTimeline(id);
  const transcript = getMeetingTranscript(id);
  const { day, time } = formatSeoulDateParts(meeting.date);
  const keywords = meetingTopicKeywords(
    meeting.summaryTags,
    meeting.tags,
    4,
  );

  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl space-y-5">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              회의로 돌아가기
            </Link>
          </Button>

          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {meeting.title}
          </h1>

          {/* 가로 3칸 분산 대신 내용 너비로 촘촘히 */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="text-sm font-semibold tabular-nums tracking-tight text-foreground">
              {day}{" "}
              <span className="font-medium text-muted">{time}</span>
            </p>
            <span className="text-sm font-semibold text-foreground">
              {meeting.duration}
            </span>
          </div>
          {keywords.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="rounded-md bg-surface-2 px-2 py-0.5 text-xs font-semibold text-muted"
                >
                  {kw}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <MeetingDetailBody
          meeting={meeting}
          timeline={timeline}
          transcript={transcript}
          summary={timeline.overallSummary}
        />
      </div>
    </PageContainer>
  );
}
