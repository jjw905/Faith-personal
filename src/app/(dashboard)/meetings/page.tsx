import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { RecentMeetingsTable } from "@/components/dashboard/recent-meetings-table";
import { getRecentMeetings } from "@/lib/mock-loader";

export default function MeetingsPage() {
  const meetings = getRecentMeetings();

  return (
    <PageContainer>
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          title="회의 목록"
          description="등록된 회의를 검색하고 관리합니다."
        />
        <RecentMeetingsTable meetings={meetings} />
      </div>
    </PageContainer>
  );
}
