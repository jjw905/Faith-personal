import { BarChart3, ScrollText } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getSecurityMetrics } from "@/lib/metrics-mock";

/** 감사 로그 + 기존 분석(트렌드/지표)을 한 화면으로. */
export default function AuditPage() {
  const metrics = getSecurityMetrics();
  const maxActivity = Math.max(...metrics.dailyActivity.map((d) => d.value));

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="감사 로그"
        description="팀 워크스페이스, 접근 기록, 보안 이벤트와 회의, 보안 추이를 함께 확인합니다."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ScrollText className="h-4 w-4 text-muted" />
              <CardTitle className="text-base">최근 이벤트</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              {
                t: "14:22",
                label: "회의록 열람",
                detail: "김철수 · 주간 보안 점검 회의",
              },
              {
                t: "13:05",
                label: "마스킹 적용",
                detail: "자동 규칙 · 전화/이메일 12건",
              },
              {
                t: "11:40",
                label: "다운로드 거부",
                detail: "권한 부족 · Level 1 사용자",
              },
              {
                t: "09:18",
                label: "로그인",
                detail: "cheolsu.kim@company.com",
              },
            ].map((row) => (
              <div
                key={`${row.t}-${row.label}`}
                className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{row.label}</p>
                  <p className="mt-0.5 truncate text-muted">{row.detail}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-2">{row.t}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted" />
              <CardTitle className="text-base">보안·회의 추이</CardTitle>
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
              <p className="mb-3 text-xs font-medium text-muted-2">
                주간 활동
              </p>
              <div className="flex h-24 items-end gap-2">
                {metrics.dailyActivity.map((d) => (
                  <div
                    key={d.day}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-md bg-primary/80"
                      style={{
                        height: `${Math.max(8, (d.value / maxActivity) * 100)}%`,
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
