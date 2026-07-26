import { Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { TeamWorkspacePanel } from "@/components/team/team-workspace-panel";

export default function TeamPage() {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-6xl">
        <Suspense
          fallback={
            <div className="grid min-h-56 place-items-center rounded-2xl bg-card shadow-soft">
              <p className="text-base text-muted">불러오는 중</p>
            </div>
          }
        >
          <TeamWorkspacePanel />
        </Suspense>
      </div>
    </PageContainer>
  );
}
