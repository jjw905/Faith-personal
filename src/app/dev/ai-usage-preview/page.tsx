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
    <PageContainer>
      <div className="mx-auto w-full max-w-6xl">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-2">
          로컬 임시
        </p>
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-foreground">
          AI 사용량
        </h1>
        <AiUsageDashboard initial={summary} initialUsers={initialUsers} />
      </div>
    </PageContainer>
  );
}
