import { SurveyStatsDashboard } from "@/components/admin/survey-stats-dashboard";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin } from "@/lib/admin";
import { summarizeSurveyStats } from "@/lib/stt/survey-stats";

export const dynamic = "force-dynamic";

export default async function SurveyStatsPage() {
  await requireAdmin();
  const summary = await summarizeSurveyStats();

  return (
    <PageContainer soft>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-none tracking-tight text-foreground">
            수요조사 통계
          </h1>
        </header>

        <SurveyStatsDashboard initial={summary} />
      </div>
    </PageContainer>
  );
}
