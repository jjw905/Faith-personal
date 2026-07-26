import { BarChart3 } from "lucide-react";
import { redirect } from "next/navigation";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { TeamAuditPanel } from "@/components/team/team-audit-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getSecurityMetrics } from "@/lib/metrics-mock";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/require-user";

/** 팀 감사 로그와 기존 분석(트렌드/지표)을 한 화면으로. OWNER만 진입. */
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
    <PageContainer className="space-y-6">
      <PageHeader
        title="감사 로그"
        description="팀 워크스페이스, 접근 기록, 보안 이벤트와 회의, 보안 추이를 함께 확인합니다."
      />

      <TeamAuditPanel />

      <div className="grid gap-6 lg:grid-cols-1">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted" />
              <CardTitle className="text-base">보안, 회의 추이</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-3">
              {metrics.metrics.map((metric) => (
                <div key={metric.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
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
              <p className="mb-3 text-xs font-medium text-muted-2">주간 활동</p>
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
                    <span className="text-[10px] text-muted-2">{d.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
