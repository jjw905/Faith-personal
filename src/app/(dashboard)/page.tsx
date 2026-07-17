import { AudioUploadZone } from "@/components/dashboard/audio-upload-zone";
import { DashboardSummary } from "@/components/dashboard/dashboard-summary";
import { RecentMeetingsTable } from "@/components/dashboard/recent-meetings-table";
import { SecurityStatusPanel } from "@/components/dashboard/security-status-panel";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { getRecentMeetings, getSecurityMetrics } from "@/lib/mock-loader";

export default function DashboardPage() {
  const meetings = getRecentMeetings();
  const securityMetrics = getSecurityMetrics();

  return (
    <PageContainer className="space-y-6">
      <PageHeader title="대시보드" />

      <DashboardSummary meetings={meetings} />

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
