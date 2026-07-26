import { UserCog } from "lucide-react";

import { UsersAdminPanel } from "@/components/admin/users-admin-panel";
import { PageContainer } from "@/components/layout/page-container";
import { requireAdmin, listUsers } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireAdmin();
  const users = await listUsers();

  return (
    <PageContainer>
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <UserCog className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              사용자 관리
            </h1>
          </div>
        </div>

        <UsersAdminPanel
          currentUserId={session.user.id}
          initialUsers={users.map((u) => ({
            ...u,
            createdAt: u.createdAt.toISOString(),
          }))}
        />
      </div>
    </PageContainer>
  );
}
