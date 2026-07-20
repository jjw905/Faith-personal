import { UsersRound } from "lucide-react";

import { PageContainer } from "@/components/layout/page-container";
import { TeamManagePanel } from "@/components/team/team-manage-panel";

export default function TeamPage() {
  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-6 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <UsersRound className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              팀 관리
            </h1>
            <p className="mt-1 text-sm text-muted">
              팀 멤버와 팀 운영 설정을 관리합니다.
            </p>
          </div>
        </div>

        <TeamManagePanel />
      </div>
    </PageContainer>
  );
}
