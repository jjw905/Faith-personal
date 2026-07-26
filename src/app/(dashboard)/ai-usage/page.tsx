import { Gauge } from "lucide-react";

import {
  AiUsageDashboard,
  type AiUsageUserOption,
} from "@/components/admin/ai-usage-dashboard";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { summarizeAiUsageWithFx } from "@/lib/stt/usage-fx";
import { listAiUsage } from "@/lib/stt/usage-store";

export const dynamic = "force-dynamic";

export default async function AiUsagePage() {
  await requireAdmin();
  const events = listAiUsage(5000);
  const summary = await summarizeAiUsageWithFx(events);

  const userIds = [...new Set(events.map((e) => e.userId))];
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
  const initialUsers: AiUsageUserOption[] = summary.byUser.map((u) => ({
    id: u.userId,
    label: labelById.get(u.userId) || u.userId,
    usd: u.usd,
    krw: u.krw,
    jobs: u.jobs,
  }));

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-6xl">
        <header className="mb-4 flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-soft text-primary">
            <Gauge className="h-5 w-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-muted-2">
              개발전용
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              AI 사용량
            </h1>
          </div>
        </header>

        <AiUsageDashboard initial={summary} initialUsers={initialUsers} />
      </div>
    </PageContainer>
  );
}
