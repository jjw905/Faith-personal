import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { TeamWorkspacePanel } from "@/components/team/team-workspace-panel";
import { TEAM_FEATURE_ENABLED } from "@/lib/feature-flags";

export default function TeamPage() {
  // 오픈 준비 기간에는 팀 기능을 열지 않는다. 코드·데이터는 그대로 두고
  // 진입 경로만 막는다. 다시 열 때는 TEAM_FEATURE_ENABLED만 true로 되돌리면 된다.
  if (!TEAM_FEATURE_ENABLED) {
    redirect("/dashboard");
  }

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
