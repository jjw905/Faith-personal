import { notFound } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { LiveMaskingTranscript } from "@/components/meetings/live-masking-transcript";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getRecentMeetings } from "@/lib/mock-loader";

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

  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-xs font-medium text-muted-2">회의 ID: {id}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
            {meeting.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            회의록 상세 화면입니다. 마스킹 검증은 좌측 &quot;개인정보
            마스킹&quot; 메뉴를 사용하세요.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">회의 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>상태: {meeting.status}</p>
            <p>일시: {meeting.date}</p>
            <p>참석: {meeting.participants?.length ?? 0}명</p>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
