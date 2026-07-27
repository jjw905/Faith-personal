import { UsersAdminPanel } from "@/components/admin/users-admin-panel";
import { PageContainer } from "@/components/layout/page-container";
import { countUserStats, listUsersPage, requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireAdmin();
  const [pageResult, stats] = await Promise.all([
    listUsersPage({ page: 1, pageSize: 9 }),
    countUserStats(),
  ]);

  return (
    <PageContainer soft className="pt-6 sm:pt-8">
      <div className="mx-auto w-full max-w-6xl min-w-0">
        <header className="mb-5 sm:mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-2xl">
            사용자 관리
          </h1>
          <p className="mt-0.5 text-base text-muted">{stats.total}명 등록</p>
        </header>

        <UsersAdminPanel
          currentUserId={session.user.id}
          initialUsers={pageResult.users.map((u) => ({
            ...u,
            createdAt: u.createdAt.toISOString(),
            planUntil: u.planUntil ? u.planUntil.toISOString() : null,
            disabledUntil: u.disabledUntil
              ? u.disabledUntil.toISOString()
              : null,
          }))}
          initialTotal={pageResult.total}
          initialStats={stats}
          initialPage={pageResult.page}
          initialPageSize={pageResult.pageSize}
        />
      </div>
    </PageContainer>
  );
}
