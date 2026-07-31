import { OperationsStatusPanel } from "@/components/admin/operations-status-panel";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin } from "@/lib/admin";
import { getOperationsReadiness } from "@/lib/operations-readiness";
import { getTeamRetentionPreview } from "@/lib/team/retention";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  await requireAdmin();
  const [readiness, retention] = await Promise.all([
    Promise.resolve(getOperationsReadiness()),
    getTeamRetentionPreview(),
  ]);

  return (
    <PageContainer soft className="pt-6 sm:pt-8">
      <div className="mx-auto w-full max-w-6xl min-w-0 space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            운영 상태
          </h1>
          <p className="mt-1 text-base leading-6 text-muted">
            서비스 제공에 필요한 연결, 정책, 보존 작업을 확인하고 실행합니다.
          </p>
        </header>
        <OperationsStatusPanel
          initialReadiness={readiness}
          initialRetention={retention}
        />
      </div>
    </PageContainer>
  );
}
