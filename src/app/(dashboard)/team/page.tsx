import { Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { TeamWorkspacePanel } from "@/components/team/team-workspace-panel";

export default function TeamPage() {
  return (
    <PageContainer soft>
      <div className="mx-auto w-full max-w-6xl">
        <Suspense
          fallback={
            <div className="grid min-h-56 place-items-center rounded-3xl bg-card shadow-[0_2px_10px_rgba(17,22,46,0.1),0_8px_28px_rgba(17,22,46,0.14)] ring-1 ring-border">
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
