import { AdminPageChrome } from "@/components/admin/admin-page-chrome";
import {
  OpsStatsDashboard,
  type AiUsageUserOption,
} from "@/components/admin/ops-stats-dashboard";
import type { BlockedModerationRow } from "@/components/admin/pipeline-stats-dashboard";
import { requireAdmin } from "@/lib/admin";
import { parseStatsCategory } from "@/lib/stats-admin-category";
import { prisma } from "@/lib/prisma";
import {
  listPipelineAttempts,
  summarizePipelineStats,
} from "@/lib/stt/pipeline-stats-store";
import { summarizeSurveyStats } from "@/lib/stt/survey-stats";
import { summarizeAiUsageWithFx } from "@/lib/stt/usage-fx";
import { listAiUsage } from "@/lib/stt/usage-store";

export const dynamic = "force-dynamic";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const [usageEvents, pipelineEvents, blockedRows, surveySummary] =
    await Promise.all([
      listAiUsage(5000),
      listPipelineAttempts(5000),
      prisma.moderationFlag.findMany({
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
      }),
      summarizeSurveyStats(),
    ]);

  const usageSummary = await summarizeAiUsageWithFx(usageEvents);
  const pipelineSummary = summarizePipelineStats(pipelineEvents);

  const userIds = [...new Set(usageEvents.map((e) => e.userId))];
  const profiles = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const labelById = new Map(
    profiles.map((u) => [
      u.id,
      (u.name?.trim() || u.email?.trim() || u.id) as string,
    ]),
  );
  const initialUsers: AiUsageUserOption[] = usageSummary.byUser.map((u) => ({
    id: u.userId,
    label: labelById.get(u.userId) || u.userId,
    usd: u.usd,
    krw: u.krw,
    jobs: u.jobs,
  }));

  const blocked: BlockedModerationRow[] = blockedRows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <AdminPageChrome title="통계">
      <OpsStatsDashboard
        initialUsage={usageSummary}
        initialUsers={initialUsers}
        initialPipeline={pipelineSummary}
        initialBlocked={blocked}
        initialSurvey={surveySummary}
        initialCategory={parseStatsCategory(params.cat)}
      />
    </AdminPageChrome>
  );
}
