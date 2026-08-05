import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PageContainer } from "@/components/layout/page-container";
import { TeamWorkspacePanel } from "@/components/team/team-workspace-panel";
import { requireTeamFeatureUser } from "@/lib/team-feature-access";

export default async function TeamPage() {
  const gate = await requireTeamFeatureUser();
  if (!gate.ok) {
    redirect("/dashboard");
  }

  return (
    <PageContainer soft>
      <div className="mx-auto w-full max-w-6xl xl:max-w-7xl">
        <Suspense
          fallback={
            <div className="panel-surface grid min-h-56 place-items-center rounded-2xl bg-card">
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
