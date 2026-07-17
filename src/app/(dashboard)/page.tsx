import { AudioUploadZone } from "@/components/dashboard/audio-upload-zone";
import { RecentMeetingsTable } from "@/components/dashboard/recent-meetings-table";
import { SecurityStatusPanel } from "@/components/dashboard/security-status-panel";
import { StatCards } from "@/components/dashboard/stat-cards";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import {
  getDashboardStats,
  getRecentMeetings,
  getSecurityMetrics,
} from "@/lib/mock-loader";

export default function DashboardPage() {
  const stats = getDashboardStats();
  const meetings = getRecentMeetings();
  const securityMetrics = getSecurityMetrics();

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="대시보드"
        description="회의, 보안 지표를 한눈에 확인합니다."
      />

      <StatCards stats={stats} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <AudioUploadZone />
        </div>
        <div className="lg:col-span-1">
          <SecurityStatusPanel data={securityMetrics} />
        </div>
      </div>

      <RecentMeetingsTable meetings={meetings} />
    </PageContainer>
  );
}
