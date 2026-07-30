import { PipelineStatsDashboard } from "@/components/admin/pipeline-stats-dashboard";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  listPipelineAttempts,
  summarizePipelineStats,
} from "@/lib/stt/pipeline-stats-store";

export const dynamic = "force-dynamic";

export default async function PipelineStatsPage() {
  await requireAdmin();
  const events = listPipelineAttempts(5000);
  const summary = summarizePipelineStats(events);
  const blockedRows = await prisma.moderationFlag.findMany({
    where: { blocked: true },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      userId: true,
      meetingId: true,
      categories: true,
      maxScore: true,
      createdAt: true,
    },
  });
  const blocked = blockedRows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <PageContainer soft>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
            파이프라인 통계
          </h1>
        </header>

        <PipelineStatsDashboard initial={summary} initialBlocked={blocked} />
      </div>
    </PageContainer>
  );
}
