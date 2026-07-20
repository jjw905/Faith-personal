import { UserCog } from "lucide-react";

import { UsersAdminPanel } from "@/components/admin/users-admin-panel";
import { requireAdmin, listUsers } from "@/lib/admin";

export default async function UsersPage() {
  const session = await requireAdmin();
  const users = await listUsers();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <UserCog className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            사용자 관리
          </h1>
          <p className="mt-1 text-sm text-muted">
            서비스를 이용하는 계정, 역할, 인증, 활성 상태를 관리합니다.
          </p>
        </div>
      </div>

      <UsersAdminPanel
        currentUserId={session.user.id}
        initialUsers={users.map((u) => ({
          ...u,
          emailVerified: u.emailVerified?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
