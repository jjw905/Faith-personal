import { notFound } from "next/navigation";

import { AiUsageDashboard } from "@/components/admin/ai-usage-dashboard";
import { PageContainer } from "@/components/layout/page-container";
import { summarizeAiUsageWithFx } from "@/lib/stt/usage-fx";
import { listAiUsage } from "@/lib/stt/usage-store";

/** 로컬 렌더 검사용. 로그인 없이 AI 사용량 레이아웃 확인. */
export default async function AiUsagePreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const summary = await summarizeAiUsageWithFx(listAiUsage(5000));
  const initialUsers = summary.byUser.map((u) => ({
    id: u.userId,
    label: u.userId,
    usd: u.usd,
    krw: u.krw,
    jobs: u.jobs,
  }));

  return (
    <PageContainer soft>
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-foreground">
            AI 사용량
          </h1>
        </header>
        <AiUsageDashboard initial={summary} initialUsers={initialUsers} />
      </div>
    </PageContainer>
  );
}
