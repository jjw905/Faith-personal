import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { LiveMaskingTranscript } from "@/components/meetings/live-masking-transcript";
import { MeetingTimelineView } from "@/components/meetings/meeting-timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMeetingTimeline, getRecentMeetings } from "@/lib/mock-loader";

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

  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/dashboard">
              <ArrowLeft className="h-4 w-4" />
              회의로 돌아가기
            </Link>
          </Button>
          <div className="flex flex-wrap gap-1.5">
            {meeting.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-surface px-2 py-0.5 text-xs font-medium text-muted"
              >
                {tag}
              </span>
            ))}
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">
            {meeting.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            녹음 구간을 분석해 타임라인 요약을 제공합니다.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">회의 정보</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <div className="flex items-center gap-1.5">
              <span>상태:</span>
              <Badge variant="secondary">
                {meeting.status === "completed"
                  ? "완료"
                  : meeting.status === "in_progress"
                    ? "처리 중"
                    : "예정"}
              </Badge>
            </div>
            <p>
              일시:{" "}
              {new Date(
                /[zZ]|[+-]\d{2}:\d{2}$/.test(meeting.date)
                  ? meeting.date
                  : `${meeting.date}+09:00`,
              ).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
            </p>
            <p>길이: {meeting.duration}</p>
            <p>참석: {meeting.participants.length}명</p>
          </CardContent>
        </Card>

        <MeetingTimelineView timeline={timeline} />
      </div>
    </PageContainer>
  );
}
