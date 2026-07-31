import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { TeamAuditPanel } from "@/components/team/team-audit-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getSecurityMetrics } from "@/lib/metrics-mock";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

/** 팀 감사 로그와 보안 추이. OWNER만 진입. */
export default async function AuditPage() {
  const session = await requireUser();
  if (!session) redirect("/login");

  const ownedTeam = await prisma.teamMember.findFirst({
    where: { userId: session.user.id, role: "OWNER" },
    select: { id: true },
  });
  if (!ownedTeam) {
    redirect("/team");
  }

  const metrics = getSecurityMetrics();
  const maxActivity = Math.max(...metrics.dailyActivity.map((d) => d.value));

  return (
    <PageContainer soft className="space-y-6">
      <PageHeader title="감사 로그" description="팀 운영, 접근 기록" />

      <TeamAuditPanel />

      <Card>
        <CardHeader className="space-y-0 px-6 pb-0 pt-6">
          <CardTitle className="text-xl font-bold tracking-tight">
            보안 추이
          </CardTitle>
          <div className="mt-3 h-0.5 w-full bg-foreground" aria-hidden />
        </CardHeader>
        <CardContent className="space-y-5 px-6 pb-6 pt-4">
          <div className="space-y-3">
            {metrics.metrics.map((metric) => (
              <div key={metric.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-base">
                  <span className="text-muted">{metric.label}</span>
                  <span className="font-semibold text-foreground">
                    {metric.value}%
                  </span>
                </div>
                <Progress value={metric.value} />
              </div>
            ))}
          </div>

          <div>
            <p className="mb-3 text-base font-medium text-muted">주간 활동</p>
            <div className="flex h-24 items-end gap-2">
              {metrics.dailyActivity.map((d) => (
                <div
                  key={d.day}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    className="w-full rounded-md bg-primary/80"
                    style={{
                      height: `${maxActivity ? Math.max(8, (d.value / maxActivity) * 100) : 8}%`,
                    }}
                  />
                  <span className="text-base text-muted-2">{d.day}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </PageContainer>
  );
}
